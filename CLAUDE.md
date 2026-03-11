# CLAUDE.md — Champions Codebase Guide

This file provides AI assistants with a complete understanding of the Champions repository: its architecture, development workflows, and conventions.

---

## Project Overview

**Champions** is an Electron desktop application built with TypeScript. It serves two primary purposes:

1. **RTMP Live Streaming** — Captures webcam/microphone input and streams to RTMP endpoints (YouTube Live, Twitch, etc.) via ffmpeg.
2. **Pokémon Team Manager** — A tabbed UI for composing and persisting competitive Pokémon team rosters.

The app targets a 1920×1080 fullscreen display and is written entirely in Japanese (UI labels and commit messages).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop framework | Electron 28 |
| Language | TypeScript 5.3 (strict mode) |
| Build | `tsc` + `copyfiles` |
| Runtime target | ES2020, CommonJS |
| Video encoding | ffmpeg (spawned as child process) |
| Video capture | Browser MediaRecorder API (WebM) |
| State persistence | `localStorage` |
| Package manager | npm |

---

## Repository Structure

```
champions/
├── src/
│   ├── main/
│   │   ├── main.ts          # Electron main process — window, IPC handlers, ffmpeg
│   │   └── caputure.ts      # Legacy/unused boilerplate (not integrated)
│   ├── preload/
│   │   └── preload.ts       # contextBridge — exposes safe APIs to renderer
│   └── renderer/
│       ├── index.html       # Single-page shell (all UI declared here)
│       ├── style.css        # Dark-theme CSS (~500 lines, Flexbox layout)
│       ├── renderer.ts      # All renderer logic (~742 lines)
│       ├── electron-api.d.ts # Window.electronAPI type declaration
│       └── data/
│           └── pokemon.json # 10 Pokémon entries (id, name, types)
├── dist/                    # Build output (gitignored)
├── tsconfig.json
├── package.json
├── .vscode/
│   ├── launch.json          # Electron debug config
│   └── tasks.json           # npm build task
└── .gitignore
```

---

## Architecture: Electron Process Model

Electron separates code into three isolated layers. **Never mix concerns across these boundaries.**

```
┌─────────────────────────────────────────────┐
│  Renderer Process  (src/renderer/renderer.ts) │
│  - DOM manipulation, MediaRecorder, UI state  │
│  - Calls window.electronAPI.* for IPC         │
└────────────────┬────────────────────────────┘
                 │ contextBridge (secure)
┌────────────────▼────────────────────────────┐
│  Preload Script  (src/preload/preload.ts)    │
│  - Exposes safe subset of Electron APIs      │
│  - All ipcRenderer calls go here             │
└────────────────┬────────────────────────────┘
                 │ IPC channel
┌────────────────▼────────────────────────────┐
│  Main Process  (src/main/main.ts)            │
│  - BrowserWindow creation                    │
│  - ipcMain.handle / ipcMain.on handlers      │
│  - Spawns ffmpeg child process               │
│  - File system, OS, native APIs              │
└─────────────────────────────────────────────┘
```

### Security model
- `nodeIntegration: false` — renderer cannot access Node APIs directly
- `contextIsolation: true` — preload exposes only the `electronAPI` object
- CSP header: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`

---

## IPC API Contract

Defined in `src/renderer/electron-api.d.ts`. All communication between renderer and main goes through `window.electronAPI`:

| Method | Direction | Description |
|---|---|---|
| `getAppVersion()` | R→M | Returns app version string |
| `streamStart(settings)` | R→M (invoke) | Start ffmpeg RTMP stream; resolves `{ success, error? }` |
| `streamStop()` | R→M (invoke) | Stop active stream; resolves `{ success }` |
| `streamSendData(buffer)` | R→M (send) | Send WebM video chunk to ffmpeg stdin |
| `onStreamStatus(cb)` | M→R | Register callback for stream state updates |
| `removeStreamStatusListener()` | — | Unregister the status callback |

### IPC channel names (in main.ts)
- `stream:start`
- `stream:stop`
- `stream:data`
- `stream:status` (main → renderer push)

---

## Streaming Pipeline

```
Camera/Mic
    ↓ getUserMedia
MediaRecorder (WebM, ~100ms chunks)
    ↓ ondataavailable
electronAPI.streamSendData(buffer)
    ↓ IPC stream:data
ffmpeg stdin (pipe:0)
    ↓ -vcodec libx264 -acodec aac -f flv
RTMP server (YouTube / Twitch / custom)
```

ffmpeg is resolved from:
1. Bundled binary at `resources/ffmpeg` (platform-specific)
2. System PATH fallback

---

## Renderer UI Structure

The renderer is a single TypeScript file managing all UI. Key logical sections:

| Section | Responsibility |
|---|---|
| Device enumeration | Lists and selects video/audio devices on load |
| Stream controls | RTMP URL + stream key input, start/stop, bitrate select |
| Status indicator | Live dot, elapsed timer, error messages |
| Team manager | CRUD for Pokémon teams (max 6 per team) via modal |
| Tab system | Tab 1 = stream, Tab 2 = teams, Tab 3 = placeholder |

### localStorage keys
| Key | Value |
|---|---|
| `champions_last_video_device_id` | Last selected camera device ID |
| `champions_last_audio_device_id` | Last selected microphone device ID |
| `champions_team` | JSON array of team objects |
| `champions_stream_settings` | `{ rtmpUrl, videoBitrate }` |

---

## Data

**`src/renderer/data/pokemon.json`** — Array of 10 Pokémon:
```json
{ "id": 1, "name": "Pikachu", "types": ["Electric"] }
```
Fields: `id` (number), `name` (string), `types` (string[]).

---

## Development Commands

```bash
# Install dependencies
npm install

# Build (TypeScript compile + copy assets to dist/)
npm run build

# Build and launch the Electron app
npm run dev
# or
npm start
```

There is **no watch mode** — you must re-run `npm run build` after every TypeScript change before launching.

### Build output
`dist/` mirrors `src/` structure:
- `dist/main/main.js` — Electron entry point
- `dist/preload/preload.js`
- `dist/renderer/index.html`, `style.css`, `renderer.js`, `data/pokemon.json`

---

## TypeScript Configuration

`tsconfig.json` key settings:
- `"strict": true` — all strict checks enabled; **do not disable**
- `"target": "ES2020"` and `"lib": ["ES2020", "DOM"]`
- `"module": "commonjs"` — required for Electron main process
- `"outDir": "dist"`, `"rootDir": "src"`
- `"sourceMap": true`, `"declaration": true`

---

## Coding Conventions

### General
- All source files use TypeScript with strict typing — no `any` unless absolutely necessary
- Use `async/await` for async operations (IPC invoke calls return Promises)
- UI text and comments are written in **Japanese**
- Commit messages follow Japanese conventions with English prefixes (`feat:`, `fix:`)

### Renderer (renderer.ts)
- Direct DOM manipulation (no framework) — use `document.getElementById()` with null checks
- LocalStorage read/write for all user preferences
- Event listeners attached in a top-level init sequence after DOM load

### Main process (main.ts)
- Use `ipcMain.handle()` for request/response patterns (returns value to renderer)
- Use `ipcMain.on()` for fire-and-forget (e.g., streaming data chunks)
- Use `webContents.send()` to push events from main to renderer
- Spawn ffmpeg with `child_process.spawn()`, pipe stdin for video data

### Preload (preload.ts)
- Only add to `contextBridge.exposeInMainWorld` — never expose raw `ipcRenderer`
- Keep the preload thin; logic belongs in main or renderer

---

## VSCode Configuration

`.vscode/launch.json` provides two debug profiles:
- **"Debug Main Process"** — builds first, then attaches debugger to Electron main
- **"Debug (no build)"** — skips build, useful when dist/ is already up to date

`.vscode/tasks.json` defines a `npm: build` task used as `preLaunchTask`.

---

## No-Test / No-CI Status

This project currently has:
- No automated tests (no Jest, Mocha, or other test framework)
- No CI/CD pipelines (no `.github/workflows/`)
- No linting configuration (no ESLint or Prettier)

When adding tests or linting, update this file accordingly.

---

## Git Workflow

- Branch from `master` for features: `feature/<description>`
- Merge via pull requests
- Commit messages in Japanese with conventional prefixes: `feat:`, `fix:`, `chore:`, etc.
- The `dist/` directory and `node_modules/` are gitignored and never committed

---

## Known Quirks

- `src/main/caputure.ts` — misspelled filename ("caputure" not "capture"), unused legacy file; safe to ignore
- ffmpeg binary must be present at runtime; if missing, `stream:start` will fail gracefully with an error message sent back to the renderer via `stream:status`
- The app hardcodes a 1920×1080 window on fullscreen; layout is not responsive below that resolution
