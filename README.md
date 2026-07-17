# SuperApp

[![Release validation](https://github.com/robu9/SuperApp/actions/workflows/release.yml/badge.svg)](https://github.com/robu9/SuperApp/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/robu9/SuperApp?display_name=tag)](https://github.com/robu9/SuperApp/releases/latest)
[![Platforms](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-black)](#supported-platforms)
[![License pending](https://img.shields.io/badge/license-pending-yellow)](#license)

SuperApp is a local-first AI desktop workspace that turns screen activity and
meetings into searchable context. It captures frames and audio on your device,
extracts text, builds a local memory graph, and lets you search, chat with, and
automate against that history.

The desktop application, capture backend, local database, managed Supermemory
runtime, landing site, and release workflow all live in this repository.

> [!IMPORTANT]
> This repository is publicly readable, but it does not have a software license
> yet. Until one is added, normal copyright restrictions apply. See
> [License](#license) before reusing or redistributing the code.

## What SuperApp does

- **Captures screen context locally** — deduplicated frames, active app/window
  metadata, OCR text, and fragmented MP4 storage.
- **Records meeting notes** — microphone and supported system audio are chunked,
  transcribed, stored, and turned into summaries and action items.
- **Searches your history** — SQLite FTS5 powers search across captured screen
  text and transcripts; `Cmd+K` opens the global search window.
- **Chats with your context** — typed and live-voice conversations can retrieve
  relevant local memories before calling Gemini.
- **Builds a memory graph** — Supermemory Local connects captured moments,
  meeting summaries, and generated memories into a navigable graph.
- **Runs workflows** — built-in daily summary, meeting recap, focus tracker, and
  action-item workflows operate on captured context.
- **Connects external apps optionally** — Gmail, Google Calendar, Slack, and
  Notion are available through Composio-managed OAuth.

## Current status

| Area | Status | Notes |
| --- | --- | --- |
| Screen capture | Available | Approximately every two seconds with frame deduplication |
| OCR | Available | Apple Vision on macOS; Tesseract.js fallback elsewhere |
| Timeline and search | Available | Local SQLite/FTS5 data and on-demand frame extraction |
| Meeting capture | Available | Microphone plus macOS/Linux system-audio paths |
| AI chat and summaries | Available with API key | Uses Gemini and may send retrieved context to Google |
| Live voice | Preview | Uses the configured Gemini Live model |
| Memory graph | Available | Requires the managed or standalone Supermemory Local service |
| Workflows | Available | Four built-in workflows; no third-party pipe marketplace yet |
| App connections | Optional | Requires Composio and the relevant external accounts |
| Packaged downloads | Available | Unsigned universal macOS DMG and Linux x64 AppImage |

SuperApp is not yet at full Screenpipe parity. Native accessibility-tree
extraction, speaker diarization, semantic search across the capture database,
an MCP server, and a general-purpose third-party pipe runtime remain roadmap
items.

## Local-first and privacy model

“Local-first” describes where capture and storage happen; it does not mean every
optional AI request is processed offline.

| Data or operation | Where it happens |
| --- | --- |
| Screenshots, video chunks, audio chunks, OCR, SQLite, and FTS search | On your device under `~/.superapp/` |
| Memory service and graph | Local Supermemory service on `127.0.0.1:6767` |
| Capture API | Local backend on `127.0.0.1:3030` |
| Chat, transcription, summaries, workflows, and live voice | Selected context is sent to the configured Gemini API |
| Gmail, Calendar, Slack, and Notion actions | Sent through Composio and the selected external service when explicitly connected/used |
| Landing-page analytics | Vercel Analytics records site/download events, not desktop capture content |

Review provider terms and avoid recording sensitive material you are not
authorized to capture. Recording controls can pause the full capture engine or
individual audio devices at any time.

## Supported platforms

- **macOS:** universal DMG for Apple Silicon and Intel. Screen Recording,
  Microphone, and Accessibility permissions are requested during onboarding.
  Releases are currently unsigned, so Gatekeeper may require **Open Anyway**.
- **Linux:** x64 AppImage. Audio capture depends on the host's available audio
  devices and tooling.
- **Windows:** some backend capture code has Windows paths, but Windows is not a
  supported packaged release target yet.

## Getting started from source

### Requirements

- Node.js 24
- npm 11 (the repository pins `npm@11.18.0`)
- A Gemini API key for transcription, chat, summaries, workflows, and live voice
- macOS or Linux for the supported desktop experience

### Install and run

```bash
git clone https://github.com/robu9/SuperApp.git
cd SuperApp
cp .env.example .env
npm install
npm run dev
```

Add your Gemini key to `.env` before testing AI features:

```dotenv
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

`npm install` also installs the backend dependencies. `npm run dev` starts
Supermemory Local on port `6767`, the capture backend on port `3030`, Vite, and
Electron. The first Supermemory startup may take longer while its local runtime
is prepared.

### Optional connectors

To expose Gmail, Google Calendar, Slack, and Notion in **Connections**, create a
[Composio](https://composio.dev) API key and add it to `.env`:

```dotenv
COMPOSIO_API_KEY=comp_...
```

Composio-managed auth is created when you connect an app. Advanced users can
override it with `COMPOSIO_AUTH_CONFIG_GMAIL`,
`COMPOSIO_AUTH_CONFIG_GOOGLECALENDAR`, `COMPOSIO_AUTH_CONFIG_SLACK`, or
`COMPOSIO_AUTH_CONFIG_NOTION`.

Leaving `COMPOSIO_API_KEY` unset disables connectors without affecting local
capture, search, or memory.

## Configuration

Common environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | Enables Gemini-backed AI features |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Text/transcription model |
| `GEMINI_LIVE_MODEL` | `models/gemini-3.1-flash-live-preview` | Live voice model |
| `GEMINI_LIVE_VOICE` | `Aoede` | Live voice preset |
| `COMPOSIO_API_KEY` | — | Enables optional app connections |
| `SUPERAPP_DATA_DIR` | `~/.superapp` | Capture database and media location |
| `SUPERAPP_PORT` | `3030` | Local capture API port |
| `SUPERAPP_CAPTURE_INTERVAL` | `2000` | Capture interval in milliseconds |
| `SUPERAPP_VIDEO_MAX_WIDTH` | `1920` | Maximum stored video width |
| `SUPERAPP_OCR_ENGINE` | `native` | `native`, `tesseract`, or `off` |
| `SUPERAPP_AUTO_START` | enabled | Set to `0` to prevent automatic capture |
| `SUPERAPP_AUDIO` | enabled | Set to `0` to disable audio capture |

See [.env.example](.env.example) and [backend/src/config.ts](backend/src/config.ts)
for the source of truth.

## Architecture

```text
Electron main process
├── manages desktop windows and OS permissions
├── starts/stops the managed Supermemory Local runtime (:6767)
└── starts/stops the capture backend utility process (:3030)
    ├── screen, window, OCR, video, and audio capture
    ├── SQLite + FTS5 storage
    ├── meeting transcripts and summaries
    ├── memory ingestion and retrieval
    ├── workflow scheduler/runners
    └── Gemini and optional Composio integrations

React renderer (Vite + TypeScript)
├── Chat, Timeline, Workflows, Meetings, Brain, and Connections
├── Zustand stores for local UI state
└── REST client for the loopback capture API
```

Key directories:

```text
electron/   Electron main process, preload bridge, and managed runtimes
backend/    Hono capture API, SQLite storage, AI, memory, and connectors
src/        React renderer, pages, components, stores, and API client
site/       Public landing page
scripts/    Development and packaging helpers
build/      Icons, entitlements, and runtime manifest
```

### Production runtime

Packaged builds are self-contained and do not require a system Node.js install.
On launch, Electron:

1. Installs the pinned Supermemory Local runtime when needed.
2. Starts it and waits for port `6767` to become healthy.
3. Starts the capture backend and waits for port `3030`.
4. Opens setup, onboarding, or the main application.

Both managed services stop with SuperApp. The runtime manager refuses to kill a
process it did not start when a configured port is already occupied. Runtime
credentials and redacted diagnostics live in Electron's OS user-data directory;
captured content remains under `~/.superapp/` unless configured otherwise.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Supermemory, backend, Vite, and Electron for development |
| `npm run typecheck` | Type-check the renderer and Electron TypeScript |
| `npm run backend:dev` | Run only the capture backend in watch mode |
| `npm run backend:build` | Compile the backend |
| `npm run test:runtime` | Run managed-runtime policy tests |
| `npm run build:site` | Type-check and build the landing site |
| `npm run build:mac` | Build an unsigned universal macOS DMG |
| `npm run build:linux` | Build a Linux x64 AppImage |
| `npm run build` | Compile and package the desktop application |

The macOS build stages both Sharp/libvips and FFmpeg architectures before
electron-builder creates the universal application.

## Local API

The capture engine exposes a Screenpipe-compatible REST API at
`http://127.0.0.1:3030`.

```bash
curl http://127.0.0.1:3030/health
curl "http://127.0.0.1:3030/search?q=meeting&limit=10"
curl "http://127.0.0.1:3030/frames?limit=20"
curl http://127.0.0.1:3030/meetings
curl http://127.0.0.1:3030/memory/stats
curl http://127.0.0.1:3030/pipes
```

Other endpoint groups include `/engine/*`, `/audio/*`, `/vision/*`, `/chat`,
`/memory/*`, `/meetings/*`, `/pipes/*`, and `/connectors/*`. The API binds to
loopback by default and is intended for the local desktop application.

## Building and releasing

```bash
npm run build:mac
npm run verify:package:mac
npm run build:linux
npm run build:site
```

Pushing a `v*` tag triggers [.github/workflows/release.yml](.github/workflows/release.yml).
The workflow validates the renderer, backend, runtime tests, and website; builds
the universal DMG and x64 AppImage; creates SHA-256 checksums; and publishes a
GitHub Release. Release artifacts are currently unsigned.

For a local unsigned macOS build:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac
```

## Troubleshooting

- **Ports `3030` or `6767` are occupied:** stop the conflicting local process,
  then restart SuperApp. The managed runtime intentionally does not terminate
  unknown processes.
- **Timeline is empty:** grant Screen Recording permission, verify recording is
  not paused, and check `http://127.0.0.1:3030/health`.
- **Meeting transcript is empty:** grant Microphone permission, select active
  audio devices, speak long enough for a roughly 30-second chunk, and verify the
  Gemini key.
- **Chat or summaries fail:** confirm `GEMINI_API_KEY` is set and restart the
  development services.
- **macOS permission was just enabled:** fully restart SuperApp so macOS applies
  the change.
- **Unsigned macOS release will not open:** use System Settings → Privacy &
  Security → **Open Anyway** only if you trust the downloaded artifact.

Packaged setup errors expose a **View logs** action. Development services also
write diagnostics to the terminal that launched `npm run dev`.

## Contributing

Issues and focused pull requests are welcome for discussion while the project
license is being selected. Before submitting a change:

1. Create a branch from the latest default branch.
2. Keep changes scoped and document any new environment variables or endpoints.
3. Run `npm run typecheck`, `npm run backend:build`, `npm run test:runtime`, and
   `npm run build:site`.
4. Explain user-visible behavior, platform impact, and privacy implications in
   the pull request.

Areas that especially benefit from contribution include accessibility-tree
capture, cross-platform audio reliability, speaker diarization, capture-engine
tests, semantic search, MCP support, and contributor documentation.

## License

No license has been selected yet. Public source visibility alone does not grant
permission to copy, modify, or redistribute the project. A root `LICENSE` file
and corresponding contributor guidance should be added before presenting the
repository as fully open source.

## Acknowledgements

- [Supermemory](https://supermemory.ai) for the local memory runtime and client.
- [Screenpipe](https://github.com/mediar-ai/screenpipe) for the local capture API
  conventions that SuperApp is working toward.
- Electron, React, Hono, SQLite, Gemini, and Composio for the application stack.
