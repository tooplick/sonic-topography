# Sonic Topography Code Map

This file is the project index for future code lookup, edits, tests, and reviews. It is organized by change target.

Last full verification commit: `unknown`

## Start Here

| Goal | Main files | Tests | Verification |
| --- | --- | --- | --- |
| Change player, Demo, upload, or lyrics display | `src/components/UI/UI.tsx` | No automated tests yet | `npm run lint`; `npm run build` |
| Change Netease search/import | `src/components/UI/UI.tsx`; `vite.config.ts` | No automated tests yet | `npm run lint`; `npm run build`; `/api/netease/search` smoke test |
| Change one-click packaged startup | `local-server.mjs`; `start-sonic-topography.bat`; `package.json` | No automated tests yet | `npm run build`; `npm start`; `http://127.0.0.1:4173` smoke test |
| Change saved playlists | `src/components/UI/UI.tsx` | No automated tests yet | `npm run lint`; browser localStorage persistence QA |
| Change playback queue or skip mode | `src/components/UI/UI.tsx` | No automated tests yet | `npm run lint`; browser playlist skip/shuffle QA |
| Change audio playback, analysis, or triggers | `src/lib/AudioEngine.ts` | No automated tests yet | `npm run lint`; browser playback QA |
| Change meteor trigger spacing | `src/lib/AudioEngine.ts`; `src/components/AudioVisualizer/MapScene.tsx`; `src/components/UI/UI.tsx` | No automated tests yet | `npm run lint`; `npm run build`; browser Trigger panel QA |
| Change LRC parsing | `src/lib/lyrics.ts`; `src/components/UI/LyricsDisplay.tsx` | No automated tests yet | `npm run lint`; QA with an `.lrc` file |
| Change audio metadata reading | `src/lib/metadata.ts` | No automated tests yet | `npm run lint`; QA with audio containing ID3 title/artist/lyrics |
| Change 3D visualizer scene | `src/components/AudioVisualizer/MapScene.tsx`; `src/components/AudioVisualizer/CustomShaderMaterial.ts` | No automated tests yet | `npm run build`; browser visual QA |

## End-To-End Flow

```text
src/main.tsx
-> src/App.tsx
-> UI upload or Demo click
-> src/components/UI/UI.tsx
-> src/lib/AudioEngine.ts loads audio and emits spectrum data
-> src/components/AudioVisualizer/MapScene.tsx reads spectrum and trigger events
-> src/components/AudioVisualizer/CustomShaderMaterial.ts renders terrain waves
```

Demo flow:

```text
public/demo.mp3 + public/demo.lrc
-> UI.loadDemo()
-> src/lib/metadata.ts reads audio title, artist, embedded lyrics
-> same-name LRC wins, otherwise embedded lyrics are used
-> AudioEngine.loadUrl('/demo.mp3')
```

Upload flow:

```text
input[type=file] or drag and drop
-> UI.processFiles()
-> detect audio/*, .mp3, .wav, .flac, and .lrc
-> FileReader reads LRC or metadata.ts tries embedded lyrics
-> AudioEngine.loadFile(file)
```

Netease search flow:

```text
UI Search button
-> UI.searchNetease()
-> Vite middleware /api/netease/search
-> search cache returns if the same keyword/limit was recently checked
-> music.163.com search API
-> Vite checks each candidate with /api/song/enhance/player/url
-> playable URL cache avoids repeated candidate checks
-> unplayable candidates are filtered out
-> user selects a result
-> /api/netease/lyric loads LRC
-> /api/netease/url checks playback availability
-> /api/netease/audio proxies playable audio into AudioEngine.loadUrl()
```

Saved playlist flow:

```text
Search result plus button
-> choose existing playlist or create a new playlist
-> UI state updates
-> localStorage key sonic-topography-playlists-v1 persists playlists
-> Playlist side-rail entry opens saved playlists after reload/restart
-> selecting a saved song reuses loadNeteaseSong()
-> trash buttons remove songs or whole playlists from localStorage-backed state
```

Playback queue flow:

```text
Search result or playlist song click
-> loadNeteaseSong(song, queue)
-> playQueue/currentSongId update
-> SkipBack/SkipForward calls playFromQueue()
-> playMode sequence uses adjacent index; shuffle picks a different random index
-> audio ended event advances to next queued song
-> unavailable or failed songs skip to the next queued song
```

## Code Map

### Player, Demo, And Lyrics Entry

`src/components/UI/UI.tsx`

Owns the left control rail, Demo button, Netease search panel, saved playlist panel, playback queue controls, upload and drag/drop files, player panel, theme switch, lyrics status, and frequency trigger panel. Demo defaults to `public/demo.mp3` and `public/demo.lrc`. Saved playlists are stored in browser `localStorage`.

`vite.config.ts`

Provides the Vite dev server middleware for `/api/netease/search`, `/api/netease/lyric`, `/api/netease/url`, and `/api/netease/audio`. This avoids browser CORS issues, filters search results to playable candidates, caches playable URL/search checks, and proxies playable audio when Netease returns a URL.

`local-server.mjs`

Production local server for the built `dist/` folder. It mirrors the Netease proxy endpoints from `vite.config.ts` so the packaged app keeps Search, lyrics, and audio proxy support without running Vite.

`start-sonic-topography.bat`

Windows one-click launcher. It installs dependencies if needed, builds `dist/` if missing, opens `http://127.0.0.1:4173`, and runs `local-server.mjs`.

`src/lib/metadata.ts`

Uses `music-metadata-browser` to read title, artist, and embedded lyrics from an audio Blob/File. Falls back to the file name when metadata is unavailable.

`src/lib/lyrics.ts`

Parses standard `[mm:ss.xx]` or `[mm:ss.xxx]` LRC timestamps and sorts lyric lines.

`src/components/UI/LyricsDisplay.tsx`

Highlights lyric lines from the current playback time.

### Audio Engine

`src/lib/AudioEngine.ts`

Wraps `HTMLAudioElement`, Web Audio API, spectrum analysis, system audio capture, auto beat detection, advanced band triggers, and the visual release tail used when pausing, closing capture, or switching tracks.

### 3D Visualizer

`src/components/AudioVisualizer/MapScene.tsx`

Connects the audio engine to the Three.js scene, driving ripples, meteors, and camera interaction. Meteor spawn spacing is also gated here by `engine.meteorTrigger.cooldown / 60`, so `Cooldown (frames)` affects visible Meteor generation intervals.

`src/components/AudioVisualizer/CustomShaderMaterial.ts`

Defines terrain vertex/fragment shaders and changes height and color from audio bands and trigger waves.

## Test Index

| Test file | Covers |
| --- | --- |
| None yet | This project currently has no automated test files |

## Common Change Recipes

### Change Demo Track

1. Put audio at `public/demo.mp3`.
2. Put lyrics at `public/demo.lrc`.
3. If audio contains title/artist metadata, the player shows it; otherwise it shows `demo`.
4. Run `npm run lint` and `npm run build`.
5. Open `http://127.0.0.1:3000/`, click `Demo`, and verify song name, lyrics, and playback.

### Change Upload Lyrics Behavior

1. Modify `processFiles()` in `src/components/UI/UI.tsx`.
2. If the LRC format changes, update `src/lib/lyrics.ts`.
3. Run `npm run lint`.
4. Select audio and `.lrc` together, then verify lyric display and timing.

### Change Netease Search Behavior

1. Modify the UI states and handlers in `src/components/UI/UI.tsx`.
2. Modify the proxy endpoints in `vite.config.ts`.
3. Run `npm run lint` and `npm run build`.
4. Restart `npm run dev` because Vite middleware changes require a server restart.
5. Smoke test `http://127.0.0.1:3000/api/netease/search?keywords=imase&limit=3`; repeat once to verify the cached path.
6. In the browser, click `Search`, search a song, select a result, and verify lyrics plus playback availability.

### Change One-Click Startup

1. Modify shared proxy behavior in both `vite.config.ts` and `local-server.mjs`.
2. Modify launcher behavior in `start-sonic-topography.bat`.
3. Run `npm run lint` and `npm run build`.
4. Run `npm start` or double-click `start-sonic-topography.bat`.
5. Smoke test `http://127.0.0.1:4173` and `http://127.0.0.1:4173/api/netease/search?keywords=angel&limit=2`.

### Change Saved Playlists

1. Modify playlist state and UI in `src/components/UI/UI.tsx`.
2. Keep `PLAYLIST_STORAGE_KEY` stable unless a migration is added.
3. Run `npm run lint` and `npm run build`.
4. In the browser, search a song, click its plus button, add it to an existing or new playlist, reload the page, and verify the `Playlist` panel still contains it.
5. Delete a song and delete a playlist, then reload and verify they stay deleted.
6. Verify delete confirmation appears before removing a song or playlist.

### Change Playback Queue Or Skip Mode

1. Modify queue state and controls in `src/components/UI/UI.tsx`.
2. Keep search-result and playlist clicks passing a queue into `loadNeteaseSong()`.
3. Run `npm run lint` and `npm run build`.
4. In the browser, play from a playlist, test previous/next, toggle sequence/shuffle, and let a song end to verify auto-advance.
5. If a queued Netease song fails to load or becomes unavailable, verify playback attempts the next queued song.

### Change Meteor Trigger Spacing

1. Modify trigger evaluation in `src/lib/AudioEngine.ts` if the audio event threshold changes.
2. Modify visible spawn gating in `src/components/AudioVisualizer/MapScene.tsx` if Meteor spacing feels wrong.
3. Modify panel controls in `src/components/UI/UI.tsx`.
4. Run `npm run lint` and `npm run build`.
5. In the browser, open `Trigger`, choose `Meteor`, set `Cooldown` to `300`, and verify visible Meteors are spaced about five seconds apart.

## Local Verification Commands

```powershell
npm run lint
npm run build
npm run dev
npm start
```

## Search Shortcuts

```powershell
rg -n "loadDemo|processFiles|lyricsText|extractAudioMetadata" src
rg -n "searchNetease|loadNeteaseSong|/api/netease" src vite.config.ts
rg -n "api/netease|local-server|start-sonic" vite.config.ts local-server.mjs package.json
rg -n "PLAYLIST_STORAGE_KEY|playlists|songToAdd|showPlaylistPanel" src/components/UI/UI.tsx
rg -n "playQueue|currentSongId|playMode|playFromQueue" src/components/UI/UI.tsx
rg -n "meteorTrigger.cooldown|lastMeteorSpawnTime|addMeteor" src/components
rg -n "loadUrl|loadFile|getAudioData|onFreqTrigger" src/lib src/components
```

## Known Runtime Notes

- Static assets live in `public/` and are served from the root path, for example `public/demo.mp3` is `/demo.mp3`.
- `package.json` has a `clean` script containing `rm -rf`; do not run it.
- Double-click startup uses `start-sonic-topography.bat`; production local server runs on `http://127.0.0.1:4173`.
- Browser autoplay and Web Audio initialization depend on user interaction. Click Demo, Play, or Upload before expecting audio.
- System audio capture depends on browser permission. Permission cancelation should return silently to regular playback state.
- Netease playback URLs can be unavailable because of copyright, membership, region, or login restrictions. Lyrics may still load when audio cannot play.
- Search filters out songs without playback URLs. The proxy checks candidates in small concurrent batches and caches search/playability results to keep repeat searches faster.
- Saved playlists are browser-local. Clearing site data, changing browser profile, or changing the localStorage key will remove them.
- If the terrain snaps flat when stopping or switching audio, inspect `AudioEngine.beginVisualRelease()` and the non-playing branch in `getAudioData()` before changing shader code.
