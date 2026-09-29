import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as config from '../config.js';
import { start, stop, startAll, stopAll, isActive, restart } from '../sourceManager.js';
import { getRecentLogs, getErrorLogs, getHealthStatus, clearRecentLogs, clearErrorLogs, clearHealthStatus } from '../workers/sourceWorker.js';

export const sourceRouter = Router();

function sanitizeInterval(val) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 1) return 5;
  if (n > 86400) return 86400;
  return n;
}

function sanitizeVolume(val) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 1) return 1;
  if (n > 10000) return 10000;
  return n;
}

function normalizeEndpoints(body) {
  if (Array.isArray(body.endpointUrls) && body.endpointUrls.length === 0) return [];
  if (Array.isArray(body.endpointUrls) && body.endpointUrls.length > 0) {
    return body.endpointUrls.map(ep => ({
      url: ep.url || '',
      label: ep.label || 'Endpoint',
      enabled: ep.enabled !== false,
      headers: Array.isArray(ep.headers)
        ? ep.headers.filter(h => h.key && h.key.trim()).map(h => ({ key: h.key.trim(), value: h.value || '' }))
        : []
    }));
  }
  if (body.endpointUrl) {
    return [{ url: body.endpointUrl, label: 'Primary', enabled: true, headers: [] }];
  }
  return [{ url: '', label: 'Primary', enabled: true, headers: [] }];
}

function normalizeSourceHeaders(body) {
  if (!Array.isArray(body.headers)) return [];
  return body.headers
    .filter(h => h && h.key && String(h.key).trim())
    .map(h => ({ key: String(h.key).trim(), value: String(h.value || '') }));
}

function normalizeLevelDistribution(body) {
  const dist = body.levelDistribution;
  if (!dist || typeof dist !== 'object') return undefined;
  const info = Math.max(0, parseInt(dist.info) || 0);
  const warn = Math.max(0, parseInt(dist.warn) || 0);
  const error = Math.max(0, parseInt(dist.error) || 0);
  const debug = Math.max(0, parseInt(dist.debug) || 0);
  if (info + warn + error + debug === 0) return undefined;
  return { info, warn, error, debug };
}

function normalizeSeverityDistribution(body) {
  const dist = body.severityDistribution;
  if (!dist || typeof dist !== 'object') return undefined;
  const low = Math.max(0, parseInt(dist.low) || 0);
  const medium = Math.max(0, parseInt(dist.medium) || 0);
  const high = Math.max(0, parseInt(dist.high) || 0);
  const critical = Math.max(0, parseInt(dist.critical) || 0);
  if (low + medium + high + critical === 0) return undefined;
  return { low, medium, high, critical };
}

const VALID_PII_TYPES = new Set(['financial', 'identity', 'contact', 'credentials', 'comprehensive']);

function normalizePiiTypes(body) {
  if (!Array.isArray(body.piiTypes)) return undefined;
  const types = body.piiTypes.filter(t => VALID_PII_TYPES.has(t));
  return types.length > 0 ? types : undefined;
}

sourceRouter.get('/', (req, res) => {
  const sources = config.getAll().map(s => {
    if (!s.fileOutputs) {
      s = { ...s, fileOutputs: s.filePath ? [{ path: s.filePath, label: 'File', enabled: !!s.fileEnabled }] : [] };
    }
    const rawHealth = getHealthStatus(s.id);
    const active = s.enabled !== false;
    const health = rawHealth || (active ? { status: 'pending' } : null);
    return { ...s, active, health, draftOnly: false };
  });
  res.json({ sources });
});

sourceRouter.post('/stop-all', (req, res) => {
  const { ids } = req.body || {};
  const sources = config.getAll();
  for (const source of sources) {
    if (ids && ids.length > 0 && !ids.includes(source.id)) continue;
    source.enabled = false;
    config.upsert(source);
    stop(source.id);
  }
  res.json({ stopped: true });
});

sourceRouter.post('/start-all', (req, res) => {
  const { ids } = req.body || {};
  const sources = config.getAll();
  for (const source of sources) {
    if (ids && ids.length > 0 && !ids.includes(source.id)) continue;
    source.enabled = true;
    config.upsert(source);
    start(source.id);
  }
  res.json({ started: true });
});

sourceRouter.post('/reset-all-stats', (req, res) => {
  const sources = config.getAll();
  for (const source of sources) {
    config.resetStats(source.id);
    clearRecentLogs(source.id);
    clearErrorLogs(source.id);
    clearHealthStatus(source.id);
  }
  res.json({ reset: true });
});

sourceRouter.get('/:id', (req, res) => {
  const source = config.getOne(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });
  res.json({ ...source, active: source.enabled !== false });
});

sourceRouter.post('/', (req, res) => {
  const isOtelApp = req.body.dataType === 'otelApp';
  const endpointUrls = isOtelApp ? [] : normalizeEndpoints(req.body);
  const httpEnabled = isOtelApp ? false : (req.body.httpEnabled ?? false);
  const fileEnabled = req.body.fileEnabled ?? false;
  const fileOutputs = Array.isArray(req.body.fileOutputs)
    ? req.body.fileOutputs.map(f => ({ path: f.path || '', label: f.label || 'File', enabled: f.enabled !== false }))
    : (req.body.filePath ? [{ path: req.body.filePath, label: 'File', enabled: fileEnabled }] : []);
  const levelDist = normalizeLevelDistribution(req.body);
  const severityDist = normalizeSeverityDistribution(req.body);
  const piiTypesNorm = normalizePiiTypes(req.body);
  const sourceHeaders = normalizeSourceHeaders(req.body);
  const source = {
    id: uuidv4(),
    name: req.body.name || 'Untitled Source',
    httpEnabled,
    fileEnabled: fileOutputs.some(f => f.enabled !== false),
    enabled: false,
    dataType: req.body.dataType,
    subType: req.body.subType,
    endpointUrls,
    fileOutputs,
    filePath: fileOutputs[0]?.path || '',
    intervalSeconds: sanitizeInterval(req.body.intervalSeconds ?? 10),
    volumePerInterval: sanitizeVolume(req.body.volumePerInterval ?? 50),
    format: req.body.format || 'text',
    metadata: req.body.metadata || {},
    headers: sourceHeaders,
    ...(levelDist ? { levelDistribution: levelDist } : {}),
    ...(severityDist ? { severityDistribution: severityDist } : {}),
    ...(piiTypesNorm ? { piiTypes: piiTypesNorm } : {}),
    stats: { messagesSent: 0, errors: 0, lastSentAt: null }
  };
  config.upsert(source);
  config.applyNow();
  res.status(201).json(source);
});

sourceRouter.put('/:id', (req, res) => {
  const existing = config.getOne(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Source not found' });

  if (existing.dataType === 'otelApp') {
    req.body.endpointUrls = [];
    req.body.httpEnabled = false;
    delete req.body.endpointUrl;
  } else if (req.body.endpointUrls || req.body.endpointUrl) {
    req.body.endpointUrls = normalizeEndpoints(req.body);
    delete req.body.endpointUrl;
  }

  if (req.body.intervalSeconds !== undefined) {
    req.body.intervalSeconds = sanitizeInterval(req.body.intervalSeconds);
  }
  if (req.body.volumePerInterval !== undefined) {
    req.body.volumePerInterval = sanitizeVolume(req.body.volumePerInterval);
  }

  if (req.body.levelDistribution !== undefined) {
    const dist = normalizeLevelDistribution(req.body);
    req.body.levelDistribution = dist || null;
  }
  if (req.body.severityDistribution !== undefined) {
    const dist = normalizeSeverityDistribution(req.body);
    req.body.severityDistribution = dist || null;
  }
  if (req.body.piiTypes !== undefined) {
    const types = normalizePiiTypes(req.body);
    req.body.piiTypes = types || null;
  }
  if (req.body.headers !== undefined) {
    req.body.headers = normalizeSourceHeaders(req.body);
  }

  const updated = { ...existing, ...req.body, id: existing.id, stats: existing.stats };
  config.upsert(updated);
  config.applyNow();

  // Restart worker immediately so new interval/volume takes effect
  restart(existing.id);

  res.json(updated);
});

sourceRouter.delete('/:id', (req, res) => {
  const source = config.getOne(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });

  stop(req.params.id);
  config.remove(req.params.id);
  config.applyNow();

  res.json({ deleted: true });
});

sourceRouter.post('/:id/reset-stats', (req, res) => {
  const source = config.getOne(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });
  config.resetStats(source.id);
  clearRecentLogs(source.id);
  clearErrorLogs(source.id);
  clearHealthStatus(source.id);
  res.json({ reset: true });
});

sourceRouter.get('/:id/recent', (req, res) => {
  const source = config.getOne(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });
  res.json({ recent: getRecentLogs(source.id) });
});

sourceRouter.get('/:id/errors', (req, res) => {
  const source = config.getOne(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });
  res.json({ errors: getErrorLogs(source.id) });
});

sourceRouter.post('/:id/duplicate', (req, res) => {
  const source = config.getOne(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });

  const duplicate = {
    ...source,
    id: uuidv4(),
    name: `${source.name} (Copy)`,
    enabled: false,
    stats: { messagesSent: 0, errors: 0, lastSentAt: null }
  };
  config.upsert(duplicate);
  config.applyNow();

  res.status(201).json(duplicate);
});

sourceRouter.post('/test-send', async (req, res) => {
  const { endpointUrl, contentType, body, headers: customHeaders } = req.body;
  if (!endpointUrl) return res.status(400).json({ error: 'endpointUrl is required' });
  if (!body) return res.status(400).json({ error: 'body is required' });

  const requestHeaders = {
    'Content-Type': contentType || 'text/plain',
    ...(customHeaders || {})
  };

  const startTime = Date.now();
  try {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: requestHeaders,
      body
    });

    const responseBody = await response.text();
    const responseHeaders = {};
    response.headers.forEach((value, key) => { responseHeaders[key] = value; });

    res.json({
      success: response.ok,
      duration_ms: Date.now() - startTime,
      request: {
        method: 'POST',
        url: endpointUrl,
        headers: requestHeaders,
        body: body.length > 5000 ? body.substring(0, 5000) + '...(truncated)' : body
      },
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody || '(empty)'
      }
    });
  } catch (err) {
    res.json({
      success: false,
      duration_ms: Date.now() - startTime,
      request: {
        method: 'POST',
        url: endpointUrl,
        headers: requestHeaders,
        body: body.length > 5000 ? body.substring(0, 5000) + '...(truncated)' : body
      },
      response: {
        status: 0,
        statusText: 'Network Error',
        headers: {},
        body: err.message
      }
    });
  }
});

sourceRouter.post('/:id/toggle', (req, res) => {
  // Always update published so the worker picks up the change immediately.
  const source = config.getOne(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });

  source.enabled = source.enabled === false ? true : false;
  config.upsert(source);

  if (source.enabled) {
    start(source.id);
  } else {
    stop(source.id);
  }

  // Sync to draft if one exists so the UI stays consistent.
  const draft = config.getDraft();
  if (draft) {
    const draftSource = draft.sources.find(s => s.id === req.params.id);
    if (draftSource) {
      draftSource.enabled = source.enabled;
      config.saveDraft(draft.sources);
    }
  }

  res.json({ ...source, active: source.enabled !== false });
});

sourceRouter.post('/:id/toggle-http', (req, res) => {
  const draft = config.getDraft();

  if (draft) {
    const draftSource = draft.sources.find(s => s.id === req.params.id);
    if (!draftSource) return res.status(404).json({ error: 'Source not found' });

    draftSource.httpEnabled = !draftSource.httpEnabled;
    config.saveDraft(draft.sources);

    return res.json({ ...draftSource, active: isActive(draftSource.id) });
  }

  const source = config.getOne(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });

  source.httpEnabled = !source.httpEnabled;
  config.upsert(source);

  res.json({ ...source, active: isActive(source.id) });
});

sourceRouter.post('/:id/toggle-file', (req, res) => {
  const draft = config.getDraft();

  if (draft) {
    const draftSource = draft.sources.find(s => s.id === req.params.id);
    if (!draftSource) return res.status(404).json({ error: 'Source not found' });

    draftSource.fileEnabled = !draftSource.fileEnabled;
    config.saveDraft(draft.sources);

    return res.json({ ...draftSource, active: isActive(draftSource.id) });
  }

  const source = config.getOne(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });

  source.fileEnabled = !source.fileEnabled;
  config.upsert(source);

  res.json({ ...source, active: isActive(source.id) });
});

sourceRouter.post('/:id/toggle-endpoint/:index', (req, res) => {
  const epIndex = parseInt(req.params.index);

  // Always update published so the worker picks up the change immediately.
  const source = config.getOne(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });
  if (!source.endpointUrls?.[epIndex]) return res.status(404).json({ error: 'Endpoint not found' });

  source.endpointUrls[epIndex].enabled = !source.endpointUrls[epIndex].enabled;
  source.httpEnabled = source.endpointUrls.some(ep => ep.enabled !== false);
  config.upsert(source);

  // Restart worker so it picks up the updated endpoint list immediately.
  if (source.enabled !== false && isActive(source.id)) {
    stop(source.id);
    start(source.id);
  } else if (source.enabled !== false && !isActive(source.id)) {
    start(source.id);
  }

  // Sync the same change to the draft so the UI stays consistent.
  const draft = config.getDraft();
  if (draft) {
    const draftSource = draft.sources.find(s => s.id === req.params.id);
    if (draftSource?.endpointUrls?.[epIndex] !== undefined) {
      draftSource.endpointUrls[epIndex].enabled = source.endpointUrls[epIndex].enabled;
      draftSource.httpEnabled = source.httpEnabled;
      config.saveDraft(draft.sources);
    }
  }

  res.json({ ...source, active: isActive(source.id) });
});

sourceRouter.post('/:id/toggle-file-output/:index', (req, res) => {
  const foIndex = parseInt(req.params.index);

  // Always update published so the worker picks up the change immediately.
  const source = config.getOne(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });
  if (!source.fileOutputs?.[foIndex]) return res.status(404).json({ error: 'File output not found' });

  source.fileOutputs[foIndex].enabled = !source.fileOutputs[foIndex].enabled;
  source.fileEnabled = source.fileOutputs.some(f => f.enabled !== false);
  source.filePath = source.fileOutputs[0]?.path || '';
  config.upsert(source);

  // Restart worker so it picks up the updated file output list immediately.
  if (source.enabled !== false && isActive(source.id)) {
    stop(source.id);
    start(source.id);
  } else if (source.enabled !== false && !isActive(source.id)) {
    start(source.id);
  }

  // Sync the same change to the draft so the UI stays consistent.
  const draft = config.getDraft();
  if (draft) {
    const draftSource = draft.sources.find(s => s.id === req.params.id);
    if (draftSource?.fileOutputs?.[foIndex] !== undefined) {
      draftSource.fileOutputs[foIndex].enabled = source.fileOutputs[foIndex].enabled;
      draftSource.fileEnabled = source.fileEnabled;
      draftSource.filePath = source.filePath;
      config.saveDraft(draft.sources);
    }
  }

  res.json({ ...source, active: isActive(source.id) });
});
