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
    const active = isActive(s.id);
    let health = null;
    if (active) {
      health = getHealthStatus(s.id) || { status: 'pending' };
    }
    const published_s = published.find(ps => ps.id === s.id);
    if (published_s && published_s.stats) {
      s = { ...s, stats: published_s.stats };
    }
    return { ...s, active, health };
  });
  res.json({ sources });
});

sourceRouter.post('/stop-all', (req, res) => {
  const sources = config.getAll();
  stopAll();
  for (const source of sources) {
    source.httpEnabled = false;
    source.fileEnabled = false;
    source.enabled = false;
    config.upsert(source);
  }
  config.flushNow();
  const updated = config.getAll().map(s => ({
    ...s,
    active: isActive(s.id),
    health: isActive(s.id) ? (getHealthStatus(s.id) || { status: 'pending' }) : null
  }));
  res.json({ stopped: sources.length, sources: updated });
});

sourceRouter.post('/start-all', (req, res) => {
  const sources = config.getAll();
  for (const source of sources) {
    source.httpEnabled = true;
    source.fileEnabled = false;
    source.enabled = true;
    config.upsert(source);
    start(source.id);
  }
  config.flushNow();
  const updated = config.getAll().map(s => ({
    ...s,
    active: isActive(s.id),
    health: isActive(s.id) ? (getHealthStatus(s.id) || { status: 'pending' }) : null
  }));
  res.json({ started: sources.length, sources: updated });
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
  const source = {
    id: uuidv4(),
    name: req.body.name || 'Untitled Source',
    httpEnabled,
    fileEnabled,
    enabled: httpEnabled || fileEnabled,
    dataType: req.body.dataType,
    subType: req.body.subType,
    endpointUrls,
    filePath: req.body.filePath || '',
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
  const source = config.getOne(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });

  const wasEnabled = source.enabled;
  if (wasEnabled) {
    source.httpEnabled = false;
    source.fileEnabled = false;
    source.enabled = false;
  } else {
    source.httpEnabled = true;
    source.enabled = true;
  }
  config.upsert(source);

  if (!wasEnabled && source.enabled) start(source.id);
  else if (wasEnabled && !source.enabled) stop(source.id);

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
    draftSource.enabled = draftSource.httpEnabled || draftSource.fileEnabled;
    config.saveDraft(draft.sources);

    return res.json({ ...draftSource, active: isActive(draftSource.id) });
  }

  const source = config.getOne(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });

  const wasEnabled = source.enabled;
  source.fileEnabled = !source.fileEnabled;
  source.enabled = source.httpEnabled || source.fileEnabled;
  config.upsert(source);

  if (!wasEnabled && source.enabled) start(source.id);
  else if (wasEnabled && !source.enabled) stop(source.id);
  else if (wasEnabled && source.enabled) { stop(source.id); start(source.id); }

  res.json({ ...source, active: isActive(source.id) });
});

sourceRouter.post('/:id/toggle-endpoint/:index', (req, res) => {
  const epIndex = parseInt(req.params.index);

  const draft = config.getDraft();
  if (draft) {
    const draftSource = draft.sources.find(s => s.id === req.params.id);
    if (!draftSource) return res.status(404).json({ error: 'Source not found' });
    if (!draftSource.endpointUrls?.[epIndex]) return res.status(404).json({ error: 'Endpoint not found' });

    draftSource.endpointUrls[epIndex].enabled = !draftSource.endpointUrls[epIndex].enabled;
    config.saveDraft(draft.sources);
    return res.json({ ...draftSource, active: isActive(draftSource.id) });
  }

  const source = config.getOne(req.params.id);
  if (!source) return res.status(404).json({ error: 'Source not found' });
  if (!source.endpointUrls?.[epIndex]) return res.status(404).json({ error: 'Endpoint not found' });

  source.endpointUrls[epIndex].enabled = !source.endpointUrls[epIndex].enabled;
  config.upsert(source);

  if (isActive(source.id)) { stop(source.id); start(source.id); }

  res.json({ ...source, active: isActive(source.id) });
});
