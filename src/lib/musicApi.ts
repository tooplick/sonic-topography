export interface SearchResult {
  name: string;
  artist: string;
  album: string;
  url: string;   // meting API URL containing song ID
  pic: string;   // meting API URL containing pic ID
  lrc: string;   // meting API URL for lyrics
}

export interface ParsedSong {
  id: string;
  name: string;
  artist: string;
  album: string;
  picId: string;
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

function extractId(url: string, type: string): string {
  // Extract ID from meting URL like: https://api.qijieya.cn/meting/?server=netease&type=url&id=210049
  try {
    const u = new URL(url);
    return u.searchParams.get('id') || '';
  } catch {
    return '';
  }
}

export function parseSearchResult(result: SearchResult): ParsedSong {
  return {
    id: extractId(result.url, 'url'),
    name: result.name || '',
    artist: result.artist || '',
    album: result.album || '',
    picId: extractId(result.pic, 'pic'),
  };
}

export async function searchMusic(keyword: string, limit = 20, page = 1): Promise<SearchResult[]> {
  const url = `${API_BASE}/search?id=${encodeURIComponent(keyword)}&limit=${limit}&page=${page}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

// Returns the Worker proxy URL for audio streaming
export function getAudioUrl(id: string): string {
  return `${API_BASE}/audio?id=${id}`;
}

// Returns the Worker proxy URL for cover art (direct image)
export function getSongPicSrc(picId: string, size = 500): string {
  if (!picId) return '';
  return `${API_BASE}/pic?id=${picId}&cover=${size}`;
}

// Resolve pic meting URL to direct CDN URL via worker
const picUrlCache = new Map<string, string>();

export async function resolvePicUrl(picId: string, size = 300): Promise<string> {
  if (!picId) return '';
  const cacheKey = `${picId}_${size}`;
  if (picUrlCache.has(cacheKey)) return picUrlCache.get(cacheKey)!;
  try {
    const res = await fetch(`${API_BASE}/pic?id=${picId}&resolve=1&cover=${size}`);
    if (!res.ok) return '';
    const data = await res.json();
    if (data.url) {
      picUrlCache.set(cacheKey, data.url);
      return data.url;
    }
  } catch {}
  return '';
}
