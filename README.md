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

## Mock backend

Core interactions work with local mock state:

- Chat sends messages and receives simulated AI replies
- Recording status with device toggle, pause/resume, meeting notes
- Timeline frame scrubber, pipe install/run, connection toggles
- Settings persist to localStorage

To connect a real capture engine, wire `electron/main.ts` IPC to your local API at `:3030`.

## Project layout

```
electron/          Main process + preload
src/
  components/      UI primitives, sidebar, chat, sections
  pages/           Route pages
  lib/stores/      Zustand stores
  lib/hooks/       Theme, shortcuts
```
