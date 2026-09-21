# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

```bash
# Install dependencies (root and backend)
npm install && cd backend && npm install

# Run development server (with auto-reload on file changes)
npm run dev

# Run production server
npm start

# Server runs on http://localhost:3000
```

## Project Overview

**Telemetry Generator** is a full-stack Node.js + vanilla JS application that generates realistic telemetry data (logs, metrics, traces) and sends it to multiple destinations simultaneously. It's designed for testing observability pipelines.

### Architecture

**Frontend (SPA):**
- Vanilla JavaScript with no frameworks
- Single modal reused for all views (add/edit/detail modals)
- Polling-based state sync every 5 seconds (GET `/api/sources`, `/api/stats`, `/api/config/status`)
- State object: `{ sources: [], filter: 'all', hasDraft, draftChanges, draftSavedAt }`

**Backend (Express):**
- In-memory worker pool (`sourceManager.js`) manages tick loops for each active source
- Config persistence layer (`config.js`) handles publish/draft/version workflows
- Worker threads read from published config; CRUD operations write to draft
- Three sender types (HTTP, File, File-with-rotation) format and send data

**Data Flow:**
1. Frontend edits → save to draft (`config.draft.json`) → UI shows pending changes
2. User clicks Publish → draft applied to published config (`config.json`) → workers restart with new settings
3. Workers tick every N seconds → generators create fake data → senders emit (HTTP/File) → health status updates

### Key Design Decisions

- **Draft/Published split:** Edits don't go live until explicitly published. Allows safe iteration without disrupting active telemetry.
- **Version history:** Last 10 published snapshots stored in `backend/data/versions/` for rollback.
- **Single-file backup:** `flushNow()` creates `config.json.backup` before writes (safety net).
- **No database:** Config is JSON files on disk; no external dependencies.

## Config Safety Rule

**Before making ANY change to `backend/data/config.json`, `config.draft.json`, or version files, ensure:**
1. A timestamped backup exists (automatic via `flushNow()` or manual copy)
2. Never modify or delete config files without explicit user consent
3. The backup mechanism in `config.js` must remain in place and never be bypassed
4. When implementing version/draft migrations, always preserve the previous state

## Important Files & Patterns

### Frontend

- **`frontend/app.js`** (700+ lines)
  - `fetchSources()` – polls current sources (published or draft depending on status)
  - `renderStatusBar()` – shows draft/published indicator with publish/discard buttons
  - `publishDraft()` → POST `/api/config/publish` → restarts workers
  - Form rendering uses template literals; fields sync to draft on save
  - Modal pattern: set innerHTML of `#modal-content`, call `openModal()`, listen for form submit

- **`frontend/styles.css`** – CSS variables for theming; BEM-like naming; toggle/tab patterns
- **`frontend/index.html`** – minimal shell; toolbar, grid, modal overlay

### Backend

- **`backend/src/config.js`** – single source of truth for config state
  - `load()` – reads `config.json` on startup, applies migrations
  - `getDraft()` – returns `{sources, savedAt}` or null
  - `saveDraft(sources)` – writes to `config.draft.json`
  - `publish(draftSources)` – saves to version history, applies to `config.json`, discards draft
  - `getVersions()` / `getVersion(n)` / `restoreVersion(n)` – version management
  - All date/time values are ISO 8601 strings; comparison uses `new Date()` parsing

- **`backend/src/routes/config.js`** (new file)
  - GET `/status` – returns `{hasDraft, draftChanges, draftSavedAt, publishedCount, currentVersion}`
  - POST `/publish` – calls `stopAll()` → `config.publish()` → `startAll()`
  - GET `/versions` – lists last 10 published snapshots
  - POST `/versions/:n/restore` – restores old version, saves current as new version first

- **`backend/src/routes/sources.js`**
  - CRUD routes (POST, PUT, DELETE) operate on draft; if no draft exists, snapshot published first
  - Toggle routes (toggle-http, toggle-file) operate on published + sync to draft
  - GET `/` returns draft sources if draft exists, otherwise published sources
  - All source IDs are UUIDs; lookups use `.find(s => s.id === id)`

- **`backend/src/sourceManager.js`** – in-process worker registry
  - `start(sourceId)` creates a worker, sets up `setInterval` tick at `source.intervalSeconds * 1000`
  - `stop(sourceId)` clears interval, removes from map
  - `startAll()` / `stopAll()` iterate published config

- **`backend/src/workers/sourceWorker.js`** – generates and sends telemetry
  - `tick()` called every N seconds; calls generator → formatter → sender
  - Tracks health status (green/red) per endpoint
  - Recent logs and error logs stored in Map; old entries trimmed to 50/20

- **`backend/src/generators/`** – data generation per type/subtype
  - Each file exports `generate(count, opts)` returning array of records
  - Uses `@faker-js/faker` for realistic data
  - Examples: `logs/microservice.js` (8 services, realistic error scenarios), `traces/genai.js` (LLM spans)

- **`backend/src/senders/`** – format and send data
  - `logSender.js`, `metricSender.js`, `traceSender.js` – HTTP formatters
  - `fileSender.js` – file writer with rotation (10MB max, 2 files, 1-day retention)
  - OTLP format for metrics: converts to `ResourceMetrics` with service attributes

### Backend Data Structure

```javascript
// Source object (in config.json or draft)
{
  id: "uuid",
  name: "string",
  dataType: "logs" | "metrics" | "traces",
  subType: "apache" | "host" | "httpRequest" | "genai" | "pii" | "microservice" | "application",
  format: "text" | "json" | "carbon2" | "prometheus" | "graphite" | "otlp",
  httpEnabled: boolean,
  fileEnabled: boolean,
  endpointUrls: [{ url: "string", label: "string", enabled: boolean }],
  filePath: "string", // only used if fileEnabled
  intervalSeconds: number,
  volumePerInterval: number,
  metadata: { sourceCategory?: string, sourceHost?: string, serviceName?: string },
  stats: { messagesSent: number, errors: number, lastSentAt: ISO8601 | null }
}
```

## API Endpoint Changes (Draft/Publish)

**New endpoints:**
- GET `/api/config/status` – draft/published status
- DELETE `/api/config/draft` – discard pending changes
- POST `/api/config/publish` – apply draft to published
- GET `/api/config/versions` – list 10 previous versions
- GET `/api/config/versions/:n` – inspect specific version
- POST `/api/config/versions/:n/restore` – revert to old version

**Modified endpoints:**
- GET `/api/sources` – returns draft if exists, else published
- POST `/api/sources`, PUT `/api/sources/:id`, DELETE `/api/sources/:id` – write to draft
- POST `/api/sources/:id/toggle-http`, `toggle-file` – write to published + sync to draft
- POST `/api/sources/start-all`, `stop-all` – no draft involvement

## Common Development Tasks

### Add a new data generator

1. Create `backend/src/generators/{type}/{subtype}.js` exporting `generate(count, opts)`
2. Import and register in `backend/src/generators/index.js` under the appropriate `{ logs, metrics, traces }` section
3. Add to `SUB_TYPES` in `frontend/app.js`
4. Optional: add seed source in `backend/src/config.js` SEED_SOURCES for demo

### Add a new format (e.g., new trace format)

1. Update the appropriate sender in `backend/src/senders/{type}Sender.js` to handle the new format in the switch statement
2. Add to `FORMATS` in `frontend/app.js`
3. Test via the "Test Send" modal

### Modify config behavior

Config changes must preserve the draft/published separation:
- Reads during initialization → use `config.getAll()` (returns published)
- Writes from UI → route to `config.saveDraft()`
- Writes from operators (start-all, etc) → route to `config.upsert()` on published

### Debug version history

```bash
# List versions
cat backend/data/versions/index.json

# Inspect a specific version
cat backend/data/versions/v1_2026-09-21T*.json | jq '.sources | length'

# Manual restore (not recommended; use UI)
cp backend/data/versions/v1_2026-09-21T*.json backend/data/config.json.manual-restore
```

## Git & .gitignore

- `backend/data/config.json` – never tracked (user config)
- `backend/data/config.json.backup` – never tracked (temporary backup)
- `backend/data/versions/` – never tracked (version history)
- `logs/` – never tracked (application logs)

User should be informed if they accidentally commit config. Backups can be recovered from `git reflog` if versions were in a tracked branch.

## Debugging Tips

- **Sources not showing in UI:** Check `GET /api/sources` response; ensure workers are running with `GET /api/health`
- **Draft not persisting:** Verify `config.draft.json` exists; check `GET /api/config/status`
- **Workers not ticking:** Check browser console for 5-second poll errors; verify `sourceManager.js` interval is set
- **File export failures:** Check file path permissions; errors logged to health status in `GET /api/sources`
- **Version history not working:** Verify `backend/data/versions/` directory exists; check `index.json` format

## Performance Notes

- Frontend polls every 5 seconds (configurable in `app.js`)
- Worker tick intervals per source (configurable: 5-3600 seconds)
- Recent logs/error logs trimmed to prevent memory bloat (50/20 max entries per source)
- Version history limited to 10 files (oldest auto-deleted on publish)
