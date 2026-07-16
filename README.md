# SuperApp

AI-powered desktop app that captures your screen and audio locally, then connects that context to chat, timeline, pipes, and meetings.

## Stack

- **Electron 34** — multi-window desktop shell
- **Vite + React 18 + TypeScript** — renderer
- **Tailwind CSS + Radix UI** — B&W geometric minimalism design system
- **Zustand** — client state (chat, settings, onboarding, recording)

## Design

- Pure grayscale palette, `--radius: 0` (sharp corners)
- JetBrains Mono typography, 150ms transitions, hover color inversion
- Light/dark/system theme with FOUC prevention
- Resizable collapsible sidebar with portal pattern

AIDesigner reference run: `.aidesigner/runs/2026-07-14T16-19-27-683Z-desktop-productivity-app-black-white/`

## Windows

| Route | Purpose |
|-------|---------|
| `/home` | Main dashboard — chat, timeline, pipes, meetings, brain, connections, help |
| `/settings` | Grouped settings with 13 sections |
| `/onboarding` | First-run wizard (login → permissions → engine → apps → pipe) |
| `/search` | Floating global search (`⌘K`) |
| `/chat` | Standalone chat window (`⌘N`) |

## Getting started

```bash
npm install
npm approve-scripts electron esbuild   # first time only
npm run dev
```

Production build:

```bash
npm run build
```

## Backend (capture engine)

SuperApp ships with a local capture engine in `backend/` that exposes a **Screenpipe-compatible REST API** on `http://127.0.0.1:3030`.

### What works today

- Event-driven-lite screen capture (deduped frames every ~2s)
- Active window + app metadata (Windows/macOS)
- Real on-screen text via Apple Vision OCR on macOS (Swift helper compiled on first run), Tesseract.js elsewhere/fallback; runs async off the capture path (`SUPERAPP_OCR_ENGINE=native|tesseract|off`)
- Local speech-to-text via whisper.cpp (Metal-accelerated, built on first run into `~/.superapp/whisper/`; `SUPERAPP_STT_ENGINE=auto|whisper|gemini`, Gemini cloud fallback while building)
- Meetings: audio sessions become meetings with transcripts, persisted notes, and Gemini summaries/action items
- SQLite storage + FTS5 full-text search
- REST API: `/health`, `/search`, `/frames`, `/vision/list`, `/audio/list`, `/engine/*`
- Electron auto-starts the engine on launch

### Data directory

Captured data is stored in `~/.superapp/` (frames, SQLite DB, audio).

### Run backend standalone

```bash
npm run backend:install
npm run backend:dev
```

### API examples

```bash
curl http://localhost:3030/health
curl "http://localhost:3030/search?q=meeting&limit=10"
curl http://localhost:3030/frames?limit=20
```

### Still to build (Screenpipe parity)

- True event-driven capture (app switches, clicks, scroll)
- Native accessibility tree extraction (UI Automation / AX API)
- Speaker diarization
- MP4 video-chunk frame storage (currently one JPEG per frame)
- Pipes automation runtime, MCP server, semantic/embedding search
- Integrations (Slack, Notion, Obsidian, etc.)

## Mock backend (legacy)

Core UI interactions previously used local mock state. Search, timeline, recording status, and chat context now use the real backend when the engine is running.

## Project layout

```
electron/          Main process + preload + backend manager
backend/           Capture engine + Screenpipe-compatible API
src/
  components/      UI primitives, sidebar, chat, sections
  pages/           Route pages
  lib/stores/      Zustand stores
  lib/api/         Backend API client
  lib/hooks/       Theme, shortcuts
```
