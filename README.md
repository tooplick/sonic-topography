# Sonic Topography

Sonic Topography is a local audio visualizer built with React, Three.js, Vite, and Web Audio. It can play local demo audio, upload audio and `.lrc` lyrics, search Netease Cloud Music through a local proxy, save browser-local playlists, and drive terrain, ripple, and meteor visuals from the audio spectrum.

## Features

- 3D audio-reactive terrain visualizer
- Local demo track and synced LRC lyrics
- Audio upload with optional `.lrc` upload
- Netease Cloud Music search with playable-result filtering
- Lyrics loading through the local proxy
- Saved playlists in browser `localStorage`
- Playlist song deletion and playlist deletion with confirmation
- Previous/next track controls
- Sequence and shuffle playback modes
- One-click Windows launcher

## One-Click Windows Start

Prerequisite: install Node.js first.

Then download or clone this repository and double-click:

```text
start-sonic-topography.bat
```

The launcher will:

1. install dependencies if `node_modules/` is missing;
2. build the app if `dist/` is missing;
3. open `http://127.0.0.1:4173`;
4. run the local production server with Netease proxy support.

## Development

```powershell
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

## Production Local Server

```powershell
npm run build
npm start
```

Open:

```text
http://127.0.0.1:4173
```

## Demo Files

The bundled demo lives in:

```text
public/demo.mp3
public/demo.lrc
```

To replace the demo, keep the same file names.

## Notes

- Netease Cloud Music access uses unofficial web endpoints through the local server. Search results are filtered to songs that currently return a playable URL, but availability can still change because of copyright, membership, region, or login restrictions.
- Playlists are stored in browser `localStorage`, so clearing site data or switching browser profiles will remove them.
- The Windows launcher is not a standalone `.exe`; it still requires Node.js on the target computer.

## Useful Commands

```powershell
npm run lint
npm run build
npm start
```
