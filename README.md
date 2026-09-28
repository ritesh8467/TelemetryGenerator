# Telemetry Generator

A comprehensive telemetry data generator for testing and development. Generate realistic logs, metrics, and traces with support for multiple export modes.

## Features

- **Multiple Data Types:**
  - **Logs:** Apache, Nginx, Syslog, Kubernetes Pod, AWS CloudTrail, PII, Microservice, CSIEM Security Events
  - **Metrics:** Host, Application, Kubernetes, Custom
  - **Traces:** HTTP Request, Database, Microservice Chain, Error Traces

- **Dual Export Modes:**
  - **HTTP Export:** Send to Sumo Logic HTTP endpoints with support for multiple simultaneous destinations
  - **Local File Export:** Write to local filesystem with automatic log rotation (10MB max, 2 files, 1-day retention)

- **Advanced Features:**
  - Run HTTP and File exports simultaneously on the same source
  - Per-endpoint enable/disable for HTTP destinations
  - Real-time health indicators (green/red status for each export mode)
  - Configurable interval and volume per source
  - Start All / Stop All bulk operations (preserves per-endpoint enabled states)
  - View recent telemetry samples
  - Source duplication and deletion
  - **Settings tab:** configure app name, timezone (applied to log timestamps), and version history limit
  - **Collapsible left sidebar** for navigating between Telemetry and Settings views

## Prerequisites

- Node.js 18+
- npm

## Installation

```bash
cd TelemetryGenerator
npm install
```

> A single `npm install` installs both root and backend dependencies automatically.

## Usage

### Start Development Server (with auto-reload)

```bash
npm run dev
```

### Start Production Server

```bash
npm start
```

The application will be available at `http://localhost:3000`

### Accessing the UI

1. Open browser to `http://localhost:3000`
2. Create a new source by clicking "+ Add Source"
3. Configure:
   - **Name:** Descriptive name for the source
   - **Data Type:** Logs, Metrics, or Traces
   - **Sub Type:** Specific generator variant
   - **Format:** Output format (text, JSON, etc.)
   - **HTTP Tab:** Configure HTTP endpoints (optional)
   - **File Tab:** Configure local file path (optional)
   - **Interval:** How often to generate data (seconds)
   - **Volume:** Records per generation
4. Enable HTTP and/or File export via toggles on the source tile
5. Click the export toggles to start/stop individual modes

## Configuration

### HTTP Export

- Add one or more HTTP endpoints
- Each endpoint can be independently enabled/disabled
- Supports Sumo Logic HTTP Source format
- Source Category and Source Host metadata (HTTP-only)

### Local File Export

- Specify a writable file path (e.g., `/tmp/telemetry.log` or `~/logs/telemetry.log`)
- Automatic rotation when file reaches 10MB
- Maximum 2 files kept (active + 1 backup)
- Files older than 1 day are automatically cleaned up

## API Endpoints

### Sources

- `GET /api/sources` - List all sources
- `POST /api/sources` - Create source
- `PUT /api/sources/:id` - Update source
- `DELETE /api/sources/:id` - Delete source
- `POST /api/sources/:id/toggle` - Toggle source on/off
- `POST /api/sources/:id/toggle-http` - Toggle HTTP export
- `POST /api/sources/:id/toggle-file` - Toggle File export
- `POST /api/sources/:id/duplicate` - Duplicate source
- `GET /api/sources/:id/recent` - Get recent telemetry samples
- `POST /api/sources/start-all` - Start all sources
- `POST /api/sources/stop-all` - Stop all sources

### Settings

- `GET /api/settings` - Get app settings (appName, timezone, maxVersions)
- `PUT /api/settings` - Update settings (partial update supported)

### Statistics

- `GET /api/stats` - Get aggregate statistics

## Project Structure

```
TelemetryGenerator/
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── server.js              # Express server entry point
│   │   ├── config.js              # Config persistence (draft/publish/versions)
│   │   ├── settings.js            # App settings persistence (appName, timezone, maxVersions)
│   │   ├── sourceManager.js       # Worker lifecycle management
│   │   ├── routes/
│   │   │   ├── sources.js         # Source CRUD routes
│   │   │   ├── settings.js        # GET/PUT /api/settings
│   │   │   └── stats.js           # Statistics routes
│   │   ├── workers/
│   │   │   └── sourceWorker.js    # Tick loop for data generation
│   │   ├── generators/
│   │   │   ├── logs/              # Log generators (timezone-aware)
│   │   │   ├── metrics/           # Metric generators
│   │   │   └── traces/            # Trace generators
│   │   ├── utils/
│   │   │   └── time.js            # Timezone-aware timestamp formatters
│   │   └── senders/
│   │       ├── logSender.js       # HTTP log sender
│   │       ├── metricSender.js    # HTTP metric sender
│   │       ├── traceSender.js     # HTTP trace sender
│   │       └── fileSender.js      # File sender with rotation
│   └── data/
│       ├── config.json            # Persisted source configs
│       └── settings.json          # Persisted app settings
├── frontend/
│   ├── index.html                 # App shell with collapsible sidebar + two-tab layout
│   ├── app.js                     # SPA logic
│   └── styles.css                 # Dark theme styles
└── package.json
```

## Health Indicators

- **🟢 Green dot:** Export mode working (successful send)
- **🔴 Red dot:** Export mode failed (errors detected)
- Green indicator appears only when the mode is enabled

## Source Activity Status

- **Running:** At least one export mode (HTTP or File) is enabled
- **Stopped:** No export modes are enabled

## Error Handling

- **HTTP Errors:** Displayed on health indicators, detailed in recent logs view
- **File Errors:** Permission denied errors suggest using `/tmp/` or home directory
- **Validation:** Source must have at least HTTP or File export enabled to run

## License

MIT

## Contributing

Feel free to submit issues and enhancement requests!
