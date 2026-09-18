# Commands Reference

## Setup

```bash
# Install dependencies
cd backend
npm install
```

## Running the Application

```bash
# Development mode (auto-restarts on file changes)
npm run dev

# Production mode
npm start
```

Server starts at **http://localhost:3000**

To use a custom port:

```bash
PORT=4000 npm run dev
```

## API Commands (curl)

### Sources

```bash
# List all sources
curl http://localhost:3000/api/sources

# Get a single source by ID
curl http://localhost:3000/api/sources/<SOURCE_ID>

# Create a new source
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Apache Logs",
    "dataType": "logs",
    "subType": "apache",
    "format": "text",
    "endpointUrl": "https://endpoint.collection.sumologic.com/receiver/v1/http/YOUR_TOKEN",
    "intervalSeconds": 10,
    "volumePerInterval": 100,
    "enabled": true,
    "metadata": {
      "sourceCategory": "prod/web/apache",
      "sourceHost": "web-01.prod.example.com"
    }
  }'

# Update an existing source
curl -X PUT http://localhost:3000/api/sources/<SOURCE_ID> \
  -H "Content-Type: application/json" \
  -d '{
    "intervalSeconds": 30,
    "volumePerInterval": 200
  }'

# Toggle a source on/off
curl -X POST http://localhost:3000/api/sources/<SOURCE_ID>/toggle

# Delete a source
curl -X DELETE http://localhost:3000/api/sources/<SOURCE_ID>
```

### Stats

```bash
# Get aggregate stats across all sources
curl http://localhost:3000/api/stats

# Health check
curl http://localhost:3000/api/health
```

## Creating Sources by Type

### Log Sources

```bash
# Apache Access Logs
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Apache Logs",
    "dataType": "logs",
    "subType": "apache",
    "format": "text",
    "endpointUrl": "YOUR_SUMO_HTTP_SOURCE_URL",
    "intervalSeconds": 10,
    "volumePerInterval": 100,
    "enabled": false
  }'

# Nginx Access Logs
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nginx Logs",
    "dataType": "logs",
    "subType": "nginx",
    "format": "text",
    "endpointUrl": "YOUR_SUMO_HTTP_SOURCE_URL",
    "intervalSeconds": 10,
    "volumePerInterval": 50,
    "enabled": false
  }'

# Application JSON Logs
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "App JSON Logs",
    "dataType": "logs",
    "subType": "appJson",
    "format": "json",
    "endpointUrl": "YOUR_SUMO_HTTP_SOURCE_URL",
    "intervalSeconds": 5,
    "volumePerInterval": 200,
    "enabled": false,
    "metadata": {
      "serviceName": "order-service",
      "sourceCategory": "prod/app/orders"
    }
  }'

# Syslog RFC 5424
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Syslog Feed",
    "dataType": "logs",
    "subType": "syslog",
    "format": "text",
    "endpointUrl": "YOUR_SUMO_HTTP_SOURCE_URL",
    "intervalSeconds": 15,
    "volumePerInterval": 50,
    "enabled": false,
    "metadata": {
      "sourceHost": "server-01.dc1.example.com"
    }
  }'

# Kubernetes Pod Logs
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "K8s Pod Logs",
    "dataType": "logs",
    "subType": "k8sPod",
    "format": "json",
    "endpointUrl": "YOUR_SUMO_HTTP_SOURCE_URL",
    "intervalSeconds": 10,
    "volumePerInterval": 100,
    "enabled": false,
    "metadata": {
      "namespace": "production",
      "cluster": "prod-us-east-1"
    }
  }'

# AWS CloudTrail Logs
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CloudTrail Events",
    "dataType": "logs",
    "subType": "cloudtrail",
    "format": "json",
    "endpointUrl": "YOUR_SUMO_HTTP_SOURCE_URL",
    "intervalSeconds": 60,
    "volumePerInterval": 20,
    "enabled": false,
    "metadata": {
      "accountId": "123456789012",
      "sourceCategory": "aws/cloudtrail"
    }
  }'

# Custom Template Logs
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Custom Logs",
    "dataType": "logs",
    "subType": "custom",
    "format": "text",
    "endpointUrl": "YOUR_SUMO_HTTP_SOURCE_URL",
    "intervalSeconds": 10,
    "volumePerInterval": 50,
    "enabled": false,
    "metadata": {
      "template": "{timestamp} {level} [{service}] {method} {path} {status} {duration}ms"
    }
  }'
```

### Metric Sources

```bash
# Host Metrics (Carbon 2.0 format)
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Host Metrics - Carbon2",
    "dataType": "metrics",
    "subType": "host",
    "format": "carbon2",
    "endpointUrl": "YOUR_SUMO_HTTP_SOURCE_URL",
    "intervalSeconds": 30,
    "volumePerInterval": 10,
    "enabled": false,
    "metadata": {
      "sourceHost": "web-01.prod.example.com",
      "region": "us-east-1"
    }
  }'

# Host Metrics (Prometheus format)
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Host Metrics - Prometheus",
    "dataType": "metrics",
    "subType": "host",
    "format": "prometheus",
    "endpointUrl": "YOUR_SUMO_HTTP_SOURCE_URL",
    "intervalSeconds": 30,
    "volumePerInterval": 10,
    "enabled": false,
    "metadata": {
      "sourceHost": "web-02.prod.example.com"
    }
  }'

# Host Metrics (Graphite format)
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Host Metrics - Graphite",
    "dataType": "metrics",
    "subType": "host",
    "format": "graphite",
    "endpointUrl": "YOUR_SUMO_HTTP_SOURCE_URL",
    "intervalSeconds": 30,
    "volumePerInterval": 10,
    "enabled": false
  }'

# Application Metrics
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "App Metrics",
    "dataType": "metrics",
    "subType": "application",
    "format": "carbon2",
    "endpointUrl": "YOUR_SUMO_HTTP_SOURCE_URL",
    "intervalSeconds": 15,
    "volumePerInterval": 10,
    "enabled": false,
    "metadata": {
      "serviceName": "api-gateway",
      "sourceCategory": "prod/metrics/app"
    }
  }'

# Kubernetes Metrics
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "K8s Metrics",
    "dataType": "metrics",
    "subType": "kubernetes",
    "format": "prometheus",
    "endpointUrl": "YOUR_SUMO_HTTP_SOURCE_URL",
    "intervalSeconds": 30,
    "volumePerInterval": 5,
    "enabled": false,
    "metadata": {
      "cluster": "prod-us-east-1"
    }
  }'

# Custom Metrics
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Custom Business Metrics",
    "dataType": "metrics",
    "subType": "custom",
    "format": "carbon2",
    "endpointUrl": "YOUR_SUMO_HTTP_SOURCE_URL",
    "intervalSeconds": 60,
    "volumePerInterval": 5,
    "enabled": false,
    "metadata": {
      "metricName": "business.orders_per_minute",
      "tags": {"env": "production", "region": "us-east-1"},
      "minValue": 10,
      "maxValue": 500
    }
  }'
```

### Trace Sources

```bash
# HTTP Request Traces
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "HTTP Traces",
    "dataType": "traces",
    "subType": "httpRequest",
    "format": "otlp",
    "endpointUrl": "YOUR_SUMO_HTTP_SOURCE_URL",
    "intervalSeconds": 30,
    "volumePerInterval": 5,
    "enabled": false,
    "metadata": {
      "serviceName": "api-gateway",
      "sourceCategory": "prod/traces/api"
    }
  }'

# Database Traces
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Database Traces",
    "dataType": "traces",
    "subType": "database",
    "format": "otlp",
    "endpointUrl": "YOUR_SUMO_HTTP_SOURCE_URL",
    "intervalSeconds": 30,
    "volumePerInterval": 5,
    "enabled": false,
    "metadata": {
      "serviceName": "data-service",
      "dbSystem": "postgresql"
    }
  }'

# Microservice Chain Traces
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Microservice Traces",
    "dataType": "traces",
    "subType": "microservice",
    "format": "otlp",
    "endpointUrl": "YOUR_SUMO_HTTP_SOURCE_URL",
    "intervalSeconds": 60,
    "volumePerInterval": 3,
    "enabled": false,
    "metadata": {
      "environment": "production"
    }
  }'

# Error Traces
curl -X POST http://localhost:3000/api/sources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Error Traces",
    "dataType": "traces",
    "subType": "error",
    "format": "otlp",
    "endpointUrl": "YOUR_SUMO_HTTP_SOURCE_URL",
    "intervalSeconds": 60,
    "volumePerInterval": 2,
    "enabled": false,
    "metadata": {
      "serviceName": "order-service",
      "sourceCategory": "prod/traces/errors"
    }
  }'
```

## Bulk Operations

```bash
# Start all sources (enable all, then toggle each)
curl -s http://localhost:3000/api/sources | \
  node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    data.sources.filter(s => !s.active).forEach(s => {
      fetch('http://localhost:3000/api/sources/' + s.id + '/toggle', {method:'POST'})
    })
  "

# Stop all sources
curl -s http://localhost:3000/api/sources | \
  node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    data.sources.filter(s => s.active).forEach(s => {
      fetch('http://localhost:3000/api/sources/' + s.id + '/toggle', {method:'POST'})
    })
  "
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |

## File Locations

| File | Description |
|------|-------------|
| `backend/data/config.json` | Source configurations and stats (auto-generated on first run) |
| `frontend/index.html` | Web UI entry point |

## Troubleshooting

```bash
# Check if server is running
curl http://localhost:3000/api/health

# View current config file
cat backend/data/config.json | node -e "process.stdin.on('data',d=>console.log(JSON.stringify(JSON.parse(d),null,2)))"

# Reset all config (delete and restart)
rm backend/data/config.json
npm run dev

# Check Node.js version (requires 18+)
node --version
```
