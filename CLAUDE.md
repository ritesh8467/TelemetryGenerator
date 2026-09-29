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

**Telemetry Generator** is a full-stack Node.js + vanilla JS application that generates realistic telemetry data (logs, metrics, traces) and sends it to multiple destinations simultaneously. It is designed for testing observability pipelines, including an **OTel Apps** mode that mimics real application telemetry (nginx, MySQL) so an OTel collector can connect to it exactly as it would to the real software.

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
  - `OTEL_APP_SIGNALS` — hardcoded file paths for OTel app log/trace outputs (nginx, MySQL)

- **`backend/src/metricsServer.js`** — nginx stub_status HTTP server on port **9113**
  - Serves `/nginx_status` in nginx stub_status format for the OTel `nginx/` receiver
  - State evolves every second (connections, requests, active/reading/writing/waiting)
  - Started automatically via `startMetricsServers()` in `server.js`

- **`backend/src/mysqlServer.js`** — MySQL wire protocol server on port **3306**
  - Speaks the real MySQL 4.1+ protocol; OTel `mysql` receiver connects to it like a real DB
  - Accepts any credentials; handles `SHOW GLOBAL STATUS`, `SHOW GLOBAL VARIABLES`, `performance_schema` queries
  - State evolves every second; returns realistic MySQL 8.0.35 metric values
  - Started automatically via `startMysqlServer()` in `server.js`

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

## OTel Apps — Mimicking Real Application Telemetry

OTel Apps (`dataType: 'otelApp'`) are a separate source category from regular push-based sources. They live in the **OTel Apps** sidebar tab and are designed to mimic the exact telemetry a real production application would emit — same log formats, same metric names, same trace attributes. An OTel collector should be able to point at this app and receive data indistinguishable from the real thing.

### Architecture

OTel Apps do **not** use the normal HTTP/file sender pipeline. Instead:

- **Logs** — written directly to fixed file paths under `/tmp/otel/` by `sourceWorker.js` using `OTEL_APP_SIGNALS` (hardcoded per subType)
- **Metrics** — served on dedicated TCP/HTTP ports by `metricsServer.js` (nginx) and `mysqlServer.js` (MySQL); the OTel collector scrapes/connects to these independently of the source worker tick
- **Traces** — written to OTLP JSON files under `/tmp/otel/` by `sourceWorker.js`; a collector reads these via filelog or the app pushes direct OTLP

Signal paths are defined in `backend/src/workers/sourceWorker.js` in the `OTEL_APP_SIGNALS` map.

### Design Rules

1. **Never use Prometheus receivers.** Always use the app's native OTel receiver or protocol:
   - nginx → `nginx/` receiver reading stub_status (HTTP, port 9113)
   - MySQL → `mysql` receiver connecting via MySQL wire protocol (TCP, port 3306) in `mysqlServer.js`
   - Kafka → `kafkametrics` receiver connecting via Kafka wire protocol (TCP, port 9092) in `kafkaServer.js`
   - Docker → `docker_stats` receiver connecting to Docker HTTP API (HTTP, port 2375) in `metricsServer.js`
   - Every future OTel App **must** implement the app's native protocol/API server — never fall back to a Prometheus HTTP scrape endpoint.

2. **Wire-protocol server pattern** — for apps where the OTel receiver connects to a TCP service:
   - Create `backend/src/{app}Server.js` (see `mysqlServer.js` for MySQL, `kafkaServer.js` for Kafka)
   - Export `start{App}Server(port)` and `stop{App}Server()`
   - Import and call `start{App}Server()` from `backend/src/server.js`
   - For HTTP-based APIs (like Docker daemon), add a `makeDockerApiServer(port)` function to `metricsServer.js` and call it from `startMetricsServers()`
   - The server must handle the minimal subset of the protocol needed by the OTel receiver

3. **Active ports:**
   - 9113 — nginx stub_status (`nginx/` receiver)
   - 3306 — MySQL wire protocol (`mysql` receiver)
   - 9092 — Kafka wire protocol (`kafkametrics` receiver)
   - 2375 — Docker HTTP API (`docker_stats` receiver)

4. **Log format must match the real app exactly** — timestamps, field order, multiline behaviour. OTel collector regex/multiline patterns are written against real app output; the generator must match them.
5. **Trace attributes follow OTel semantic conventions** (`db.system`, `http.method`, `net.peer.name`, etc.).
6. **Metrics reflect real OTel receiver output** — use the same metric names the real OTel receiver would produce (e.g., `kafka.brokers`, `container.cpu.usage.total`, not arbitrary names).

---

### Nginx OTel App (`subType: 'nginxOtel'`)

Mimics a production nginx 1.25 instance with the nginx-otel module enabled.

#### Logs

Two separate files written by the worker on each tick:

| File | Format | Generator |
|------|---------|-----------|
| `/tmp/otel/nginx/access.log` | Apache Combined + nginx timing fields | `generators/logs/nginxOtel.js` → `accessLog()` |
| `/tmp/otel/nginx/error.log` | nginx error log format | `generators/logs/nginxOtel.js` → `errorLog()` |

**Access log line format** (real nginx Combined + upstream timing):
```
1.2.3.4 - - [29/Sep/2026:03:45:11 +0000] "GET /api/v1/users HTTP/1.1" 200 1234 "https://ref.example.com" "Mozilla/5.0..." rt=0.123 uct="0.110" uht="0.110" urt="0.123"
```

**Error log line format** (real nginx error format — date uses `/` separators):
```
2026/09/29 03:45:11 [warn] 12345#12345: *789 upstream timed out (110: Connection timed out) while reading response header from upstream, client: 1.2.3.4, server: example.com, request: "GET /api/v1/users HTTP/1.1", upstream: "http://backend:8080/api/v1/users"
```
> **Important:** The timestamp must use `/` separators (`2026/09/29`) not ISO dashes, to match real nginx. The OTel collector multiline pattern for error logs should be `^\d{4}/\d{2}/\d{2} `.

**OTel collector config for logs:**
```yaml
receivers:
  filelog/nginx_access:
    include: [/tmp/otel/nginx/access.log]
    start_at: end
  filelog/nginx_error:
    include: [/tmp/otel/nginx/error.log]
    start_at: end
    multiline:
      line_start_pattern: '^\d{4}/\d{2}/\d{2} '
```

#### Metrics

Served by `metricsServer.js` on port **9113** at `/nginx_status` in nginx stub_status format:
```
Active connections: 291
server accepts handled requests
 16630948 16630948 31070465
Reading: 6 Writing: 179 Waiting: 106
```
State evolves every second to mimic a live server. Use the OTel **`nginx/` receiver** (not the prometheus receiver):
```yaml
receivers:
  nginx:
    endpoint: http://localhost:9113/nginx_status
    collection_interval: 1m
```

#### Traces

Written to `/tmp/otel/nginx-traces.json` as OTLP JSON (`ExportTraceServiceRequest`). Each span represents one HTTP request handled by nginx:
- `span.kind: SERVER`
- Attributes: `http.method`, `http.target`, `http.status_code`, `http.flavor`, `http.host`, `net.peer.ip`, `nginx.upstream_addr`, `nginx.upstream_response_time`, `nginx.request_time`
- Resource: `service.name`, `service.version: 1.25.3`, `host.name`, `process.runtime.name: nginx`
- Scope: `nginx-otel-module`
- Error spans (5xx) include an `upstream_error` event

To receive traces via OTLP push, configure an HTTP endpoint URL in the source pointing to `http://localhost:4318/v1/traces`.

---

### MySQL OTel App (`subType: 'mysqlOtel'`)

Mimics a production MySQL 8.0.35 instance with the OpenTelemetry plugin enabled.

#### Logs

Two separate files written by the worker on each tick:

| File | Format | Generator function |
|------|---------|-------------------|
| `/tmp/otel/mysql/error.log` | MySQL 8.0 error log | `generators/logs/mysqlOtel.js` → `errorLog()` |
| `/tmp/otel/mysql/slow.log` | MySQL slow query log | `generators/logs/mysqlOtel.js` → `slowQueryLog()` |

**Error log line format** (real MySQL 8.0):
```
2026-09-29T03:45:11.123456Z 0 [Warning] [MY-010055] [Server] IP address '1.2.3.4' could not be resolved
```
> Timestamp must be ISO 8601 with `T` and trailing `Z` (`2026-09-29T03:45:11.123456Z`), followed by thread ID, then `[level]`. The OTel collector regex for this is: `'^(?P<timestamp>\d{4}-\d{2}-\d{2}T[\d:.]+Z) (?P<thread>\d+) \[(?P<level>[^\]]+)\]'`

**Slow query log block format** (real MySQL slow log — multi-line):
```
# Time: 2026-09-29T03:45:11.123456Z
# User@Host: app_user[app_user] @ app-server-01 [1.2.3.4]
# Query_time: 5.123456  Lock_time: 0.000234 Rows_sent: 0  Rows_examined: 50000
SET timestamp=1727578511;
SELECT * FROM orders WHERE created_at > '2026-09-28' AND status IN ('active', 'pending') ORDER BY created_at DESC;
```

**OTel collector config for logs:**
```yaml
receivers:
  filelog/mysql_error:
    include: [/tmp/otel/mysql/error.log]
    start_at: end
    operators:
      - type: regex_parser
        regex: '^(?P<timestamp>\d{4}-\d{2}-\d{2}T[\d:.]+Z) (?P<thread>\d+) \[(?P<level>[^\]]+)\] (?P<message>.*)'
        timestamp:
          parse_from: attributes.timestamp
          layout: '2006-01-02T15:04:05.999999Z'
        severity:
          parse_from: attributes.level
          mapping:
            error: ERROR
            warn: Warning
            info: Note
  filelog/mysql_slow:
    include: [/tmp/otel/mysql/slow.log]
    start_at: end
    multiline:
      line_start_pattern: '^# Time:'
```

#### Metrics

Served by `mysqlServer.js` — a **real MySQL wire protocol server** on port **3306**. The OTel collector connects to it exactly as it would to a real MySQL instance. Any username/password is accepted.

Responds to:
- `SHOW GLOBAL STATUS` — 35+ real MySQL status variables (`Uptime`, `Threads_connected`, `Queries`, `Bytes_received`, `Innodb_buffer_pool_reads`, `Com_select`, `Handler_read_*`, etc.) with evolving counters
- `SHOW GLOBAL VARIABLES` — `innodb_buffer_pool_size`, `max_connections`, `version: 8.0.35`, etc.
- `SELECT ... FROM performance_schema.table_io_waits_summary_by_table` — rows for 6 production tables
- `SET`, `USE`, `BEGIN`, `COMMIT` → OK
- All other `SELECT`/`SHOW` queries → empty resultset

**OTel collector config for metrics:**
```yaml
receivers:
  mysql:
    endpoint: localhost:3306
    username: otel_monitor
    password: any_value_accepted
    collection_interval: 60s
```

#### Traces

Written to `/tmp/otel/mysql-traces.json` as OTLP JSON. Each span represents one MySQL query executed by the application:
- `span.kind: CLIENT`
- Attributes: `db.system: mysql`, `db.name: production`, `db.operation` (SELECT/INSERT/UPDATE/DELETE), `db.sql.table`, `db.statement`, `net.peer.name`, `net.peer.port: 3306`, `db.user: app_user`, `db.mysql.rows_affected`
- Resource: `service.name`, `db.system: mysql`, `db.version: 8.0.35`, `host.name`
- Scope: `mysql-otel-instrumentation`
- Slow queries (>200ms) include a `slow_query` event with `db.mysql.rows_examined`
- Failed queries (3%) include an `exception` event (`DeadlockException`, `LockWaitTimeout`, etc.)

To receive traces via OTLP push, configure an HTTP endpoint URL pointing to `http://localhost:4318/v1/traces`.

---

### Adding a New OTel App

1. **Create generators** — one file each under `generators/logs/`, `generators/metrics/` (if needed), `generators/traces/` for the new subType. Log formats and trace attributes must exactly match what the real application produces.

2. **Add signal config** — add an entry to `OTEL_APP_SIGNALS` in `backend/src/workers/sourceWorker.js` listing each file output path.

3. **Add metrics server** — pick the right pattern based on the app's native protocol:
   - **TCP binary protocol** (like MySQL wire protocol, Kafka wire protocol): Create `backend/src/{app}Server.js`, export `start{App}Server(port)` / `stop{App}Server()`, import and call from `server.js`. See `mysqlServer.js` (port 3306) and `kafkaServer.js` (port 9092) as reference implementations.
   - **HTTP REST API** (like Docker daemon API): Add a `make{App}ApiServer(port)` function to `metricsServer.js`, call it from `startMetricsServers()`. See `makeDockerApiServer(2375)` as reference.
   - **HTTP scrape** (like nginx stub_status): Add a handler to `metricsServer.js` and use the native OTel receiver (e.g., `nginx/`) — never use `prometheus/` receiver.
   - **Never use `prometheus/` receiver** unless there is literally no OTel-native receiver for the app.

4. **Register in frontend** — add to `OTEL_APP_SUBTYPES` in `frontend/app.js`:
   - Set `metricsPort` to the port your metrics server listens on
   - Set the metrics signal `displayPath` to the endpoint (e.g., `localhost:9092`, `http://localhost:2375`)
   - Add `sumoConfig` and `sumoConfigManaged` YAML snippets using the OTel-native receiver
   - Never put `prometheus/` in the generated OTel YAML configs

5. **Test with a real OTel collector** — point the collector at the fake endpoints and confirm data flows through to the backend (Sumo Logic or local debug exporter).

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
