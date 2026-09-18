# Telemetry Generator for Sumo Logic

## Overview

A tool for generating synthetic telemetry data (logs, metrics, traces) and sending it to Sumo Logic via HTTP Sources. Built for testing ingestion pipelines, dashboards, alerts, and parsers with realistic sample data.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web UI (:3000)                            │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │ Dashboard │  │ Source Detail │  │ Add/Edit Source Form      │ │
│  │ (cards)   │  │ (config+stats)│  │ (type, endpoint, freq)   │ │
│  └──────────┘  └──────────────┘  └───────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │ REST API
┌───────────────────────────▼─────────────────────────────────────┐
│                      Express Server                              │
│  ┌────────────┐  ┌────────────────┐  ┌───────────────────────┐ │
│  │ Config     │  │ Source Manager  │  │ Routes (CRUD+toggle)  │ │
│  │ (JSON file)│  │ (worker registry)│  │                       │ │
│  └────────────┘  └───────┬────────┘  └───────────────────────┘ │
│                           │                                      │
│  ┌────────────────────────▼─────────────────────────────────┐   │
│  │              Source Workers (setInterval each)            │   │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐           │   │
│  │  │ Worker 1 │    │ Worker 2 │    │ Worker 3 │  ...      │   │
│  │  └────┬─────┘    └────┬─────┘    └────┬─────┘           │   │
│  └───────┼───────────────┼───────────────┼──────────────────┘   │
│          │               │               │                       │
│  ┌───────▼───────┐ ┌────▼────────┐ ┌────▼────────┐             │
│  │  Generator    │ │  Generator  │ │  Generator  │             │
│  │  (pure func)  │ │  (pure func)│ │  (pure func)│             │
│  └───────┬───────┘ └────┬────────┘ └────┬────────┘             │
│          │               │               │                       │
│  ┌───────▼───────┐ ┌────▼────────┐ ┌────▼────────┐             │
│  │  Sender       │ │  Sender     │ │  Sender     │             │
│  │  (format+HTTP)│ │  (format+HTTP)│ │ (format+HTTP)│            │
│  └───────┬───────┘ └────┬────────┘ └────┬────────┘             │
└──────────┼───────────────┼───────────────┼──────────────────────┘
           │               │               │
           ▼               ▼               ▼
   ┌───────────────────────────────────────────────┐
   │         Sumo Logic HTTP Sources               │
   │  https://endpoint.collection.sumologic.com/   │
   │  receiver/v1/http/<TOKEN>                     │
   └───────────────────────────────────────────────┘
```

## Supported Data Types

### Logs

| Sub-type | Format | Description |
|----------|--------|-------------|
| Apache Access | text | Standard combined log format |
| Nginx Access | text | Nginx default access log format |
| Application JSON | json | Structured app logs with level, message, context |
| Syslog RFC 5424 | syslog | Priority, facility, severity, structured data |
| Kubernetes Pod | json | Pod logs with namespace, container, level metadata |
| AWS CloudTrail | json | API activity events with identity, source, parameters |
| Custom | text/json | User-defined template with variable substitution |

### Metrics

| Sub-type | Supported Formats | Description |
|----------|-------------------|-------------|
| Host | carbon2, prometheus, graphite | CPU, memory, disk I/O, network |
| Application | carbon2, prometheus, graphite | Request rate, latency percentiles, error rate |
| Kubernetes | carbon2, prometheus, graphite | Pod/node CPU, memory, restarts |
| Custom | carbon2, prometheus, graphite | User-defined metric names and tag sets |

### Traces

| Sub-type | Format | Description |
|----------|--------|-------------|
| HTTP Request | OTLP JSON | Multi-span: root → auth → handler → DB |
| Database | OTLP JSON | Connection → query → result processing |
| Microservice | OTLP JSON | Service-to-service call chain (3-5 services) |
| Error | OTLP JSON | Traces with exception events and error status |

## Configuration Schema

Each source is defined by:

```json
{
  "id": "uuid",
  "name": "Human-readable name",
  "enabled": true,
  "dataType": "logs | metrics | traces",
  "subType": "apache | nginx | host | httpRequest | ...",
  "endpointUrl": "https://endpoint.collection.sumologic.com/receiver/v1/http/TOKEN",
  "intervalSeconds": 10,
  "volumePerInterval": 50,
  "format": "text | json | syslog | carbon2 | prometheus | graphite | otlp",
  "metadata": {
    "sourceCategory": "prod/web/apache",
    "sourceHost": "web-01.prod.example.com",
    "fields": {}
  }
}
```

## HTTP Source Headers

All requests include:
- `Content-Type`: determined by format
- `X-Sumo-Category`: from `metadata.sourceCategory` (if set)
- `X-Sumo-Host`: from `metadata.sourceHost` (if set)
- `X-Sumo-Name`: from source `name`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sources` | List all sources with stats |
| GET | `/api/sources/:id` | Get single source detail |
| POST | `/api/sources` | Create new source |
| PUT | `/api/sources/:id` | Update source configuration |
| DELETE | `/api/sources/:id` | Delete source (stops worker first) |
| POST | `/api/sources/:id/toggle` | Toggle enabled state + start/stop worker |
| GET | `/api/stats` | Aggregate stats across all sources |

## UI Features

1. **Dashboard** — Card grid showing all sources with status indicator, data type badge, message count, error count, last sent time, and toggle switch
2. **Source Detail** — Click a card to view full configuration, live stats, and edit controls
3. **Add Source** — Form to create new sources with data type selection, sub-type, endpoint URL, frequency, and volume controls
4. **Real-time Stats** — Polling every 5 seconds updates message counts and status without page reload

## Quick Start

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Extensibility

**Adding a new log type:**
1. Create `backend/src/generators/logs/mytype.js` exporting `generate(count, opts)`
2. Register in `backend/src/generators/logs/index.js`
3. Add option to frontend sub-type dropdown

**Adding a new data category:**
1. Create generator directory under `backend/src/generators/`
2. Create corresponding sender in `backend/src/senders/`
3. Register in the worker's dispatch table

## Metric Formats Reference

**Carbon 2.0:**
```
metric=cpu.usage host=web-01 region=us-east-1  42.5 1693000000
```

**Prometheus:**
```
# HELP cpu_usage CPU usage percentage
# TYPE cpu_usage gauge
cpu_usage{host="web-01",region="us-east-1"} 42.5 1693000000000
```

**Graphite:**
```
servers.web-01.cpu.usage 42.5 1693000000
```

## OTLP Trace Format

```json
{
  "resourceSpans": [{
    "resource": {
      "attributes": [
        {"key": "service.name", "value": {"stringValue": "api-gateway"}}
      ]
    },
    "scopeSpans": [{
      "spans": [{
        "traceId": "abcdef1234567890abcdef1234567890",
        "spanId": "1234567890abcdef",
        "name": "GET /api/users",
        "kind": 2,
        "startTimeUnixNano": "1693000000000000000",
        "endTimeUnixNano": "1693000000150000000",
        "attributes": [],
        "status": {"code": 1}
      }]
    }]
  }]
}
```
