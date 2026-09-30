# Telemetry Generator

A full-stack Node.js application that generates realistic telemetry data (logs, metrics, traces) and sends it to multiple destinations simultaneously. Designed for testing observability pipelines, including an **OTel Apps** mode that mimics real production software (nginx, MySQL, Kafka, Docker) so an OpenTelemetry collector can connect to it exactly as it would to the real thing.

## Features

### Data Generation

- **Logs** — Apache Combined, Nginx access/error, Structured JSON, Syslog (RFC 5424), Kubernetes Pod, AWS CloudTrail, PII (for masking/DLP testing), Microservice, CSIEM Security Events, Custom template
- **Metrics** — Host (CPU/memory/disk/network), Application (HTTP/cache/queue), Kubernetes pods/nodes, Custom
- **Traces** — HTTP Request, Database queries, Microservice chain (parent/child spans), Error traces with exceptions, GenAI (LLM request spans with OpenTelemetry GenAI semantic conventions)

### Export Modes

- **HTTP Export** — send to any HTTP endpoint (Sumo Logic, OTel collector, etc.) with support for multiple simultaneous destinations per source
- **Local File Export** — write to local filesystem with automatic rotation (10 MB max, 2 files, 1-day retention)
- Both modes can run simultaneously on the same source; each can be independently toggled

### OTel Apps — Native Protocol Servers

OTel Apps mimic real production applications at the protocol level. An OTel collector pointed at this app receives data indistinguishable from the real software:

| App | Protocol | Port | OTel Receiver |
|-----|----------|------|---------------|
| **nginx** | HTTP stub_status | 9113 | `nginx/` |
| **MySQL** | MySQL wire protocol (4.1+) | 3306 | `mysql` |
| **Kafka** | Kafka wire protocol | 9092 | `kafkametrics` |
| **Docker** | Docker HTTP API | 2375 | `docker_stats` |

Each OTel App also generates realistic logs and OTLP traces written to `/tmp/otel/`.

### App Management

- **Version history** — every save creates a snapshot; snapshots can be pinned to prevent auto-deletion; any version can be restored or previewed with a field-level diff
- **Global override** — Settings tab can override interval and volume across all sources at once
- **Collapsible sidebar** — navigate between Telemetry and OTel Apps tabs
- **Timezone-aware timestamps** — all log generators accept an IANA timezone string
- **Real-time health indicators** — per-endpoint green/red status updated after every tick
- **Bulk operations** — Start All / Stop All without affecting per-source enabled state

## Prerequisites

- Node.js 18+
- npm

## Installation

```bash
git clone https://github.com/ritesh8467/TelemetryGenerator.git
cd TelemetryGenerator
npm install
```

A single `npm install` installs both root and backend dependencies automatically.

## Usage

```bash
# Development (auto-reload on file changes)
npm run dev

# Production
npm start
```

The UI is available at `http://localhost:3000`.

## Quick Start

1. Open `http://localhost:3000`
2. Click **+ Add Source** in the Telemetry tab
3. Choose Data Type, Sub Type, Format, interval, and volume
4. Add an HTTP endpoint or file path (or both)
5. Toggle the source on — the health dot turns green on first successful send

For OTel Apps, click the **OTel Apps** tab in the sidebar, enable an app, then point your OTel collector at the corresponding port.

## OTel Collector Config Examples

### nginx metrics
```yaml
receivers:
  nginx:
    endpoint: http://localhost:9113/nginx_status
    collection_interval: 1m
```

### MySQL metrics
```yaml
receivers:
  mysql:
    endpoint: localhost:3306
    username: otel_monitor
    password: any_value_accepted
    collection_interval: 60s
```

### Kafka metrics
```yaml
receivers:
  kafkametrics:
    brokers: [localhost:9092]
    protocol_version: 2.0.0
    scrapers: [brokers, topics, consumers]
    collection_interval: 1m
```

### Docker metrics
```yaml
receivers:
  docker_stats:
    endpoint: http://localhost:2375
    collection_interval: 1m
```

### nginx logs
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

### MySQL logs
```yaml
receivers:
  filelog/mysql_error:
    include: [/tmp/otel/mysql/error.log]
    start_at: end
    operators:
      - type: regex_parser
        regex: '^(?P<timestamp>\d{4}-\d{2}-\d{2}T[\d:.]+Z) (?P<thread>\d+) \[(?P<level>[^\]]+)\] (?P<message>.*)'
  filelog/mysql_slow:
    include: [/tmp/otel/mysql/slow.log]
    start_at: end
    multiline:
      line_start_pattern: '^# Time:'
```

## Project Structure

```
TelemetryGenerator/
├── backend/
│   ├── package.json
│   └── src/
│       ├── server.js              # Express entry point; starts all protocol servers
│       ├── config.js              # Immediate-save config with version snapshots
│       ├── settings.js            # App settings (appName, timezone, maxVersions, override)
│       ├── sourceManager.js       # Worker lifecycle management
│       ├── metricsServer.js       # nginx stub_status (9113) + Docker HTTP API (2375)
│       ├── mysqlServer.js         # MySQL wire-protocol server (3306)
│       ├── kafkaServer.js         # Kafka wire-protocol server (9092)
│       ├── routes/
│       │   ├── sources.js         # Source CRUD + toggle routes
│       │   ├── config.js          # Version history routes
│       │   └── settings.js        # GET/PUT /api/settings
│       ├── workers/
│       │   └── sourceWorker.js    # Tick loop; writes OTel App log/trace files
│       ├── generators/
│       │   ├── logs/              # apache, nginx, nginxOtel, appJson, syslog, k8sPod,
│       │   │                      #   cloudtrail, microservice, pii, csiem, mysqlOtel,
│       │   │                      #   kafkaOtel, dockerOtel, custom
│       │   ├── metrics/           # host, application, kubernetes, nginxOtel, mysqlOtel,
│       │   │                      #   kafkaOtel, dockerOtel, custom
│       │   └── traces/            # httpRequest, database, microservice, error, genai,
│       │                          #   nginxOtel, mysqlOtel, kafkaOtel, dockerOtel
│       ├── senders/
│       │   ├── logSender.js       # text / json (NDJSON) / syslog
│       │   ├── metricSender.js    # carbon2 / prometheus / graphite / otlp
│       │   ├── traceSender.js     # otlp (flattens to single ResourceSpans payload)
│       │   └── fileSender.js      # file writer with rotation
│       └── utils/
│           └── time.js            # formatISOInZone, formatApacheTimestamp
├── frontend/
│   ├── index.html                 # App shell (collapsible sidebar, two-tab layout)
│   ├── app.js                     # SPA — polling, modals, version diff, OTel App UI
│   └── styles.css                 # Dark theme, CSS variables, BEM-like naming
└── package.json                   # Root: installs backend deps via postinstall
```

## API Reference

### Sources
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sources` | List all sources with live health/stats |
| `POST` | `/api/sources` | Create source (saves + snapshots immediately) |
| `PUT` | `/api/sources/:id` | Update source (saves + restarts worker) |
| `DELETE` | `/api/sources/:id` | Delete source |
| `POST` | `/api/sources/:id/toggle` | Start / stop a source |
| `POST` | `/api/sources/:id/toggle-endpoint/:index` | Enable / disable one HTTP endpoint |
| `POST` | `/api/sources/:id/toggle-file-output/:index` | Enable / disable one file output |
| `POST` | `/api/sources/start-all` | Start all workers (no config change) |
| `POST` | `/api/sources/stop-all` | Stop all workers (no config change) |
| `POST` | `/api/sources/reset-all-stats` | Zero all stats counters |

### Config / Versions
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/config/status` | `{publishedCount, currentVersion}` |
| `GET` | `/api/config/versions` | List snapshots with pinned flag |
| `GET` | `/api/config/versions/:n` | Full version with sources |
| `POST` | `/api/config/versions/:n/restore` | Restore version (current saved first) |
| `POST` | `/api/config/versions/:n/pin` | Toggle pinned (pinned versions never auto-deleted) |

### Settings
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/settings` | Get `{appName, timezone, maxVersions, overrideEnabled, globalIntervalSeconds, globalVolumePerInterval}` |
| `PUT` | `/api/settings` | Partial update; restarts workers if override/interval changes |

## Supported Formats

| Data Type | Formats |
|-----------|---------|
| Logs | `text`, `json` (NDJSON), `syslog` |
| Metrics | `carbon2`, `prometheus`, `graphite`, `otlp` |
| Traces | `otlp` |

## Security

Dependencies are kept up-to-date and audited. Run `npm audit` in the `backend/` directory to check the current status. The project targets zero high/critical vulnerabilities.

## License

MIT
