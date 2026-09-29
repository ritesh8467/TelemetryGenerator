# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

```bash
# Install dependencies (root and backend in one step)
npm install

# Run development server (with auto-reload on file changes)
npm run dev

# Run production server
npm start

# Server runs on http://localhost:3000
```

## Project Overview

**Telemetry Generator** is a full-stack Node.js + vanilla JS application that generates realistic telemetry data (logs, metrics, traces) and sends it to multiple destinations simultaneously. It is designed for testing observability pipelines.

### Architecture

**Frontend (SPA):**
- Vanilla JavaScript with no frameworks
- Two-tab layout: **Telemetry** (source grid) and **Settings** (app config), switched via collapsible left sidebar
- Single modal reused for all views (add/edit/detail modals)
- Polling-based state sync every 5 seconds (`GET /api/sources`, `/api/stats`)
- State object: `{ sources: [], filter: 'all', activeTab, settings }`

**Backend (Express):**
- In-memory worker pool (`sourceManager.js`) manages tick loops for each active source
- Config persistence layer (`config.js`) — changes save immediately to `config.json` and snapshot a version
- Three sender types (HTTP, File, File-with-rotation) format and send data

**Data Flow:**
1. User edits a source and clicks **Save** → change written immediately to `config.json` + version snapshot created + worker restarted
2. Worker ticks every N seconds → generator creates fake data → sender formats and emits (HTTP/File) → health status updated
3. Version history is the rollback mechanism — any previous snapshot can be restored via the UI

### Key Design Decisions

- **Immediate save:** Every add/edit/delete writes directly to `config.json` and creates a version snapshot. There is no draft/publish step.
- **Version history:** Configurable number of snapshots stored in `backend/data/versions/` (default 10, max 100; set in Settings). Versions can be pinned to prevent auto-deletion.
- **Single-file backup:** `flushNow()` creates `config.json.backup` before writes (safety net).
- **Settings persistence:** App name, timezone, max versions, and global override stored in `backend/data/settings.json`; loaded before config on startup.
- **Global override:** Settings tab has an optional override for interval and volume that applies to all sources simultaneously.
- **Timezone-aware timestamps:** Log generators accept `opts.timezone` (IANA string) and use `formatISOInZone` / `formatApacheTimestamp` from `backend/src/utils/time.js`.
- **No database:** Config is JSON files on disk; no external dependencies.

## Config Safety Rule

**Before making ANY change to `backend/data/config.json` or version files, ensure:**
1. A timestamped backup exists (automatic via `flushNow()` or manual copy)
2. Never modify or delete config files without explicit user consent
3. The backup mechanism in `config.js` must remain in place and never be bypassed
4. When implementing version migrations, always preserve the previous state

## Important Files & Patterns

### Frontend

- **`frontend/app.js`** (1000+ lines)
  - `fetchSources()` — polls current sources and re-renders the grid
  - Form rendering uses template literals; fields save immediately on submit
  - Modal pattern: set innerHTML of `#modal-content`, call `openModal()`, listen for form submit
  - `SUB_TYPES` and `FORMATS` constants at the top of the file control the dropdowns
  - `showVersionHistory()` — lists versions with Preview (diff), Pin/Unpin, and Restore actions

- **`frontend/styles.css`** — CSS variables for theming; BEM-like naming; toggle/tab patterns; sidebar collapse transition
- **`frontend/index.html`** — `.app-shell` flex layout with `.app-sidebar` (collapsible, 220px↔52px) and `.app-main` containing two `.app-tab` divs (`#tab-telemetry`, `#tab-settings`); modal overlay at document level

### Backend

- **`backend/src/config.js`** — single source of truth for config state
  - `load()` — reads `config.json` on startup, applies migrations
  - `upsert(source)` — update or insert a source in memory; schedules a flush
  - `remove(id)` — remove a source from memory; schedules a flush
  - `applyNow()` — snapshot to version history + write `config.json` immediately; called after every CRUD operation
  - `getVersions()` / `getVersion(n)` / `restoreVersion(n)` — version management
  - `pinVersion(n)` — toggle pinned flag on a version (pinned versions are never auto-deleted)
  - All date/time values are ISO 8601 strings

- **`backend/src/settings.js`** — settings persistence module
  - `load()` — reads `settings.json`, merges with defaults, creates file if absent
  - `get()` — returns copy of current in-memory settings
  - `save(updates)` — validates and writes; fields: `appName`, `timezone`, `maxVersions`, `overrideEnabled`, `globalIntervalSeconds`, `globalVolumePerInterval`

- **`backend/src/utils/time.js`** — timezone-aware timestamp formatters
  - `formatISOInZone(date, timezone)` — ISO-8601 with correct offset (e.g. `2026-09-28T03:45:11-04:00`)
  - `formatApacheTimestamp(date, timezone)` — Apache log format (e.g. `28/Sep/2026:03:45:11 -0400`)

- **`backend/src/routes/config.js`**
  - `GET /status` — returns `{hasDraft, draftChanges, publishedCount, currentVersion}`
  - `GET /versions` — lists snapshots with pinned flag
  - `POST /versions/:n/restore` — restores old version, saves current as new snapshot first
  - `POST /versions/:n/pin` — toggle pinned flag

- **`backend/src/routes/settings.js`**
  - `GET /` — returns current settings
  - `PUT /` — validates and saves; restarts workers if override or interval changed

- **`backend/src/routes/sources.js`**
  - `GET /` — returns published sources with live health status merged in
  - `POST /`, `PUT /:id`, `DELETE /:id` — write to published config immediately via `applyNow()`; restart affected worker
  - Toggle routes (`toggle`, `toggle-endpoint`, `toggle-file-output`) — update published + restart worker
  - `POST /start-all`, `stop-all` — controls workers only (does NOT modify `enabled` state)

- **`backend/src/sourceManager.js`** — in-process worker registry
  - `start(sourceId)` — creates a worker, sets up `setInterval` tick (respects global override interval)
  - `stop(sourceId)` — clears interval, removes from map
  - `restart(sourceId)` — stop + start if currently active
  - `startAll()` / `stopAll()` — iterate all published sources

- **`backend/src/workers/sourceWorker.js`** — generates and sends telemetry
  - `tick()` called every N seconds; calls generator → sender; respects global override volume
  - Tracks health status (green/red/mixed) per endpoint
  - Recent logs and error logs stored in Map; entries trimmed to 20/50 max

- **`backend/src/generators/`** — data generation per type/subtype
  - Each file exports `generate(count, opts)` returning an array of records
  - Uses `@faker-js/faker` for realistic data; `opts.timezone` is always passed in

- **`backend/src/senders/`** — format and send data
  - `logSender.js` — text: plain lines joined by `\n`; json: NDJSON (one JSON object per line); syslog: plain lines
  - `metricSender.js` — carbon2, prometheus, graphite, otlp (OTLP JSON `ResourceMetrics`)
  - `traceSender.js` — otlp (OTLP JSON `ExportTraceServiceRequest`); flattens generator array into single payload
  - `fileSender.js` — file writer with rotation (10 MB max, 2 files, 1-day retention)

### Backend Data Structure

```javascript
// Source object (in config.json)
{
  id: "uuid",
  name: "string",
  dataType: "logs" | "metrics" | "traces",
  subType: "apache" | "nginx" | "appJson" | "syslog" | "k8sPod" | "cloudtrail" | "pii" | "microservice" | "csiem" | "custom"
         | "host" | "application" | "kubernetes"   // metrics
         | "httpRequest" | "database" | "microservice" | "error" | "genai",  // traces
  format: "text" | "json" | "syslog"               // logs
        | "carbon2" | "prometheus" | "graphite" | "otlp"   // metrics
        | "otlp",                                   // traces
  enabled: boolean,          // source-level on/off; toggled by the run switch
  httpEnabled: boolean,      // whether HTTP endpoints are active
  fileEnabled: boolean,      // whether file outputs are active
  endpointUrls: [{ url: "string", label: "string", enabled: boolean }],
  fileOutputs:  [{ path: "string", label: "string", enabled: boolean }],
  filePath: "string",        // legacy; mirrors fileOutputs[0].path
  intervalSeconds: number,
  volumePerInterval: number,
  metadata: { sourceCategory?: string, sourceHost?: string, serviceName?: string },
  stats: { messagesSent: number, errors: number, lastSentAt: ISO8601 | null, bytesSent: number, spansSent: number }
}
```

---

## Adding a New Source Type

This is the most common extension task. Follow these steps exactly to add a new generator without breaking anything.

### Overview of what "source type" means

A source type = one **generator file** + one entry in the **generator registry** + one entry in **SUB_TYPES** in the frontend. The sender (logSender, metricSender, traceSender) already handles formatting — you only need to produce raw data in the shape the sender expects.

### Step 1 — Create the generator file

Create `backend/src/generators/{dataType}/{subType}.js`.

The file **must** export a single named function:

```js
export function generate(count, opts = {}) {
  // count  — number of records to produce (integer >= 1)
  // opts   — { timezone: "America/New_York", sourceCategory, sourceHost, serviceName, ... }
  // return — array of records (see per-type shape below)
}
```

#### Generator contract by data type

---

**LOGS** — return `string[]`

Each element is one log line. For `text`/`syslog` format the sender joins them with `\n`. For `json` format the sender treats each string as a JSON object (NDJSON) — so either return pre-serialised JSON strings or plain text (the sender wraps plain text in `{timestamp, message, source}`).

```js
// text format — plain log lines
export function generate(count, opts = {}) {
  const { timezone = 'UTC' } = opts;
  const now = new Date();
  return Array.from({ length: count }, () => {
    const ts = formatApacheTimestamp(now, timezone); // or formatISOInZone
    return `${ts} INFO  my-service: ${faker.lorem.sentence()}`;
  });
}

// json format — return JSON strings (each will be one line in NDJSON body)
export function generate(count, opts = {}) {
  return Array.from({ length: count }, () =>
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: faker.helpers.arrayElement(['INFO', 'WARN', 'ERROR']),
      service: 'my-service',
      message: faker.lorem.sentence(),
      traceId: faker.string.hexadecimal({ length: 32, prefix: '' })
    })
  );
}
```

Import helpers at the top:
```js
import { faker } from '@faker-js/faker';
import { formatISOInZone, formatApacheTimestamp } from '../../utils/time.js';
```

---

**METRICS** — return `MetricRecord[]`

Each element must conform to the shape that metricSender understands:

```js
{
  name: string,           // metric name, e.g. "system.cpu.utilization"
  value: number,          // numeric value
  timestamp: number,      // Unix epoch in SECONDS (integer)
  type: "gauge" | "sum",  // used only for OTLP format; defaults to "gauge"
  tags: {                 // key-value string pairs; used for all formats
    host?: string,        // used by graphite as path prefix
    [key: string]: string
  }
}
```

```js
export function generate(count, opts = {}) {
  const host = opts.sourceHost || 'server-01';
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: count }, () => ({
    name: 'system.cpu.utilization',
    value: faker.number.float({ min: 0, max: 100, multipleOf: 0.01 }),
    timestamp: now,
    type: 'gauge',
    tags: { host, env: 'prod', region: 'us-east-1' }
  }));
}
```

The sender handles all four format translations automatically (carbon2, prometheus, graphite, otlp).

---

**TRACES** — return `TraceObject[]`

Each element is a complete OTLP `ExportTraceServiceRequest`-shaped object.
The traceSender flattens the array into a single `{resourceSpans: [...]}` before sending.

**Critical rules for OTLP JSON (Sumo Logic and OTel collectors are strict):**
- `traceId` — 32-char lowercase hex, **no `0x` prefix**
- `spanId` — 16-char lowercase hex, **no `0x` prefix**
- `parentSpanId` — **omit entirely** for root spans (do not set to `""`)
- `startTimeUnixNano` / `endTimeUnixNano` — **decimal string** (not a number); use BigInt arithmetic to avoid float precision loss
- `attributes` — must be OTLP KeyValue array: `[{key, value: {stringValue|intValue|doubleValue|boolValue}}]`
- `intValue` — must be a **decimal string** (`"500"` not `500`) per proto3 JSON encoding

```js
import { faker } from '@faker-js/faker';

function hexId(length) {
  return faker.string.hexadecimal({ length, prefix: '' }).toLowerCase();
}

function toNano(seconds) {
  return (BigInt(Math.round(seconds * 1000)) * 1_000_000n).toString();
}

function toOtlpAttributes(obj) {
  return Object.entries(obj || {}).map(([key, val]) => {
    let value;
    if (typeof val === 'string')       value = { stringValue: val };
    else if (typeof val === 'boolean') value = { boolValue: val };
    else if (Number.isInteger(val))    value = { intValue: String(val) };  // string, not number!
    else if (typeof val === 'number')  value = { doubleValue: val };
    else value = { stringValue: String(val) };
    return { key, value };
  });
}

export function generate(count, opts = {}) {
  return Array.from({ length: count }, () => {
    const traceId = hexId(32);
    const spanId  = hexId(16);
    const now     = Date.now() / 1000;

    const span = {
      traceId,
      spanId,
      // parentSpanId: omit for root span
      name: 'my.operation',
      kind: 2,  // SERVER
      startTimeUnixNano: toNano(now - 0.1),
      endTimeUnixNano:   toNano(now),
      attributes: toOtlpAttributes({
        'http.method': 'GET',
        'http.status_code': 200,
        'http.url': faker.internet.url(),
      }),
      status: { code: 1 },  // 1=OK, 2=ERROR
      events: []
    };

    return {
      resourceSpans: [{
        resource: {
          attributes: toOtlpAttributes({
            'service.name':    opts.serviceName || 'my-service',
            'service.version': '1.0.0',
          })
        },
        scopeSpans: [{
          scope: { name: 'my-tracer' },
          spans: [span]
        }]
      }]
    };
  });
}
```

### Step 2 — Register the generator

Open `backend/src/generators/index.js` and add the import + registry entry:

```js
// 1. Add import at the top
import * as myNewLogs from './logs/myNew.js';

// 2. Add to the generators object under the correct dataType key
const generators = {
  logs: {
    // ...existing...
    myNew: myNewLogs,
  },
  // ...
};
```

### Step 3 — Add to frontend dropdown

Open `frontend/app.js` and add to the `SUB_TYPES` constant near the top:

```js
const SUB_TYPES = {
  logs: [
    // ...existing entries...
    { value: 'myNew', label: 'My New Log Type' },
  ],
  // ...
};
```

Valid formats per data type (from the `FORMATS` constant):
- **logs**: `text`, `json`, `syslog`
- **metrics**: `carbon2`, `prometheus`, `graphite`, `otlp`
- **traces**: `otlp` (only)

### Step 4 — (Optional) Add a seed source

To pre-populate the app with a demo source on fresh install, add an entry to `SEED_SOURCES` in `backend/src/config.js`:

```js
{
  id: uuidv4(),
  name: 'My New Log Source',
  enabled: false,
  dataType: 'logs',
  subType: 'myNew',
  format: 'json',
  httpEnabled: true,
  fileEnabled: false,
  endpointUrls: [{ url: 'https://...YOUR_TOKEN...', label: 'Primary', enabled: true }],
  fileOutputs: [],
  filePath: '',
  intervalSeconds: 10,
  volumePerInterval: 50,
  metadata: { sourceCategory: 'prod/logs/mynew', sourceHost: 'server-01' },
  stats: { messagesSent: 0, errors: 0, lastSentAt: null }
}
```

### Step 5 — Verify

Restart the server (`npm run dev`), open the UI, click **+ Add Source**, and confirm the new sub-type appears in the dropdown. Add a source pointing at a real endpoint and check the green health indicator after the first tick.

---

## Existing Generator Quick Reference

| dataType | subType | Format(s) | What it produces |
|---|---|---|---|
| logs | apache | text | Apache Combined Log Format access logs |
| logs | nginx | text | Nginx access logs |
| logs | appJson | json | Structured JSON application logs |
| logs | syslog | syslog/text | RFC 5424 syslog messages |
| logs | k8sPod | json | Kubernetes pod logs with namespace/pod/container fields |
| logs | cloudtrail | json | AWS CloudTrail-style management events |
| logs | microservice | json | Multi-service microservice logs with realistic error scenarios |
| logs | pii | text/json | Logs containing PII fields (for masking/DLP testing) |
| logs | csiem | json | Security events (login, auth, network, threat) |
| logs | custom | text | Configurable custom template |
| metrics | host | carbon2/prometheus/graphite/otlp | CPU, memory, disk, network host metrics |
| metrics | application | otlp | HTTP, database, cache, queue application metrics |
| metrics | kubernetes | prometheus | Pod CPU/memory, node metrics |
| metrics | custom | carbon2 | Configurable custom metric |
| traces | httpRequest | otlp | HTTP request/response spans |
| traces | database | otlp | DB query spans (SELECT, INSERT, UPDATE) |
| traces | microservice | otlp | Multi-hop service chain with parent/child spans |
| traces | error | otlp | Spans with error status and exception events |
| traces | genai | otlp | LLM request spans with GenAI semantic conventions |

---

## Senders — Format Reference

### logSender.js
- `text` / `syslog` — joins records with `\n`, sends as `text/plain`
- `json` — NDJSON: records joined with `\n`; plain-text records wrapped in `{timestamp, message, source}`; sends as `application/json`
- Sumo Logic metadata headers: `X-Sumo-Category`, `X-Sumo-Host`, `X-Sumo-Name`

### metricSender.js
- `carbon2` — `metric=<name> <tags>  <value> <timestamp>` lines
- `prometheus` — `<name>{<labels>} <value> <timestamp_ms>` lines; content-type `application/vnd.sumologic.prometheus`
- `graphite` — `<host>.<name> <value> <timestamp>` lines
- `otlp` — `{resourceMetrics: [...]}` JSON; appends `/v1/metrics` to non-Sumo-Logic URLs

### traceSender.js
- `otlp` — flattens `TraceObject[]` → `{resourceSpans: [...]}` JSON; sends to endpoint as-is for Sumo Logic URLs (`receiver/v1/`), appends `/v1/traces` for generic OTel collector URLs

---

## API Endpoints

**Settings:**
- `GET /api/settings` — `{appName, timezone, maxVersions, overrideEnabled, globalIntervalSeconds, globalVolumePerInterval}`
- `PUT /api/settings` — partial update; restarts workers if override/interval changes

**Config/versions:**
- `GET /api/config/status` — `{publishedCount, currentVersion}`
- `GET /api/config/versions` — lists snapshots with `pinned` flag
- `GET /api/config/versions/:n` — full version detail with sources
- `POST /api/config/versions/:n/restore` — restore; saves current state as new version first
- `POST /api/config/versions/:n/pin` — toggle pinned (pinned versions are never auto-deleted)

**Sources:**
- `GET /api/sources` — published sources with live health/stats merged in
- `POST /api/sources` — add; saves immediately, creates version snapshot
- `PUT /api/sources/:id` — edit; saves immediately, restarts worker
- `DELETE /api/sources/:id` — delete; stops worker, saves immediately
- `POST /api/sources/:id/toggle` — start/stop a source
- `POST /api/sources/:id/toggle-endpoint/:index` — enable/disable one endpoint URL
- `POST /api/sources/:id/toggle-file-output/:index` — enable/disable one file output
- `POST /api/sources/start-all`, `stop-all` — bulk worker control (no config change)
- `POST /api/sources/reset-all-stats` — zero out all stats counters

---

## Common Development Tasks

### Add a new metric format

1. Add a `case` in `backend/src/senders/metricSender.js`
2. Add to `FORMATS.metrics` in `frontend/app.js`

### Add a new log format

1. Add a `case` in `backend/src/senders/logSender.js`
2. Add to `FORMATS.logs` in `frontend/app.js`

### Debug version history

```bash
# List versions and pin state
cat backend/data/versions/index.json | jq '[.versions[] | {version, publishedAt, pinned, sourceCount}]'

# Inspect a specific version's sources
cat backend/data/versions/v3_*.json | jq '.sources | map(.name)'
```

---

## Git & .gitignore

- `backend/data/config.json` — never tracked (user config)
- `backend/data/config.json.backup` — never tracked (temporary backup)
- `backend/data/settings.json` — never tracked (user settings)
- `backend/data/versions/` — never tracked (version history)
- `logs/` — never tracked (application logs)

---

## Debugging Tips

- **Source not appearing:** Check `GET /api/sources`; confirm the subType is registered in `generators/index.js` and listed in `SUB_TYPES` in `app.js`
- **Worker not ticking:** Check browser console for poll errors; verify `sourceManager.js` `start()` was called; check `GET /api/health`
- **HTTP 400 from Sumo Logic traces:** Verify `traceId`/`spanId` have no `0x` prefix, `intValue` is a string, and `parentSpanId` is omitted on root spans
- **File export failures:** Check file path permissions; errors logged to health status in `GET /api/sources`
- **Version history not working:** Verify `backend/data/versions/` directory exists; check `index.json` format

---

## Performance Notes

- Frontend polls every 5 seconds (configurable in `app.js`)
- Worker tick interval per source: 1–86400 seconds (also overridable globally via Settings)
- Volume per tick: 1–10000 records (also overridable globally)
- Recent logs/error logs trimmed to prevent memory bloat (20/50 max entries per source)
- Version history limited to `maxVersions` unpinned versions; pinned versions are kept indefinitely
