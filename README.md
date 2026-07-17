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

Platform builds and website:

```bash
npm run build:mac       # universal Intel + Apple Silicon DMG
npm run build:linux     # x64 AppImage
npm run build:site      # static Vercel landing page
npm run test:runtime
```

The macOS command stages both architecture variants of Sharp, libvips, and
FFmpeg in the dependency tree before electron-builder merges the app.
This is required even when the build runs on Apple Silicon.

## Production runtime

The public desktop build is self-contained and does not require a system Node.js
installation. Electron starts the local services in this order:

1. Install the pinned Supermemory Local runtime on first launch.
2. Start Supermemory and wait for port `6767` to become healthy.
3. Start the capture backend in an Electron utility process and wait for port
   `3030`.
4. Open onboarding or the main window.

Both managed services stop when SuperApp quits. Runtime binaries, credentials,
and diagnostics live inside SuperApp's OS user-data directory; captured content
continues to use `~/.superapp/`.

The first-launch setup window exposes installation progress, retry, and the local
runtime log. SuperApp never kills a process it did not start when a configured
port is already occupied.

### Publishing

Pushing a `v*` tag runs `.github/workflows/release.yml`, which validates the app
and site, builds a notarized universal DMG and x64 AppImage, creates SHA-256
checksums, and publishes them to GitHub Releases. The macOS job requires these
repository secrets:

- `MAC_CSC_LINK` and `MAC_CSC_KEY_PASSWORD`
- `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`
- `APPLE_TEAM_ID`

Unsigned local macOS packaging can be tested with
`CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac`.

The Vercel project uses the root `vercel.json`, builds `site/`, and links its
download buttons to the stable latest-release artifact names.

## Backend (capture engine)

SuperApp ships with a local capture engine in `backend/` that exposes a **Screenpipe-compatible REST API** on `http://127.0.0.1:3030`.

### What works today

- Event-driven-lite screen capture (deduped frames every ~2s)
- Active window + app metadata (Windows/macOS)
- Real on-screen text via Apple Vision OCR on macOS (Swift helper compiled on first run), Tesseract.js elsewhere/fallback; runs async off the capture path (`SUPERAPP_OCR_ENGINE=native|tesseract|off`)
- Local speech-to-text via whisper.cpp (Metal-accelerated, built on first run into `~/.superapp/whisper/`; `SUPERAPP_STT_ENGINE=auto|whisper|gemini`, Gemini cloud fallback while building)
- Meetings: audio sessions become meetings with transcripts, persisted notes, and Gemini summaries/action items
- Frames stored as fragmented MP4 chunks (`~/.superapp/video/`, readable while recording; `SUPERAPP_VIDEO_MAX_WIDTH` caps stored resolution) with on-demand frame extraction; legacy JPEG frames still served
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
- Pipes automation runtime, MCP server, semantic/embedding search
- Integrations (Slack, Notion, Obsidian, etc.)

## Connectors (Composio)

The **Connections** panel wires real third-party apps — **Gmail, Google Calendar,
Slack, Notion** — through [Composio](https://composio.dev) for managed OAuth. Once
connected, the chat AI can use them as tools (e.g. "summarize my unread gmail",
"add a 3pm calendar event", "post this to slack").

### Setup

**Only an API key is required.** Connectors use Composio-managed auth (Composio's
shared OAuth apps), so the per-app auth config is created automatically the first
time you connect — no dashboard configuration.

1. Create an account at [app.composio.dev](https://app.composio.dev) and grab an API key.
2. Add it to the project root `.env`:

   ```bash
   COMPOSIO_API_KEY=comp_...
   ```

3. Restart the app. Open **Connections**, click **connect** on an app, authorize in
   the browser, and it flips to **connected**. Composio hosts the OAuth callback, so
   no extra local setup is needed. Leaving `COMPOSIO_API_KEY` unset simply hides the
   connectors and leaves chat unchanged.

> Advanced: to bring your own OAuth credentials, create an auth config per app in the
> Composio dashboard and set `COMPOSIO_AUTH_CONFIG_GMAIL` / `_GOOGLECALENDAR` /
> `_SLACK` / `_NOTION` in `.env` to override the managed auth.

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
