import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as config from '../config.js';
import { start, stop, startAll, stopAll, isActive } from '../sourceManager.js';
import { getRecentLogs, getErrorLogs, getHealthStatus } from '../workers/sourceWorker.js';

export const sourceRouter = Router();

function normalizeEndpoints(body) {
  if (Array.isArray(body.endpointUrls) && body.endpointUrls.length > 0) {
    return body.endpointUrls.map(ep => ({
      url: ep.url || '',
      label: ep.label || 'Endpoint',
      enabled: ep.enabled !== false
    }));
  }
  if (body.endpointUrl) {
    return [{ url: body.endpointUrl, label: 'Primary', enabled: true }];
  }
  return [{ url: '', label: 'Primary', enabled: true }];
}

sourceRouter.get('/', (req, res) => {
  const draft = config.getDraft();
  const published = config.getAll();
  const sources = (draft ? draft.sources : published).map(s => {
    // Inline migration: populate fileOutputs from legacy filePath if missing
    if (!s.fileOutputs) {
      s = { ...s, fileOutputs: s.filePath ? [{ path: s.filePath, label: 'File', enabled: !!s.fileEnabled }] : [] };
    }
    const anyEpEnabled = (s.endpointUrls || []).some(ep => ep.enabled !== false);
    const anyFileEnabled = (s.fileOutputs || []).some(f => f.enabled !== false);
    const active = isActive(s.id) || anyEpEnabled || anyFileEnabled;
    const rawHealth = getHealthStatus(s.id);
    const health = rawHealth || (active ? { status: 'pending' } : null);
    const published_s = published.find(ps => ps.id === s.id);
    const draftOnly = !!draft && !published_s;
    if (published_s && published_s.stats) {
      s = { ...s, stats: published_s.stats };
    }
    return { ...s, active, health, draftOnly };
  });
  res.json({ sources });
});

sourceRouter.post('/stop-all', (req, res) => {
  stopAll();
  const draft = config.getDraft();
  const baseSources = draft ? draft.sources : config.getAll();
  const updated = baseSources.map(source => {
    const fileOutputs = (source.fileOutputs || (source.filePath ? [{ path: source.filePath, label: 'File', enabled: false }] : [])).map(f => ({ ...f, enabled: false }));
    return { ...source, httpEnabled: false, fileEnabled: false, enabled: false, endpointUrls: (source.endpointUrls || []).map(ep => ({ ...ep, enabled: false })), fileOutputs };
  });
  config.saveDraft(updated);
  res.json({ stopped: updated.length });
});

sourceRouter.post('/start-all', (req, res) => {
  const draft = config.getDraft();
  const baseSources = draft ? draft.sources : config.getAll();
  const updated = baseSources.map(source => {
    const fileOutputs = (source.fileOutputs || (source.filePath ? [{ path: source.filePath, label: 'File', enabled: true }] : [])).map(f => ({ ...f, enabled: true }));
    return { ...source, httpEnabled: true, fileEnabled: fileOutputs.length > 0, enabled: true, endpointUrls: (source.endpointUrls || []).map(ep => ({ ...ep, enabled: true })), fileOutputs };
  });
  config.saveDraft(updated);
  startAll();
  res.json({ started: updated.length });
});

sourceRouter.get('/:id', (req, res) => {
  const source = config.getOne(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });
  res.json({ ...source, active: isActive(source.id) });
});

sourceRouter.post('/', (req, res) => {
  const endpointUrls = normalizeEndpoints(req.body);
  const httpEnabled = req.body.httpEnabled ?? false;
  const fileEnabled = req.body.fileEnabled ?? false;
  const fileOutputs = Array.isArray(req.body.fileOutputs)
    ? req.body.fileOutputs.map(f => ({ path: f.path || '', label: f.label || 'File', enabled: f.enabled !== false }))
    : (req.body.filePath ? [{ path: req.body.filePath, label: 'File', enabled: fileEnabled }] : []);
  const source = {
    id: uuidv4(),
    name: req.body.name || 'Untitled Source',
    httpEnabled,
    fileEnabled: fileOutputs.some(f => f.enabled !== false),
    enabled: httpEnabled || fileOutputs.some(f => f.enabled !== false),
    dataType: req.body.dataType,
    subType: req.body.subType,
    endpointUrls,
    fileOutputs,
    filePath: fileOutputs[0]?.path || '',
    intervalSeconds: req.body.intervalSeconds || 10,
    volumePerInterval: req.body.volumePerInterval || 50,
    format: req.body.format || 'text',
    metadata: req.body.metadata || {},
    stats: { messagesSent: 0, errors: 0, lastSentAt: null }
  };
  let draft = config.getDraft();
  if (!draft) {
    draft = { sources: config.getAll().map(s => ({ ...s })) };
  } else {
    draft = { sources: [...draft.sources] };
  }
  draft.sources.push(source);
  config.saveDraft(draft.sources);
  res.status(201).json(source);
});

sourceRouter.put('/:id', (req, res) => {
  let draft = config.getDraft();
  if (!draft) {
    draft = { sources: config.getAll().map(s => ({ ...s })) };
  } else {
    draft = { sources: [...draft.sources] };
  }

  const idx = draft.sources.findIndex(s => s.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Source not found' });

  const existing = draft.sources[idx];

  if (req.body.endpointUrls || req.body.endpointUrl) {
    req.body.endpointUrls = normalizeEndpoints(req.body);
    delete req.body.endpointUrl;
  }

  if (req.body.httpEnabled !== undefined || req.body.fileEnabled !== undefined) {
    const httpEnabled = req.body.httpEnabled ?? existing.httpEnabled ?? true;
    const fileEnabled = req.body.fileEnabled ?? existing.fileEnabled ?? false;
    req.body.enabled = httpEnabled || fileEnabled;
  }

  const updated = { ...existing, ...req.body, id: existing.id, stats: existing.stats };
  draft.sources[idx] = updated;
  config.saveDraft(draft.sources);

  res.json(updated);
});

sourceRouter.delete('/:id', (req, res) => {
  let draft = config.getDraft();
  if (!draft) {
    draft = { sources: config.getAll().map(s => ({ ...s })) };
  } else {
    draft = { sources: [...draft.sources] };
  }

  const idx = draft.sources.findIndex(s => s.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Source not found' });

  draft.sources.splice(idx, 1);
  config.saveDraft(draft.sources);

  res.json({ deleted: true });
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
  let draft = config.getDraft();
  if (!draft) {
    draft = { sources: config.getAll().map(s => ({ ...s })) };
  } else {
    draft = { sources: [...draft.sources] };
  }

  const source = draft.sources.find(s => s.id === req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });

  const duplicate = {
    ...source,
    id: uuidv4(),
    name: `${source.name} (Copy)`,
    enabled: false,
    stats: { messagesSent: 0, errors: 0, lastSentAt: null }
  };
  draft.sources.push(duplicate);
  config.saveDraft(draft.sources);

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
  const draft = config.getDraft();
  const baseSources = draft ? draft.sources : config.getAll();
  const source = baseSources.find(s => s.id === req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });

  const anyEpEnabled = (source.endpointUrls || []).some(ep => ep.enabled !== false);
  const anyFileEnabled = (source.fileOutputs || []).some(f => f.enabled !== false);
  const isCurrentlyActive = source.enabled !== false || anyEpEnabled || anyFileEnabled;

  if (isCurrentlyActive) {
    source.httpEnabled = false;
    source.fileEnabled = false;
    source.enabled = false;
    source.endpointUrls = (source.endpointUrls || []).map(ep => ({ ...ep, enabled: false }));
    source.fileOutputs = (source.fileOutputs || (source.filePath ? [{ path: source.filePath, label: 'File', enabled: false }] : [])).map(f => ({ ...f, enabled: false }));
    stop(source.id);
  } else {
    const migratedFileOutputs = source.fileOutputs || (source.filePath ? [{ path: source.filePath, label: 'File', enabled: true }] : []);
    source.httpEnabled = (source.endpointUrls || []).length > 0;
    source.fileEnabled = migratedFileOutputs.length > 0;
    source.enabled = true;
    source.endpointUrls = (source.endpointUrls || []).map(ep => ({ ...ep, enabled: true }));
    source.fileOutputs = migratedFileOutputs.map(f => ({ ...f, enabled: true }));
    start(source.id);
  }

  const updatedSources = baseSources.map(s => s.id === source.id ? source : s);
  config.saveDraft(updatedSources);

  res.json({ ...source, active: isActive(source.id) });
});

sourceRouter.post('/:id/toggle-http', (req, res) => {
  const draft = config.getDraft();

  if (draft) {
    const draftSource = draft.sources.find(s => s.id === req.params.id);
    if (!draftSource) return res.status(404).json({ error: 'Source not found' });

    draftSource.httpEnabled = !draftSource.httpEnabled;
    draftSource.enabled = draftSource.httpEnabled || draftSource.fileEnabled;
    config.saveDraft(draft.sources);

    return res.json({ ...draftSource, active: isActive(draftSource.id) });
  }

  const source = config.getOne(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });

  const wasEnabled = source.enabled;
  source.httpEnabled = !source.httpEnabled;
  source.enabled = source.httpEnabled || source.fileEnabled;
  config.upsert(source);

  if (!wasEnabled && source.enabled) start(source.id);
  else if (wasEnabled && !source.enabled) stop(source.id);
  else if (wasEnabled && source.enabled) { stop(source.id); start(source.id); }

  res.json({ ...source, active: isActive(source.id) });
});

sourceRouter.post('/:id/toggle-file', (req, res) => {
  const draft = config.getDraft();

  if (draft) {
    const draftSource = draft.sources.find(s => s.id === req.params.id);
    if (!draftSource) return res.status(404).json({ error: 'Source not found' });

    draftSource.fileEnabled = !draftSource.fileEnabled;
    const anyEpEnabled = (draftSource.endpointUrls || []).some(ep => ep.enabled !== false);
    draftSource.enabled = anyEpEnabled || draftSource.fileEnabled;
    config.saveDraft(draft.sources);

    return res.json({ ...draftSource, active: isActive(draftSource.id) });
  }

  const source = config.getOne(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });

  const wasEnabled = source.enabled;
  source.fileEnabled = !source.fileEnabled;
  const anyEpEnabled = (source.endpointUrls || []).some(ep => ep.enabled !== false);
  source.enabled = anyEpEnabled || source.fileEnabled;
  config.upsert(source);

  if (!wasEnabled && source.enabled) start(source.id);
  else if (wasEnabled && !source.enabled) stop(source.id);
  else if (wasEnabled && source.enabled) { stop(source.id); start(source.id); }

  res.json({ ...source, active: isActive(source.id) });
});

sourceRouter.post('/:id/toggle-endpoint/:index', (req, res) => {
  const epIndex = parseInt(req.params.index);

  // Always update published so the worker picks up the change immediately.
  const source = config.getOne(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });
  if (!source.endpointUrls?.[epIndex]) return res.status(404).json({ error: 'Endpoint not found' });

  const wasEnabled = source.enabled;
  source.endpointUrls[epIndex].enabled = !source.endpointUrls[epIndex].enabled;
  const anyEnabled = source.endpointUrls.some(ep => ep.enabled !== false);
  source.httpEnabled = anyEnabled;
  source.enabled = anyEnabled || (source.fileOutputs || []).some(f => f.enabled !== false);
  config.upsert(source);

  if (!wasEnabled && source.enabled) start(source.id);
  else if (wasEnabled && !source.enabled) stop(source.id);
  else if (wasEnabled && source.enabled) { stop(source.id); start(source.id); }

  // Sync the same change to the draft so the UI stays consistent.
  const draft = config.getDraft();
  if (draft) {
    const draftSource = draft.sources.find(s => s.id === req.params.id);
    if (draftSource?.endpointUrls?.[epIndex] !== undefined) {
      draftSource.endpointUrls[epIndex].enabled = source.endpointUrls[epIndex].enabled;
      draftSource.httpEnabled = source.httpEnabled;
      draftSource.enabled = source.enabled;
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

  const wasEnabled = source.enabled;
  source.fileOutputs[foIndex].enabled = !source.fileOutputs[foIndex].enabled;
  const anyFileEnabled = source.fileOutputs.some(f => f.enabled !== false);
  source.fileEnabled = anyFileEnabled;
  const anyEpEnabled = (source.endpointUrls || []).some(ep => ep.enabled !== false);
  source.enabled = anyEpEnabled || anyFileEnabled;
  source.filePath = source.fileOutputs[0]?.path || '';
  config.upsert(source);

  if (!wasEnabled && source.enabled) start(source.id);
  else if (wasEnabled && !source.enabled) stop(source.id);
  else if (wasEnabled && source.enabled) { stop(source.id); start(source.id); }

  // Sync the same change to the draft so the UI stays consistent.
  const draft = config.getDraft();
  if (draft) {
    const draftSource = draft.sources.find(s => s.id === req.params.id);
    if (draftSource?.fileOutputs?.[foIndex] !== undefined) {
      draftSource.fileOutputs[foIndex].enabled = source.fileOutputs[foIndex].enabled;
      draftSource.fileEnabled = source.fileEnabled;
      draftSource.enabled = source.enabled;
      draftSource.filePath = source.filePath;
      config.saveDraft(draft.sources);
    }
  }

  res.json({ ...source, active: isActive(source.id) });
});
