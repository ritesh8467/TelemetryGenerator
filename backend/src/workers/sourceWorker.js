import * as config from '../config.js';
import { getGenerator } from '../generators/index.js';
import { getSender, getFileSender } from '../senders/index.js';

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
    const spans = records.resourceSpans || [];
    newEntries = spans.slice(0, MAX_RECENT).map(rs => ({
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

export function createWorker(source) {
  return {
    async tick() {
      try {
        const generator = getGenerator(source.dataType, source.subType);
        if (!generator) {
          console.error(`No generator for ${source.dataType}/${source.subType}`);
          return;
        }

        const records = generator.generate(source.volumePerInterval, source.metadata || {});
        const sender = getSender(source.dataType);
        if (!sender) {
          console.error(`No sender for ${source.dataType}`);
          return;
        }

        storeRecent(source.id, records, source.dataType);

        const currentSource = config.getOne(source.id);
        const fileEnabled = currentSource?.fileEnabled ?? false;
        const filePath = currentSource?.filePath || source.filePath || '';

        const now = new Date().toISOString();
        const allEpHealth = [];
        let successCount = 0;
        let failCount = 0;

        // File export
        if (fileEnabled) {
          if (!filePath) {
            failCount++;
            allEpHealth.push({ url: '', label: 'File', status: 'red', error: 'No file path configured', lastCheck: now });
            let errors = errorLogs.get(source.id) || [];
            errors.push({ timestamp: now, endpoint: '', type: 'FILE', error: 'No file path configured' });
            errorLogs.set(source.id, errors.slice(-MAX_ERRORS));
          } else {
            const fileSenderModule = getFileSender();
            const result = await fileSenderModule.send(records, filePath, source.dataType, source.format);
            if (result.ok) {
              successCount++;
              allEpHealth.push({ url: filePath, label: 'File', status: 'green', error: null, lastCheck: now });
            } else {
              failCount++;
              allEpHealth.push({ url: filePath, label: 'File', status: 'red', error: result.body, lastCheck: now });
              console.error(`[${source.name}] File write to ${filePath} failed: ${result.body}`);
              let errors = errorLogs.get(source.id) || [];
              errors.push({ timestamp: now, endpoint: filePath, type: 'FILE', error: result.body });
              errorLogs.set(source.id, errors.slice(-MAX_ERRORS));
            }
          }
        }

        // HTTP export — gate only on individual endpoint enabled flags, not httpEnabled master
        {
          const endpoints = (currentSource?.endpointUrls || source.endpointUrls || []).filter(ep => ep.enabled !== false);
          if (endpoints.length > 0) {
            const results = await Promise.allSettled(
              endpoints.map(ep => sender.send(records, ep.url, source.format, source.metadata))
            );
            for (let i = 0; i < endpoints.length; i++) {
              const ep = endpoints[i];
              const result = results[i];
              if (result.status === 'fulfilled' && result.value.ok) {
                successCount++;
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
          healthStatus.delete(source.id);
          return;
        }

        const aggregate = failCount === 0 ? 'green' : successCount === 0 ? 'red' : 'mixed';
        healthStatus.set(source.id, { status: aggregate, endpoints: allEpHealth, lastCheck: now });

        if (currentSource) {
          const prevStats = currentSource.stats || {};
          config.updateStats(source.id, {
            messagesSent: (prevStats.messagesSent || 0) + (source.volumePerInterval * successCount),
            errors: (prevStats.errors || 0) + failCount,
            lastSentAt: successCount > 0 ? now : (prevStats.lastSentAt || null)
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
