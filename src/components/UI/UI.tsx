import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, SkipForward, SkipBack, Palette, Plus, ListMusic, Shuffle, Repeat, Repeat1, Trash2, Heart, Search } from 'lucide-react';
import { engine } from '../../lib/AudioEngine';
import { themes } from '../../lib/themes';
import { searchMusic, getAudioUrl, getSongPicSrc, parseSearchResult, resolvePicUrl, SearchResult, ParsedSong } from '../../lib/musicApi';
import { TriggerPreset } from '../../lib/AudioEngine';

interface UIProps {
  theme: string;
  onThemeChange: (theme: string) => void;
}

interface Song {
  id: string;
  name: string;
  artist: string;
  album?: string;
  picId?: string;
}

interface SavedPlaylist {
  id: string;
  name: string;
  songs: Song[];
}

type PlayMode = 'sequence' | 'shuffle' | 'repeat-one';
type PendingDelete =
  | { type: 'song'; playlistId: string; songId: string; label: string }
  | { type: 'playlist'; playlistId: string; label: string };

const STORAGE_KEY = 'sonic_topography_playlists';

function loadPlaylists(): SavedPlaylist[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [{ id: 'default', name: 'Favorites', songs: [] }];
}

function savePlaylists(list: SavedPlaylist[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function UI({ theme, onThemeChange }: UIProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackName, setTrackName] = useState<string>('No track selected');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [showFreqPanel, setShowFreqPanel] = useState(false);
  const [showPlaylistPanel, setShowPlaylistPanel] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [playlists, setPlaylists] = useState<SavedPlaylist[]>(loadPlaylists);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [playMode, setPlayMode] = useState<PlayMode>('sequence');
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [currentSongList, setCurrentSongList] = useState<Song[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showAddPlaylist, setShowAddPlaylist] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchPage, setSearchPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Persist playlists
  useEffect(() => { savePlaylists(playlists); }, [playlists]);

  // Focus search input when panel opens
  useEffect(() => {
    if (showSearchPanel) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [showSearchPanel]);

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true);
    setSearchError('');
    setSearchPage(1);
    try {
      const results = await searchMusic(q, 20, 1);
      setSearchResults(results);
      setHasMore(results.length >= 20);
    } catch (e: any) {
      setSearchError(e.message || 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  const loadMore = async () => {
    if (searchLoading || !hasMore) return;
    const q = searchQuery.trim();
    if (!q) return;
    const nextPage = searchPage + 1;
    setSearchLoading(true);
    try {
      const results = await searchMusic(q, 20, nextPage);
      setSearchResults(prev => [...prev, ...results]);
      setSearchPage(nextPage);
      setHasMore(results.length >= 20);
    } catch (e: any) {
      setSearchError(e.message || 'Load more failed');
    } finally {
      setSearchLoading(false);
    }
  };

  const playSong = (song: Song, songList?: Song[]) => {
    if (songList) setCurrentSongList(songList);

    // Same song already playing - only switch playlist
    if (song.id === currentSongId) return;

    setCurrentSongId(song.id);
    const displayTitle = song.artist ? `${song.name} - ${song.artist}` : song.name;
    setTrackName(displayTitle);

    // MediaSession metadata
    if ('mediaSession' in navigator) {
      const hqPic = song.picId ? getSongPicSrc(song.picId, 800) : '';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.name,
        artist: song.artist || undefined,
        album: song.album || undefined,
        artwork: hqPic ? [
          { src: hqPic, sizes: '800x800', type: 'image/jpeg' },
        ] : [],
      });
    }

    // Play audio
    const audioUrl = getAudioUrl(song.id);
    engine.init();
    engine.loadUrl(audioUrl);
    engine.play();
  };

  const playSearchResult = (result: SearchResult) => {
    const parsed = parseSearchResult(result);
    const song: Song = {
      id: parsed.id,
      name: parsed.name,
      artist: parsed.artist,
      album: parsed.album,
      picId: parsed.picId,
    };
    playSong(song, searchResults.map(r => {
      const p = parseSearchResult(r);
      return { id: p.id, name: p.name, artist: p.artist, album: p.album, picId: p.picId };
    }));
  };

  // Playlist operations
  const createPlaylist = () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    const newPlaylist: SavedPlaylist = { id: Date.now().toString(), name, songs: [] };
    setPlaylists(prev => [...prev, newPlaylist]);
    setNewPlaylistName('');
    setShowAddPlaylist(false);
    setActivePlaylistId(newPlaylist.id);
  };

  const deletePlaylist = (playlistId: string) => {
    setPlaylists(prev => prev.filter(p => p.id !== playlistId));
    if (activePlaylistId === playlistId) setActivePlaylistId(null);
  };

  const addSongToPlaylist = (playlistId: string, song: Song) => {
    setPlaylists(prev => prev.map(p => {
      if (p.id !== playlistId) return p;
      if (p.songs.some(s => s.id === song.id)) return p;
      return { ...p, songs: [...p.songs, song] };
    }));
  };

  const removeSongFromPlaylist = (playlistId: string, songId: string) => {
    setPlaylists(prev => prev.map(p =>
      p.id === playlistId ? { ...p, songs: p.songs.filter(s => s.id !== songId) } : p
    ));
  };

  const favoriteSong = (song: Song) => {
    if (playlists.length === 0) return;
    const first = playlists[0];
    const isIn = first.songs.some(s => s.id === song.id);
    if (isIn) {
      removeSongFromPlaylist(first.id, song.id);
    } else {
      addSongToPlaylist(first.id, song);
    }
  };

  // Playback controls
  const playFromList = (direction: 1 | -1) => {
    if (currentSongList.length === 0) return;
    const idx = currentSongList.findIndex(s => s.id === currentSongId);
    let nextIdx: number;
    if (playMode === 'shuffle' && currentSongList.length > 1) {
      do { nextIdx = Math.floor(Math.random() * currentSongList.length); } while (nextIdx === idx);
    } else {
      nextIdx = ((idx >= 0 ? idx : 0) + direction + currentSongList.length) % currentSongList.length;
    }
    playSong(currentSongList[nextIdx]);
  };

  const togglePlay = () => { engine.init(); engine.togglePlay(); };

  const confirmPendingDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.type === 'song') {
      removeSongFromPlaylist(pendingDelete.playlistId, pendingDelete.songId);
    } else {
      deletePlaylist(pendingDelete.playlistId);
    }
    setPendingDelete(null);
  };

  const activePlaylist = playlists.find(p => p.id === activePlaylistId);
  const favoritedSongIds = new Set(playlists.flatMap(p => p.songs.map(s => s.id)));

  // Set initial active playlist
  useEffect(() => {
    if (playlists.length > 0 && !activePlaylistId) {
      setActivePlaylistId(playlists[0].id);
    }
  }, [playlists, activePlaylistId]);

  // Audio state poller
  useEffect(() => {
    engine.init();
    let animationFrameId: number;
    const poll = () => {
      setIsPlaying(engine.isPlaying);
      setCurrentTime(engine.audioElement.currentTime);
      setDuration(engine.audioElement.duration || 0);
      setVolume(engine.audioElement.volume);
      setIsCapturing(engine.isCapturing);
      animationFrameId = requestAnimationFrame(poll);
    };
    poll();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // Song ended handler
  useEffect(() => {
    const handleEnded = () => {
      if (playMode === 'repeat-one') {
        engine.audioElement.currentTime = 0;
        engine.play();
        return;
      }
      if (currentSongList.length > 0) playFromList(1);
    };
    engine.audioElement.addEventListener('ended', handleEnded);
    return () => engine.audioElement.removeEventListener('ended', handleEnded);
  }, [currentSongList, currentSongId, playMode]);

  // MediaSession action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => engine.play());
    navigator.mediaSession.setActionHandler('pause', () => engine.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => playFromList(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => playFromList(1));
    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    };
  }, [currentSongList, currentSongId, playMode]);

  // Infinite scroll observer
  useEffect(() => {
    if (!showSearchPanel) return;
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !searchLoading) {
        loadMore();
      }
    }, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [showSearchPanel, hasMore, searchLoading, searchPage]);

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') { e.preventDefault(); engine.init(); engine.togglePlay(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const t = themes[theme] || themes['nocturnal'];
  const accentHex = `#${t.uRippleColor.getHexString()}`;

  return (
    <div
      className="absolute inset-0 pointer-events-none z-10 flex w-full h-full"
      style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", color: '#94a3b8' }}
    >
      {/* Sidebar Left */}
      <div className="absolute left-0 top-0 h-full w-[20px] z-[60] group hover:w-[60px] transition-all pointer-events-auto">
        <aside className="absolute left-0 top-0 w-[60px] h-full border-r border-white/5 flex flex-col items-center py-6 pointer-events-auto -translate-x-full group-hover:translate-x-0 transition-transform duration-300 delay-[3000ms] group-hover:delay-0" style={{ background: 'rgba(2,4,10,0.8)' }}>
          <button className="uppercase tracking-[0.2em] text-[10px] mb-12 opacity-100 transition-opacity cursor-pointer" style={{ writingMode: 'vertical-rl', color: accentHex }}>Visualizer</button>
          <button onClick={() => { setShowFreqPanel(v => !v); setShowPlaylistPanel(false); setShowNowPlaying(false); setShowSearchPanel(false); }} className="uppercase tracking-[0.2em] text-[10px] mb-12 opacity-40 hover:opacity-100 transition-opacity cursor-pointer" style={{ writingMode: 'vertical-rl' }}>
            Trigger
          </button>
          <button onClick={() => { setShowPlaylistPanel(v => !v); setShowFreqPanel(false); setShowNowPlaying(false); setShowSearchPanel(false); }} className="uppercase tracking-[0.2em] text-[10px] mb-12 opacity-40 hover:opacity-100 transition-opacity cursor-pointer" style={{ writingMode: 'vertical-rl' }}>
            Playlist
          </button>
          <button onClick={() => { setShowNowPlaying(v => !v); setShowFreqPanel(false); setShowPlaylistPanel(false); setShowSearchPanel(false); }} className={`uppercase tracking-[0.2em] text-[10px] mb-12 transition-opacity cursor-pointer ${currentSongList.length > 0 ? 'opacity-40 hover:opacity-100' : 'opacity-15 pointer-events-none'}`} style={{ writingMode: 'vertical-rl' }}>
            Playing
          </button>

          <div className="mt-auto flex flex-col items-center gap-10">
            <button
              onClick={() => { setShowSearchPanel(v => !v); setShowFreqPanel(false); setShowPlaylistPanel(false); setShowNowPlaying(false); }}
              className="uppercase tracking-[0.2em] text-[10px] opacity-40 hover:opacity-100 transition-opacity cursor-pointer font-bold"
              style={{ writingMode: 'vertical-rl' }}
            >
              Search
            </button>
            <button
              onClick={() => {
                if (engine.isCapturing) {
                  engine.stopCapture();
                  setTrackName('No track selected');
                } else {
                  engine.startCapture().then(() => {
                    if (engine.isCapturing) setTrackName('System Audio Capture');
                  });
                }
              }}
              className={`uppercase tracking-[0.2em] text-[10px] transition-opacity cursor-pointer ${isCapturing ? 'opacity-100 text-[#ef4444]' : 'opacity-40 hover:opacity-100'}`}
              style={{ writingMode: 'vertical-rl' }}
            >
              {isCapturing ? 'Stop' : 'Capture'}
            </button>
          </div>
        </aside>
      </div>

      {/* Search Panel */}
      {showSearchPanel && (
        <div className="absolute top-[40px] left-[100px] w-[480px] max-h-[74vh] z-[65] pointer-events-auto backdrop-blur-[20px] border border-white/10 rounded-sm overflow-hidden flex flex-col" style={{ background: 'rgba(5,10,15,0.9)' }}>
          <div className="p-5 border-b border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3 text-[12px] uppercase tracking-[0.2em] text-white/70">
                <Search size={15} />
                Search Music
              </div>
              <button onClick={() => setShowSearchPanel(false)} className="text-[10px] uppercase tracking-[0.15em] text-white/40 hover:text-white">Close</button>
            </div>
            <div className="flex gap-2">
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                placeholder="Search NetEase Cloud Music..."
                className="min-w-0 flex-1 bg-white/5 border border-white/10 rounded-sm px-3 py-2 text-[12px] text-white outline-none focus:border-white/30"
              />
              <button
                onClick={handleSearch}
                disabled={searchLoading}
                className="w-20 py-2 text-[10px] uppercase tracking-[0.15em] text-black rounded-sm disabled:opacity-50"
                style={{ backgroundColor: accentHex }}
              >
                {searchLoading ? '...' : 'Search'}
              </button>
            </div>
          </div>
          <div className="ui-scroll overflow-y-auto max-h-[58vh]" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
            {searchError && (
              <div className="px-5 py-4 text-[12px] text-[#ef4444]">{searchError}</div>
            )}
            {!searchError && searchResults.length === 0 && !searchLoading && (
              <div className="px-5 py-8 text-[12px] text-white/40 text-center">
                {searchQuery ? 'No results' : 'Search for songs, artists, or albums'}
              </div>
            )}
            {searchResults.map((result, idx) => (
              <SearchResultItem
                key={`${result.name}-${result.artist}-${idx}`}
                result={result}
                isFavorited={favoritedSongIds.has(parseSearchResult(result).id)}
                accentHex={accentHex}
                activePlaylistId={activePlaylistId}
                activePlaylistName={activePlaylist?.name}
                onPlay={playSearchResult}
                onFavorite={(song) => favoriteSong(song)}
                onAddToPlaylist={(song) => addSongToPlaylist(activePlaylistId!, song)}
              />
            ))}
            {hasMore && (
              <div ref={loadMoreRef} className="py-4 text-center text-[11px] text-white/30">
                {searchLoading ? 'Loading...' : 'Scroll for more'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Playlist Panel */}
      {showPlaylistPanel && (
        <div className="absolute top-[40px] left-[100px] w-[420px] max-h-[74vh] z-[65] pointer-events-auto backdrop-blur-[20px] border border-white/10 rounded-sm overflow-hidden" style={{ background: 'rgba(5,10,15,0.9)' }}>
          <div className="p-5 border-b border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3 text-[12px] uppercase tracking-[0.2em] text-white/70">
                <ListMusic size={15} />
                Playlists
              </div>
              <button onClick={() => setShowPlaylistPanel(false)} className="text-[10px] uppercase tracking-[0.15em] text-white/40 hover:text-white">Close</button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                {playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    onClick={() => setActivePlaylistId(playlist.id)}
                    className={`flex-shrink-0 px-3 py-2 rounded-sm border text-[10px] uppercase tracking-[0.12em] transition-colors ${activePlaylistId === playlist.id ? 'text-black border-transparent' : 'text-white/45 border-white/10 hover:text-white'}`}
                    style={{ backgroundColor: activePlaylistId === playlist.id ? accentHex : 'transparent' }}
                  >
                    {playlist.name}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowAddPlaylist(v => !v)}
                className="h-8 w-8 flex-shrink-0 rounded-sm border border-white/10 text-white/45 hover:text-white flex items-center justify-center"
                title="New playlist"
              >
                <Plus size={14} />
              </button>
              <button
                onClick={() => activePlaylistId && setPendingDelete({ type: 'playlist', playlistId: activePlaylistId, label: activePlaylist?.name || '' })}
                disabled={!activePlaylistId || playlists.length <= 1}
                className="h-8 w-8 flex-shrink-0 rounded-sm border border-white/10 text-white/45 hover:text-[#ef4444] disabled:opacity-20 disabled:hover:text-white/45 flex items-center justify-center"
                title="Delete playlist"
              >
                <Trash2 size={14} />
              </button>
            </div>
            {showAddPlaylist && (
              <div className="flex gap-2 mt-3">
                <input
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="New playlist name"
                  className="min-w-0 flex-1 bg-white/5 border border-white/10 rounded-sm px-3 py-2 text-[12px] text-white outline-none focus:border-white/30"
                  onKeyDown={(e) => { if (e.key === 'Enter') createPlaylist(); }}
                />
                <button
                  onClick={createPlaylist}
                  className="px-3 py-2 text-[10px] uppercase tracking-[0.15em] text-black rounded-sm"
                  style={{ backgroundColor: accentHex }}
                >
                  Create
                </button>
              </div>
            )}
          </div>
          <div className="ui-scroll max-h-[52vh] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
            {activePlaylist && activePlaylist.songs.length > 0 ? activePlaylist.songs.map((song) => (
              <button
                key={song.id}
                onClick={() => playSong(song, activePlaylist.songs)}
                className="relative w-full text-left px-5 py-4 pr-16 border-b border-white/5 hover:bg-white/5 transition-colors"
              >
                <div className="text-[13px] text-white truncate">{song.name}</div>
                <div className="mt-1 text-[11px] text-white/45 truncate">{song.artist || 'Unknown artist'}</div>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDelete({ type: 'song', playlistId: activePlaylist.id, songId: song.id, label: song.name });
                  }}
                  className="absolute right-5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-sm border border-white/10 text-white/45 hover:text-[#ef4444] transition-colors flex items-center justify-center"
                  title="Remove from playlist"
                >
                  <Trash2 size={14} />
                </span>
              </button>
            )) : (
              <div className="px-5 py-8 text-[12px] text-white/40">No songs in this playlist yet</div>
            )}
          </div>
        </div>
      )}

      {/* Now Playing Panel */}
      {showNowPlaying && currentSongList.length > 0 && (
        <div className="absolute top-[40px] left-[100px] w-[420px] max-h-[74vh] z-[65] pointer-events-auto backdrop-blur-[20px] border border-white/10 rounded-sm overflow-hidden flex flex-col" style={{ background: 'rgba(5,10,15,0.9)' }}>
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <div className="text-[12px] uppercase tracking-[0.2em] text-white/70">Now Playing</div>
            <button onClick={() => setShowNowPlaying(false)} className="text-[10px] uppercase tracking-[0.15em] text-white/40 hover:text-white">Close</button>
          </div>
          <div className="ui-scroll overflow-y-auto max-h-[65vh]" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
            {currentSongList.map((song, idx) => (
              <button
                key={song.id}
                onClick={() => playSong(song, currentSongList)}
                className={`w-full text-left px-5 py-3 border-b border-white/5 transition-colors ${currentSongId === song.id ? 'bg-white/8' : 'hover:bg-white/5'}`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 text-[10px] text-right flex-shrink-0">
                    {currentSongId === song.id ? (
                      <span style={{ color: accentHex }}>&#9654;</span>
                    ) : (
                      <span className="text-white/25">{idx + 1}</span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[13px] truncate ${currentSongId === song.id ? 'text-white' : 'text-white/70'}`}>{song.name}</div>
                    <div className="mt-0.5 text-[11px] text-white/40 truncate">{song.artist || 'Unknown artist'}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      {pendingDelete && (
        <div className="absolute inset-0 z-[120] pointer-events-auto flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-[320px] border border-white/10 rounded-sm p-5" style={{ background: 'rgba(5,10,15,0.96)' }}>
            <div className="text-[12px] uppercase tracking-[0.2em] text-white/70 mb-3">Confirm Delete</div>
            <div className="text-[13px] text-white/80 leading-relaxed mb-5">
              Delete {pendingDelete.type === 'playlist' ? 'playlist' : 'song'} <span className="text-white">{pendingDelete.label}</span>?
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingDelete(null)} className="px-3 py-2 rounded-sm border border-white/10 text-[10px] uppercase tracking-[0.15em] text-white/45 hover:text-white">Cancel</button>
              <button onClick={confirmPendingDelete} className="px-3 py-2 rounded-sm border border-[#ef4444]/40 text-[10px] uppercase tracking-[0.15em] text-[#ef4444] hover:bg-[#ef4444] hover:text-black">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Player Panel */}
      {trackName !== 'No track selected' && (
        <div className="absolute top-[40px] right-[40px] w-[300px] p-6 rounded-sm z-50 pointer-events-auto backdrop-blur-[20px] border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="flex justify-between items-start mb-1">
            <MarqueeText className="text-[18px] font-light tracking-[0.05em] text-white" text={trackName} />
            <button
              onClick={() => {
                const keys = Object.keys(themes);
                const nextIndex = (keys.indexOf(theme) + 1) % keys.length;
                onThemeChange(keys[nextIndex]);
              }}
              className="text-white/40 hover:text-white transition-colors flex-shrink-0"
              title="Change Theme"
            >
              <Palette size={16} />
            </button>
          </div>
          <div className="text-[12px] opacity-50 uppercase mb-6 tracking-wider">
            {isCapturing ? 'System Audio Capture' : 'NetEase Cloud Music'}
            <span className="ml-2 text-[#3b82f6] text-[10px]">&bull; {themes[theme]?.name}</span>
          </div>

          {/* Progress bar */}
          <div className={`h-[20px] mb-5 relative flex items-end group ${isCapturing ? 'opacity-30 pointer-events-none' : ''}`}>
            <div className="w-full relative h-[2px] bg-white/10 group-hover:h-[4px] transition-all">
              <div
                className="absolute top-0 left-0 h-full"
                style={{ backgroundColor: accentHex, width: `${duration ? (currentTime / duration) * 100 : 0}%`, boxShadow: `0 0 10px ${accentHex}88` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step="0.01"
              value={currentTime}
              onChange={(e) => {
                if (engine.audioElement) {
                  const newTime = parseFloat(e.target.value);
                  engine.audioElement.currentTime = newTime;
                  setCurrentTime(newTime);
                }
              }}
              className="absolute bottom-0 left-0 w-full opacity-0 cursor-pointer h-full"
            />
          </div>

          <div className={`flex justify-between items-center text-[10px] uppercase tracking-[0.1em] opacity-80 ${isCapturing ? 'opacity-30 pointer-events-none' : ''}`}>
            <span className="w-8">{formatTime(currentTime)}</span>
            <div className="flex items-center gap-4">
              <button onClick={() => playFromList(-1)} className="hover:text-white transition-colors disabled:opacity-25 disabled:hover:text-inherit" disabled={currentSongList.length === 0} title="Previous track">
                <SkipBack size={14} />
              </button>
              <button onClick={togglePlay} className="hover:text-white transition-colors">
                {isPlaying ? <Pause size={14} className="fill-current" /> : <Play size={14} className="fill-current" />}
              </button>
              <button onClick={() => playFromList(1)} className="hover:text-white transition-colors disabled:opacity-25 disabled:hover:text-inherit" disabled={currentSongList.length === 0} title="Next track">
                <SkipForward size={14} />
              </button>
              <button
                onClick={() => setPlayMode((mode) => mode === 'sequence' ? 'shuffle' : mode === 'shuffle' ? 'repeat-one' : 'sequence')}
                className="hover:text-white transition-colors"
                title={playMode === 'sequence' ? 'Sequence play' : playMode === 'shuffle' ? 'Shuffle play' : 'Repeat one'}
                style={{ color: playMode !== 'sequence' ? accentHex : undefined }}
              >
                {playMode === 'sequence' ? <Repeat size={14} /> : playMode === 'shuffle' ? <Shuffle size={14} /> : <Repeat1 size={14} />}
              </button>
            </div>

            <div className="flex items-center gap-2 group w-20 justify-end">
              <input
                type="range"
                min={0} max={1} step={0.01}
                value={volume}
                onChange={(e) => { const val = parseFloat(e.target.value); engine.audioElement.volume = val; setVolume(val); }}
                className="w-12 h-1 accent-current opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer aspect-auto bg-white/20 appearance-none rounded-full"
                style={{ accentColor: accentHex }}
              />
              <Volume2
                size={12}
                className="opacity-50 hover:opacity-100 transition-opacity cursor-pointer flex-shrink-0"
                onClick={() => { const val = volume > 0 ? 0 : 1; engine.audioElement.volume = val; setVolume(val); }}
              />
            </div>
            <span className="w-8 text-right">{formatTime(duration)}</span>
          </div>
        </div>
      )}

      {/* Stats Panel */}
      {trackName !== 'No track selected' && (
        <div className="absolute bottom-[40px] left-[100px] z-50 pointer-events-none flex flex-col gap-6">
          <StatsPanel accentHex={accentHex} />
        </div>
      )}

      <div className="absolute bottom-[40px] right-[40px] text-[10px] uppercase tracking-[0.1em] opacity-30 select-none">
        Drag to orbit &bull; Click to pulse
      </div>

      {/* Frequency Trigger Panel */}
      {showFreqPanel && (
        <FreqTriggerPanelWrapper onClose={() => setShowFreqPanel(false)} accentHex={accentHex} />
      )}
    </div>
  );
}

function MarqueeText({ text, className }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const overflow = measure.scrollWidth - container.clientWidth;
    setShouldScroll(overflow > 4);
    if (overflow > 4) {
      const dur = Math.max(4, Math.ceil(measure.scrollWidth / 40));
      container.style.setProperty('--marquee-dur', `${dur}s`);
    }
  }, [text]);

  return (
    <div ref={containerRef} className="flex-1 mr-2 overflow-hidden" title={text}>
      {/* Hidden span for measuring text width */}
      <span ref={measureRef} className={`whitespace-nowrap invisible absolute ${className || ''}`}>{text}</span>
      {shouldScroll ? (
        <div className="marquee-inner">
          <span className={`inline-block pr-12 ${className || ''}`}>{text}</span>
          <span className={`inline-block pr-12 ${className || ''}`}>{text}</span>
        </div>
      ) : (
        <span className={`whitespace-nowrap ${className || ''}`}>{text}</span>
      )}
    </div>
  );
}

function SearchResultItem({ result, isFavorited, accentHex, activePlaylistId, activePlaylistName, onPlay, onFavorite, onAddToPlaylist }: {
  result: SearchResult;
  isFavorited: boolean;
  accentHex: string;
  activePlaylistId: string | null;
  activePlaylistName?: string;
  onPlay: (result: SearchResult) => void;
  onFavorite: (song: Song) => void;
  onAddToPlaylist: (song: Song) => void;
}) {
  const [picUrl, setPicUrl] = useState('');
  const parsed = parseSearchResult(result);

  useEffect(() => {
    if (!parsed.picId) return;
    let cancelled = false;
    resolvePicUrl(parsed.picId, 300).then(url => { if (!cancelled) setPicUrl(url); });
    return () => { cancelled = true; };
  }, [parsed.picId]);

  return (
    <div className="group w-full border-b border-white/5 hover:bg-white/5 transition-colors flex items-center">
      {picUrl ? (
        <img src={picUrl} alt="" className="w-10 h-10 rounded-sm object-cover ml-4 flex-shrink-0" loading="lazy" />
      ) : parsed.picId ? (
        <div className="w-10 h-10 rounded-sm ml-4 flex-shrink-0 bg-white/5" />
      ) : null}
      <button
        onClick={() => onPlay(result)}
        className="flex-1 min-w-0 text-left px-5 py-3.5"
      >
        <div className="text-[13px] text-white truncate">{result.name}</div>
        <div className="mt-0.5 text-[11px] text-white/45 truncate">{result.artist}</div>
      </button>
      <div className="flex items-center gap-1 pr-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onFavorite({ id: parsed.id, name: parsed.name, artist: parsed.artist, album: parsed.album, picId: parsed.picId })}
          className={`p-1.5 transition-colors ${isFavorited ? 'text-[#ec4899]' : 'text-white/30 hover:text-[#ec4899]'}`}
          title="Favorite"
        >
          <Heart size={13} fill={isFavorited ? '#ec4899' : 'none'} />
        </button>
        {activePlaylistId && (
          <button
            onClick={() => onAddToPlaylist({ id: parsed.id, name: parsed.name, artist: parsed.artist, album: parsed.album, picId: parsed.picId })}
            className="p-1.5 text-white/30 hover:text-white transition-colors"
            title={activePlaylistName ? `Add to ${activePlaylistName}` : 'Add to playlist'}
          >
            <ListMusic size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function FreqTriggerPanelWrapper({ onClose, accentHex }: { onClose: () => void, accentHex: string }) {
  const [action, setAction] = useState<'Pulse' | 'Meteor'>('Meteor');
  return (
    <FreqTriggerPanel key={action} action={action} setAction={setAction} onClose={onClose} accentHex={accentHex} />
  );
}

function FreqTriggerPanel({ action, setAction, onClose, accentHex }: { action: 'Pulse' | 'Meteor', setAction: (a: 'Pulse' | 'Meteor') => void, onClose: () => void, accentHex: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const getConfig = () => action === 'Pulse' ? engine.pulseTrigger : engine.meteorTrigger;

  const [triggerPoint, setTriggerPoint] = useState({
    x: getConfig().freqIndex >= 0 ? getConfig().freqIndex / 512 : 0.5,
    y: getConfig().threshold
  });
  const [isEnabled, setIsEnabled] = useState(getConfig().enabled);
  const [mode, setMode] = useState<TriggerPreset>(getConfig().mode);
  const [sensitivity, setSensitivity] = useState(getConfig().sensitivity);
  const [cooldown, setCooldown] = useState(getConfig().cooldown);
  const [pulseStrength, setPulseStrength] = useState(getConfig().pulseStrength);
  const [bandStart, setBandStart] = useState(getConfig().bandStart);
  const [bandEnd, setBandEnd] = useState(getConfig().bandEnd);
  const isDragging = useRef(false);

  useEffect(() => {
    const c = getConfig();
    c.enabled = isEnabled;
    c.mode = mode;
    c.sensitivity = sensitivity;
    c.cooldown = cooldown;
    c.pulseStrength = pulseStrength;
    c.bandStart = bandStart;
    c.bandEnd = bandEnd;
    if (mode === 'Advanced') {
      c.freqIndex = Math.floor(triggerPoint.x * 512);
      c.threshold = triggerPoint.y;
    } else {
      c.freqIndex = -1;
    }
  }, [isEnabled, mode, sensitivity, cooldown, pulseStrength, bandStart, bandEnd, triggerPoint]);

  const handleModeChange = (newMode: TriggerPreset) => { setMode(newMode); };
  const presets: TriggerPreset[] = ['Auto Beat', 'Advanced'];

  useEffect(() => {
    let animationId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      for (let i = 1; i < 10; i++) {
        ctx.moveTo(0, height * i / 10);
        ctx.lineTo(width, height * i / 10);
        ctx.moveTo(width * i / 10, 0);
        ctx.lineTo(width * i / 10, height);
      }
      ctx.stroke();

      const data = engine.getRawFrequencyData();
      const binCount = data.length || 512;

      const [startBin, endBin] = getConfig().getTriggerRange();
      const startX = (startBin / binCount) * width;
      const endX = (endBin / binCount) * width;

      ctx.fillStyle = mode === 'Advanced' ? 'rgba(255,255,255,0.02)' : `${accentHex}20`;
      ctx.fillRect(startX, 0, Math.max(1, endX - startX), height);

      if (mode !== 'Advanced') {
        ctx.strokeStyle = accentHex + '80';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(endX, 0);
        ctx.lineTo(endX, height);
        ctx.stroke();
      }

      ctx.fillStyle = accentHex + '40';
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let i = 0; i < binCount; i++) {
        const x = (i / binCount) * width;
        const val = data[i] / 255.0;
        const y = height - (val * height);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();

      if (mode === 'Advanced') {
        const tx = triggerPoint.x * width;
        const ty = height - (triggerPoint.y * height);
        ctx.beginPath();
        ctx.moveTo(tx, 0);
        ctx.lineTo(tx, height);
        ctx.moveTo(0, ty);
        ctx.lineTo(width, ty);
        ctx.strokeStyle = accentHex;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(tx, ty, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      } else {
        const evE = getConfig().lastEvalEnergy;
        const evThresh = getConfig().lastEvalThresh;
        const eY = height - (evE * height);
        const tY = height - (evThresh * height);
        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.moveTo(0, tY);
        ctx.lineTo(width, tY);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.stroke();
        ctx.setLineDash([]);
        const cx = (startX + endX) / 2;
        ctx.beginPath();
        ctx.arc(cx, eY, 6, 0, Math.PI * 2);
        ctx.fillStyle = evE > evThresh ? accentHex : 'rgba(255,255,255,0.5)';
        ctx.fill();
      }
    };
    draw();
    return () => cancelAnimationFrame(animationId);
  }, [accentHex, triggerPoint, mode]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (mode !== 'Advanced') return;
    isDragging.current = true;
    updateTriggerFromEvent(e);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || mode !== 'Advanced') return;
    updateTriggerFromEvent(e);
  };
  const handlePointerUp = () => { isDragging.current = false; };

  const updateTriggerFromEvent = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    setTriggerPoint({ x, y });
    const config = action === 'Meteor' ? engine.meteorTrigger : engine.pulseTrigger;
    config.freqIndex = Math.floor(x * 512);
    config.threshold = y;
  };

  return (
    <div className="absolute inset-0 z-[100] backdrop-blur-md bg-black/50 flex flex-col items-center justify-center pointer-events-auto">
      <div className="w-[80vw] max-w-[800px] border border-white/10 rounded-xl p-8 transform transition-all shadow-2xl" style={{ background: 'rgba(5, 10, 15, 0.95)' }}>
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-light tracking-widest text-white">FREQUENCY TRIGGER</h2>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} className="w-4 h-4 rounded-sm border-white/20 bg-black/50" style={{ accentColor: accentHex }} />
                <span className="text-[10px] uppercase tracking-widest text-white/50">Enable</span>
              </label>
              {isEnabled && (
                <div className="flex items-center rounded overflow-hidden border border-white/10 text-[10px] uppercase tracking-widest">
                  <button onClick={() => setAction('Pulse')} className={`px-3 py-1 transition-colors ${action === 'Pulse' ? 'text-black' : 'text-white/50 hover:bg-white/5'}`} style={{ backgroundColor: action === 'Pulse' ? accentHex : 'transparent' }}>Pulse</button>
                  <button onClick={() => setAction('Meteor')} className={`px-3 py-1 transition-colors ${action === 'Meteor' ? 'text-black' : 'text-white/50 hover:bg-white/5'}`} style={{ backgroundColor: action === 'Meteor' ? accentHex : 'transparent' }}>Meteor</button>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white uppercase tracking-widest text-[10px]">Close</button>
        </div>

        <div className="flex gap-2 mb-4">
          {presets.map(p => (
            <button key={p} onClick={() => handleModeChange(p)} className={`px-3 py-1.5 text-[10px] uppercase tracking-widest rounded-sm border transition-colors ${mode === p ? 'bg-white/10 text-white border-white/20' : 'border-transparent text-white/40 hover:text-white hover:bg-white/5'}`}>{p}</button>
          ))}
        </div>

        <p className="text-[11px] text-white/40 mb-6 font-mono h-10 leading-relaxed">
          {mode === 'Advanced'
            ? "Drag the crosshair to set the target frequency (X) and threshold (Y).\nWhen the spectrum exceeds this threshold, a visual pulse is triggered."
            : `Dynamic ${mode} detection enabled. Pulses trigger when instantaneous energy significantly exceeds the rolling average of this specific frequency band.`}
        </p>
        <div className={`relative w-full aspect-[2/1] bg-black/50 border border-white/5 rounded overflow-hidden ${mode === 'Advanced' ? 'cursor-crosshair' : ''}`}>
          <canvas ref={canvasRef} width={800} height={400} className="w-full h-full block" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} />
        </div>

        {mode === 'Auto Beat' && (
          <div className="mt-8 grid grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <div className="flex justify-between uppercase tracking-widest text-[10px] text-white/50"><span>Sensitivity</span><span style={{ color: accentHex }}>{sensitivity.toFixed(2)}</span></div>
              <input type="range" min="0" max="1" step="0.05" value={sensitivity} onChange={e => setSensitivity(parseFloat(e.target.value))} className="w-full accent-current h-1" style={{ accentColor: accentHex }} />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between uppercase tracking-widest text-[10px] text-white/50"><span>Cooldown (frames)</span><span style={{ color: accentHex }}>{cooldown}</span></div>
              <input type="range" min="0" max="300" step="1" value={cooldown} onChange={e => setCooldown(parseInt(e.target.value))} className="w-full accent-current h-1" style={{ accentColor: accentHex }} />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between uppercase tracking-widest text-[10px] text-white/50"><span>Freq Band ({bandStart} - {bandEnd})</span></div>
              <div className="flex gap-2">
                <input type="range" min="0" max="250" step="1" value={bandStart} onChange={e => setBandStart(Math.min(parseInt(e.target.value), bandEnd - 1))} className="w-1/2 accent-current h-1" style={{ accentColor: accentHex }} />
                <input type="range" min="2" max="256" step="1" value={bandEnd} onChange={e => setBandEnd(Math.max(parseInt(e.target.value), bandStart + 1))} className="w-1/2 accent-current h-1" style={{ accentColor: accentHex }} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between uppercase tracking-widest text-[10px] text-white/50"><span>Pulse Strength</span><span style={{ color: accentHex }}>{pulseStrength.toFixed(2)}</span></div>
              <input type="range" min="0" max="5" step="0.1" value={pulseStrength} onChange={e => setPulseStrength(parseFloat(e.target.value))} className="w-full accent-current h-1" style={{ accentColor: accentHex }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatsPanel({ accentHex }: { accentHex: string }) {
  const [data, setData] = useState({ bass: 0, mid: 0, treble: 0, energy: 0 });

  useEffect(() => {
    let animationFrameId: number;
    const poll = () => {
      setData(engine.getAudioData());
      animationFrameId = requestAnimationFrame(poll);
    };
    poll();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div className="flex gap-10">
      <StatBox label="Bass" value={data.bass} accentHex={accentHex} />
      <StatBox label="Mid" value={data.mid} accentHex={accentHex} />
      <StatBox label="Treble" value={data.treble} accentHex={accentHex} />
      <StatBox label="Energy" value={data.energy} accentHex={accentHex} />
    </div>
  );
}

function StatBox({ label, value, accentHex }: { label: string, value: number, accentHex: string }) {
  const displayValue = (value * 100).toFixed(1);
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[9px] uppercase tracking-[0.15em] opacity-40">{label}</div>
      <div className="font-mono text-[14px]" style={{ color: accentHex }}>{displayValue}</div>
      <div className="w-[100px] h-[2px] relative bg-white/10">
        <div
          className="absolute h-full transition-all duration-75"
          style={{ backgroundColor: accentHex, width: `${Math.min(100, value * 100)}%`, boxShadow: `0 0 8px ${accentHex}88` }}
        />
      </div>
    </div>
  );
}
