import * as config from '../config.js';
import { get as getSettings } from '../settings.js';
import { getGenerator } from '../generators/index.js';
import { getSender, getFileSender } from '../senders/index.js';

// Hardcoded signal config for OTel app sources — logs + traces written to standard paths.
// Metrics are served by metricsServer.js on their Prometheus ports independently.
const OTEL_APP_SIGNALS = {
  nginxOtel: [
    { dataType: 'logs',   format: 'text', filePath: '/tmp/otel/nginx/access.log',      label: 'Nginx access log' },
    { dataType: 'logs',   format: 'text', filePath: '/tmp/otel/nginx/error.log',       label: 'Nginx error log' },
    { dataType: 'traces', format: 'otlp', filePath: '/tmp/otel/nginx-traces.json',    label: 'Nginx traces' }
  ],
  mysqlOtel: [
    { dataType: 'logs',   format: 'text', filePath: '/tmp/otel/mysql/error.log',      label: 'MySQL error log' },
    { dataType: 'traces', format: 'otlp', filePath: '/tmp/otel/mysql-traces.json',    label: 'MySQL traces' }
  ],
  kafkaOtel: [
    { dataType: 'logs',   format: 'text', filePath: '/tmp/otel/kafka/server.log',     label: 'Kafka server log',     generatorOpts: { logType: 'server' } },
    { dataType: 'logs',   format: 'text', filePath: '/tmp/otel/kafka/controller.log', label: 'Kafka controller log', generatorOpts: { logType: 'controller' } },
    { dataType: 'traces', format: 'otlp', filePath: '/tmp/otel/kafka-traces.json',    label: 'Kafka traces' }
  ],
  dockerOtel: [
    { dataType: 'logs',   format: 'text', filePath: '/tmp/otel/docker/daemon.log',    label: 'Docker daemon log' },
    { dataType: 'traces', format: 'otlp', filePath: '/tmp/otel/docker-traces.json',   label: 'Docker traces' }
  ]
};

const MAX_RECENT = 20;
const MAX_ERRORS = 50;
const recentLogs = new Map();
const errorLogs = new Map();
const healthStatus = new Map();

export function getRecentLogs(sourceId) {
  return recentLogs.get(sourceId) || [];
}

export function clearRecentLogs(sourceId) {
  recentLogs.delete(sourceId);
}

export function getErrorLogs(sourceId) {
  return errorLogs.get(sourceId) || [];
}

export function clearErrorLogs(sourceId) {
  errorLogs.delete(sourceId);
}

export function getHealthStatus(sourceId) {
  return healthStatus.get(sourceId) || null;
}

export function clearHealthStatus(sourceId) {
  healthStatus.delete(sourceId);
}

function storeRecent(sourceId, records, dataType) {
  let entries = recentLogs.get(sourceId) || [];
  const timestamp = new Date().toISOString();

  let newEntries;
  if (dataType === 'traces') {
    const allResourceSpans = Array.isArray(records)
      ? records.flatMap(t => t.resourceSpans || [])
      : (records.resourceSpans || []);
    newEntries = allResourceSpans.slice(0, MAX_RECENT).map(rs => ({
      timestamp,
      data: JSON.stringify(rs.scopeSpans?.[0]?.spans?.[0] || rs, null, 2).substring(0, 500)
    }));
  } else if (Array.isArray(records)) {
    newEntries = records.slice(-MAX_RECENT).map(r => ({
      timestamp,
      data: typeof r === 'string' ? r : JSON.stringify(r)
    }));
  } else {
    newEntries = [{ timestamp, data: JSON.stringify(records).substring(0, 500) }];
  }

  entries = [...entries, ...newEntries].slice(-MAX_RECENT);
  recentLogs.set(sourceId, entries);
}

async function tickOtelApp(source, settings) {
  const signals = OTEL_APP_SIGNALS[source.subType];
  if (!signals) return;

  const currentSource = config.getOne(source.id);
  if (currentSource && currentSource.enabled === false) return;

  const volume = settings.overrideEnabled ? settings.globalVolumePerInterval : source.volumePerInterval;
  const opts = { ...(source.metadata || {}), timezone: settings.timezone };
  const now = new Date().toISOString();
  const allEpHealth = [];
  let successCount = 0;
  let failCount = 0;
  let bytesThisTick = 0;
  const fileSenderModule = getFileSender();

  for (const sig of signals) {
    const generator = getGenerator(sig.dataType, source.subType);
    if (!generator) continue;
    const records = generator.generate(volume, { ...opts, ...(sig.generatorOpts || {}) });
    storeRecent(source.id, records, sig.dataType);
    const result = await fileSenderModule.send(records, sig.filePath, sig.dataType, sig.format);
    if (result.ok) {
      successCount++;
      bytesThisTick += result.bytes || 0;
      allEpHealth.push({ url: sig.filePath, label: sig.label, status: 'green', error: null, lastCheck: now });
    } else {
      failCount++;
      allEpHealth.push({ url: sig.filePath, label: sig.label, status: 'red', error: result.body, lastCheck: now });
      const errors = errorLogs.get(source.id) || [];
      errors.push({ timestamp: now, endpoint: sig.label, type: 'FILE', error: result.body });
      errorLogs.set(source.id, errors.slice(-MAX_ERRORS));
    }
  }

  if (allEpHealth.length === 0) return;

  const aggregate = failCount === 0 ? 'green' : successCount === 0 ? 'red' : 'mixed';
  healthStatus.set(source.id, { status: aggregate, endpoints: allEpHealth, lastCheck: now });

  if (currentSource) {
    const prevStats = currentSource.stats || {};
    config.updateStats(source.id, {
      messagesSent: (prevStats.messagesSent || 0) + (volume * successCount),
      errors: (prevStats.errors || 0) + failCount,
      lastSentAt: successCount > 0 ? now : (prevStats.lastSentAt || null),
      bytesSent: (prevStats.bytesSent || 0) + bytesThisTick,
      spansSent: prevStats.spansSent || 0
    });
  }
}

export function createWorker(source) {
  return {
    async tick() {
      try {
        if (source.dataType === 'otelApp') {
          const settings = getSettings();
          await tickOtelApp(source, settings);
          return;
        }

        const generator = getGenerator(source.dataType, source.subType);
        if (!generator) {
          console.error(`No generator for ${source.dataType}/${source.subType}`);
          return;
        }

        const settings = getSettings();
        const volume = settings.overrideEnabled ? settings.globalVolumePerInterval : source.volumePerInterval;
        const records = generator.generate(volume, {
          ...(source.metadata || {}),
          timezone: settings.timezone,
          levelDistribution: source.levelDistribution || null,
          severityDistribution: source.severityDistribution || null,
          piiTypes: source.piiTypes || null
        });
        const sender = getSender(source.dataType);
        if (!sender) {
          console.error(`No sender for ${source.dataType}`);
          return;
        }

        storeRecent(source.id, records, source.dataType);

        const currentSource = config.getOne(source.id);

        // Respect real-time source-level toggle: if the source was disabled
        // after this worker started, skip sending without stopping the interval.
        if (currentSource && currentSource.enabled === false) return;

        const now = new Date().toISOString();
        const allEpHealth = [];
        let successCount = 0;
        let failCount = 0;
        let bytesThisTick = 0;

        // File export — iterate fileOutputs array
        const fileOutputs = (currentSource?.fileOutputs || source.fileOutputs || []).filter(f => f.enabled !== false);
        for (const fileOut of fileOutputs) {
          const label = fileOut.label || 'File';
          if (!fileOut.path) {
            failCount++;
            allEpHealth.push({ url: '', label, status: 'red', error: 'No file path configured', lastCheck: now });
            let errors = errorLogs.get(source.id) || [];
            errors.push({ timestamp: now, endpoint: label, type: 'FILE', error: 'No file path configured' });
            errorLogs.set(source.id, errors.slice(-MAX_ERRORS));
          } else {
            const fileSenderModule = getFileSender();
            const result = await fileSenderModule.send(records, fileOut.path, source.dataType, source.format);
            if (result.ok) {
              successCount++;
              bytesThisTick += result.bytes || 0;
              allEpHealth.push({ url: fileOut.path, label, status: 'green', error: null, lastCheck: now });
            } else {
              failCount++;
              allEpHealth.push({ url: fileOut.path, label, status: 'red', error: result.body, lastCheck: now });
              console.error(`[${source.name}] File write to ${fileOut.path} failed: ${result.body}`);
              let errors = errorLogs.get(source.id) || [];
              errors.push({ timestamp: now, endpoint: label, type: 'FILE', error: result.body });
              errorLogs.set(source.id, errors.slice(-MAX_ERRORS));
            }
          }
        }

        // HTTP export — gate only on individual endpoint enabled flags, not httpEnabled master
        {
          const endpoints = (currentSource?.endpointUrls || source.endpointUrls || []).filter(ep => ep.enabled !== false && ep.url);
          if (endpoints.length > 0) {
            const results = await Promise.allSettled(
              endpoints.map(ep => {
              // Merge source-level headers + endpoint-level headers; endpoint takes precedence on same key
              const srcHeaders = currentSource?.headers || source.headers || [];
              const epHeaders = ep.headers || [];
              const merged = Object.values(
                [...srcHeaders, ...epHeaders].reduce((acc, h) => { if (h.key) acc[h.key] = h; return acc; }, {})
              );
              return sender.send(records, ep.url, source.format, source.metadata, merged);
            })
            );
            for (let i = 0; i < endpoints.length; i++) {
              const ep = endpoints[i];
              const result = results[i];
              if (result.status === 'fulfilled' && result.value.ok) {
                successCount++;
                bytesThisTick += result.value.bytes || 0;
                allEpHealth.push({ url: ep.url, label: ep.label, status: 'green', error: null, lastCheck: now });
              } else {
                failCount++;
                const errMsg = result.status === 'rejected'
                  ? result.reason?.message || 'Unknown error'
                  : `HTTP ${result.value.status}: ${result.value.body}`;
                allEpHealth.push({ url: ep.url, label: ep.label, status: 'red', error: errMsg, lastCheck: now });
                console.error(`[${source.name}] Send to ${ep.label || ep.url} failed: ${errMsg}`);

                // Log error
                let errors = errorLogs.get(source.id) || [];
                errors.push({
                  timestamp: now,
                  endpoint: ep.label || ep.url,
                  type: 'HTTP',
                  error: errMsg
                });
                errorLogs.set(source.id, errors.slice(-MAX_ERRORS));
              }
            }
          }
        }

        if (allEpHealth.length === 0) {
          // No active endpoints this tick — preserve last known health so indicators
          // don't reset to pending without a successful send.
          return;
        }

        // Build set of URLs/labels that are currently configured (enabled or disabled)
        // so stale entries from old/removed endpoints are not preserved.
        const configuredUrls = new Set([
          ...(currentSource?.endpointUrls || source.endpointUrls || []).map(ep => ep.url).filter(Boolean),
          ...(currentSource?.fileOutputs || source.fileOutputs || []).map(f => f.path).filter(Boolean)
        ]);
        const configuredFileLabels = new Set(
          (currentSource?.fileOutputs || source.fileOutputs || []).map(f => f.label || 'File')
        );

        // Merge previous health for endpoints still in config; overwrite with this tick's results.
        const prevEndpoints = (healthStatus.get(source.id) || {}).endpoints || [];
        const epMap = new Map();
        for (const prev of prevEndpoints) {
          // Drop stale entries: keep only if URL is still configured, or (no URL) label still exists
          const stillValid = prev.url ? configuredUrls.has(prev.url) : configuredFileLabels.has(prev.label || '');
          if (stillValid) epMap.set(prev.url || ('label:' + (prev.label || '')), prev);
        }
        for (const ep of allEpHealth) {
          epMap.set(ep.url || ('label:' + (ep.label || '')), ep);
        }
        const mergedEndpoints = [...epMap.values()];

        const aggregate = failCount === 0 ? 'green' : successCount === 0 ? 'red' : 'mixed';
        healthStatus.set(source.id, { status: aggregate, endpoints: mergedEndpoints, lastCheck: now });

        if (currentSource) {
          const prevStats = currentSource.stats || {};
          const allResourceSpans = Array.isArray(records)
            ? records.flatMap(r => r.resourceSpans || [])
            : (records.resourceSpans || []);
          const spansThisTick = source.dataType === 'traces' && successCount > 0
            ? allResourceSpans.reduce((acc, rs) =>
                acc + (rs.scopeSpans || []).reduce((a, ss) => a + (ss.spans?.length || 0), 0), 0) * successCount
            : 0;
          config.updateStats(source.id, {
            messagesSent: (prevStats.messagesSent || 0) + (volume * successCount),
            errors: (prevStats.errors || 0) + failCount,
            lastSentAt: successCount > 0 ? now : (prevStats.lastSentAt || null),
            bytesSent: (prevStats.bytesSent || 0) + bytesThisTick,
            spansSent: (prevStats.spansSent || 0) + spansThisTick
          });
        }
      } catch (err) {
        healthStatus.set(source.id, { status: 'red', endpoints: [], lastCheck: new Date().toISOString(), error: err.message });
        const currentSource = config.getOne(source.id);
        if (currentSource) {
          config.updateStats(source.id, {
            errors: (currentSource.stats?.errors || 0) + 1
          });
        }
        console.error(`[${source.name}] Worker error:`, err.message);
      }
    }
  };
}
