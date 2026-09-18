import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'data', 'config.json');

const SEED_SOURCES = [
  {
    id: uuidv4(),
    name: 'Apache Access Logs',
    enabled: false,
    dataType: 'logs',
    subType: 'apache',
    endpointUrls: [{ url: 'https://endpoint.collection.sumologic.com/receiver/v1/http/YOUR_TOKEN_HERE', label: 'Primary', enabled: true }],
    intervalSeconds: 10,
    volumePerInterval: 100,
    format: 'text',
    metadata: {
      sourceCategory: 'prod/web/apache',
      sourceHost: 'web-01.prod.example.com'
    },
    stats: { messagesSent: 0, errors: 0, lastSentAt: null }
  },
  {
    id: uuidv4(),
    name: 'Host Metrics (Carbon 2.0)',
    enabled: false,
    dataType: 'metrics',
    subType: 'host',
    endpointUrls: [{ url: 'https://endpoint.collection.sumologic.com/receiver/v1/http/YOUR_TOKEN_HERE', label: 'Primary', enabled: true }],
    intervalSeconds: 30,
    volumePerInterval: 10,
    format: 'carbon2',
    metadata: {
      sourceCategory: 'prod/metrics/host',
      sourceHost: 'web-01.prod.example.com'
    },
    stats: { messagesSent: 0, errors: 0, lastSentAt: null }
  },
  {
    id: uuidv4(),
    name: 'HTTP Request Traces',
    enabled: false,
    dataType: 'traces',
    subType: 'httpRequest',
    endpointUrls: [{ url: 'https://endpoint.collection.sumologic.com/receiver/v1/http/YOUR_TOKEN_HERE', label: 'Primary', enabled: true }],
    intervalSeconds: 60,
    volumePerInterval: 5,
    format: 'otlp',
    metadata: {
      sourceCategory: 'prod/traces/api',
      sourceHost: 'api-gateway.prod.example.com',
      serviceName: 'api-gateway'
    },
    stats: { messagesSent: 0, errors: 0, lastSentAt: null }
  },
  {
    id: uuidv4(),
    name: 'GenAI / LLM Traces',
    enabled: false,
    dataType: 'traces',
    subType: 'genai',
    httpEnabled: true,
    fileEnabled: false,
    endpointUrls: [{ url: 'https://endpoint.collection.sumologic.com/receiver/v1/http/YOUR_TOKEN_HERE', label: 'Primary', enabled: true }],
    filePath: '',
    intervalSeconds: 10,
    volumePerInterval: 3,
    format: 'otlp',
    metadata: {
      sourceCategory: 'prod/traces/genai',
      sourceHost: 'genai-service.prod.example.com',
      serviceName: 'genai-service'
    },
    stats: { messagesSent: 0, errors: 0, lastSentAt: null }
  },
  {
    id: uuidv4(),
    name: 'PII Data Logs',
    enabled: false,
    dataType: 'logs',
    subType: 'pii',
    httpEnabled: true,
    fileEnabled: false,
    endpointUrls: [{ url: 'https://endpoint.collection.sumologic.com/receiver/v1/http/YOUR_TOKEN_HERE', label: 'Primary', enabled: true }],
    filePath: '',
    intervalSeconds: 15,
    volumePerInterval: 50,
    format: 'text',
    metadata: {
      sourceCategory: 'prod/logs/pii',
      sourceHost: 'pii-processor.prod.example.com'
    },
    stats: { messagesSent: 0, errors: 0, lastSentAt: null }
  },
  {
    id: uuidv4(),
    name: 'Microservice Application Logs',
    enabled: false,
    dataType: 'logs',
    subType: 'microservice',
    httpEnabled: true,
    fileEnabled: false,
    endpointUrls: [{ url: 'https://endpoint.collection.sumologic.com/receiver/v1/http/YOUR_TOKEN_HERE', label: 'Primary', enabled: true }],
    filePath: '',
    intervalSeconds: 5,
    volumePerInterval: 100,
    format: 'json',
    metadata: {
      sourceCategory: 'prod/logs/microservices',
      sourceHost: 'k8s-cluster-01.prod.example.com',
      serviceName: 'microservice-platform'
    },
    stats: { messagesSent: 0, errors: 0, lastSentAt: null }
  }
];

let config = { sources: [] };
let flushTimer = null;

export function load() {
  if (existsSync(CONFIG_PATH)) {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    config = JSON.parse(raw);
    let migrated = false;
    for (const source of config.sources) {
      if (source.endpointUrl && !source.endpointUrls) {
        source.endpointUrls = [{ url: source.endpointUrl, label: 'Primary', enabled: true }];
        delete source.endpointUrl;
        migrated = true;
      }
      if (!source.hasOwnProperty('httpEnabled')) {
        if (source.exportMode === 'file') {
          source.httpEnabled = false;
          source.fileEnabled = true;
        } else {
          source.httpEnabled = true;
          source.fileEnabled = false;
        }
        if (!source.hasOwnProperty('filePath')) source.filePath = '';
        delete source.exportMode;
        migrated = true;
      }
    }
    if (migrated) {
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    }
  } else {
    config = { sources: SEED_SOURCES };
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  }
  return config;
}

export function getAll() {
  return config.sources;
}

export function getOne(id) {
  return config.sources.find(s => s.id === id) || null;
}

export function upsert(source) {
  const idx = config.sources.findIndex(s => s.id === source.id);
  if (idx >= 0) {
    config.sources[idx] = { ...config.sources[idx], ...source };
  } else {
    config.sources.push(source);
  }
  scheduledFlush();
  return config.sources.find(s => s.id === source.id);
}

export function remove(id) {
  config.sources = config.sources.filter(s => s.id !== id);
  scheduledFlush();
}

export function updateStats(id, stats) {
  const source = config.sources.find(s => s.id === id);
  if (source) {
    source.stats = { ...source.stats, ...stats };
    scheduledFlush();
  }
}

function scheduledFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    flushTimer = null;
  }, 5000);
}

export function flushNow() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  // Create backup before writing
  if (existsSync(CONFIG_PATH)) {
    const backupPath = CONFIG_PATH + '.backup';
    try {
      copyFileSync(CONFIG_PATH, backupPath);
    } catch (err) {
      console.warn('Failed to create config backup:', err.message);
    }
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function restoreFromBackup() {
  const backupPath = CONFIG_PATH + '.backup';
  if (existsSync(backupPath)) {
    try {
      const raw = readFileSync(backupPath, 'utf-8');
      config = JSON.parse(raw);
      console.log('Config restored from backup');
      return true;
    } catch (err) {
      console.error('Failed to restore from backup:', err.message);
      return false;
    }
  }
  return false;
}
