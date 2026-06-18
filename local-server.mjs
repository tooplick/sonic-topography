import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT || 4173);

const neteaseHeaders = {
  Referer: 'https://music.163.com/',
  'User-Agent': 'Mozilla/5.0',
};

const playableUrlCache = new Map();
const searchCache = new Map();
const playableUrlCacheTtl = 1000 * 60 * 10;
const searchCacheTtl = 1000 * 60 * 5;

async function getNeteasePlayableUrl(id) {
  const cached = playableUrlCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const url = `https://music.163.com/api/song/enhance/player/url?id=${encodeURIComponent(id)}&ids=%5B${encodeURIComponent(id)}%5D&br=320000`;
  const response = await fetch(url, { headers: neteaseHeaders });
  const data = await response.json();
  const playableUrl = data?.data?.[0]?.url || null;
  playableUrlCache.set(id, { url: playableUrl, expiresAt: Date.now() + playableUrlCacheTtl });
  return playableUrl;
}

async function filterPlayableSongs(rawSongs, resultLimit) {
  const playableSongs = [];
  const batchSize = 8;

  for (let i = 0; i < rawSongs.length && playableSongs.length < resultLimit; i += batchSize) {
    const batch = rawSongs.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(async (song) => ({
      song,
      playableUrl: await getNeteasePlayableUrl(String(song.id)),
    })));

    for (const result of results) {
      if (result.playableUrl) playableSongs.push(result.song);
      if (playableSongs.length >= resultLimit) break;
    }
  }

  return playableSongs;
}

const app = express();

app.get('/api/netease/search', async (req, res) => {
  try {
    const keywords = String(req.query.keywords || '').trim();
    const requestedLimit = Number(req.query.limit || '12');
    const resultLimit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 20)) : 12;

    if (!keywords) {
      res.status(400).json({ error: 'Missing keywords' });
      return;
    }

    const cacheKey = `${keywords.toLowerCase()}::${resultLimit}`;
    const cached = searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({ songs: cached.songs, cached: true });
      return;
    }

    const body = new URLSearchParams({
      s: keywords,
      type: '1',
      offset: '0',
      total: 'true',
      limit: String(Math.min(resultLimit * 3, 60)),
    });

    const response = await fetch('https://music.163.com/api/search/get/web', {
      method: 'POST',
      headers: {
        ...neteaseHeaders,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const data = await response.json();
    const rawSongs = (data?.result?.songs || []).map((song) => ({
      id: song.id,
      name: song.name,
      artist: (song.artists || []).map((artist) => artist.name).filter(Boolean).join(' / '),
      album: song.album?.name || '',
      duration: song.duration || 0,
      fee: song.fee,
    }));
    const songs = await filterPlayableSongs(rawSongs, resultLimit);
    searchCache.set(cacheKey, { songs, expiresAt: Date.now() + searchCacheTtl });

    res.json({ songs });
  } catch (error) {
    res.status(500).json({ error: 'Netease search failed' });
  }
});

app.get('/api/netease/lyric', async (req, res) => {
  try {
    const id = String(req.query.id || '');
    if (!id) {
      res.status(400).json({ error: 'Missing id' });
      return;
    }

    const response = await fetch(`https://music.163.com/api/song/lyric?id=${encodeURIComponent(id)}&lv=-1&kv=-1&tv=-1`, {
      headers: neteaseHeaders,
    });
    const data = await response.json();
    res.json({
      lyric: data?.lrc?.lyric || '',
      translatedLyric: data?.tlyric?.lyric || '',
    });
  } catch (error) {
    res.status(500).json({ error: 'Netease lyric failed' });
  }
});

app.get('/api/netease/url', async (req, res) => {
  try {
    const id = String(req.query.id || '');
    if (!id) {
      res.status(400).json({ error: 'Missing id' });
      return;
    }

    res.json({ url: await getNeteasePlayableUrl(id) });
  } catch (error) {
    res.status(500).json({ error: 'Netease url failed' });
  }
});

app.get('/api/netease/audio', async (req, res) => {
  try {
    const id = String(req.query.id || '');
    if (!id) {
      res.status(400).json({ error: 'Missing id' });
      return;
    }

    const playableUrl = await getNeteasePlayableUrl(id);
    if (!playableUrl) {
      res.status(404).json({ error: 'No playable url for this song' });
      return;
    }

    const headers = { ...neteaseHeaders };
    if (req.headers.range) headers.Range = req.headers.range;

    const audioResponse = await fetch(playableUrl, { headers });
    res.status(audioResponse.status);
    ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((header) => {
      const value = audioResponse.headers.get(header);
      if (value) res.setHeader(header, value);
    });

    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'audio/mpeg');
    if (audioResponse.body) {
      const reader = audioResponse.body.getReader();
      const pump = async () => {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          return;
        }
        res.write(Buffer.from(value), pump);
      };
      pump();
    } else {
      res.end();
    }
  } catch (error) {
    res.status(500).json({ error: 'Netease audio proxy failed' });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Sonic Topography is running at http://127.0.0.1:${port}`);
});
