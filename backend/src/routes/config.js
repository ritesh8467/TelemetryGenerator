import { Router } from 'express';
import * as config from '../config.js';
import { stopAll, startAll, restart } from '../sourceManager.js';

export const configRouter = Router();

const OPERATIONAL_KEYS = new Set(['stats', 'enabled', 'httpEnabled', 'fileEnabled']);

function stripOperational(source) {
  const s = { ...source };
  for (const k of OPERATIONAL_KEYS) delete s[k];
  s.endpointUrls = (s.endpointUrls || []).map(({ enabled: _e, ...ep }) => ep);
  s.fileOutputs = (s.fileOutputs || []).map(({ enabled: _e, ...fo }) => fo);
  return s;
}

function countDraftChanges(draftSources, publishedSources) {
  const draftIds = new Set(draftSources.map(s => s.id));
  const publishedIds = new Set(publishedSources.map(s => s.id));

  let changes = 0;

  for (const id of draftIds) {
    if (!publishedIds.has(id)) {
      changes++;
      continue;
    }
    const d = stripOperational(draftSources.find(s => s.id === id));
    const p = stripOperational(publishedSources.find(s => s.id === id));
    if (JSON.stringify(d) !== JSON.stringify(p)) changes++;
  }

  for (const id of publishedIds) {
    if (!draftIds.has(id)) changes++;
  }

  return changes;
}

configRouter.get('/status', (req, res) => {
  const draftData = config.getDraft();
  const publishedSources = config.getAll();
  const { versions, currentVersion } = config.getVersions();

  let hasDraft = false;
  let draftChanges = 0;
  let draftSavedAt = null;

  if (draftData) {
    hasDraft = true;
    draftSavedAt = draftData.savedAt;
    draftChanges = countDraftChanges(draftData.sources, publishedSources);
  }

  res.json({
    hasDraft,
    draftChanges,
    draftSavedAt,
    publishedCount: versions.length,
    currentVersion
  });
});

configRouter.get('/draft', (req, res) => {
  const draft = config.getDraft();
  res.json({ draft: draft ? draft.sources : null });
});

configRouter.delete('/draft', (req, res) => {
  config.discardDraft();
  res.json({ discarded: true });
});

configRouter.post('/publish', (req, res) => {
  const draftData = config.getDraft();
  if (!draftData) {
    return res.status(400).json({ error: 'No draft to publish' });
  }

  stopAll();
  const result = config.publish(draftData.sources);
  if (result.success) {
    startAll();
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

configRouter.get('/versions', (req, res) => {
  const { versions, currentVersion } = config.getVersions();
  res.json({ versions, currentVersion });
});

configRouter.get('/versions/:n', (req, res) => {
  const versionNumber = parseInt(req.params.n);
  const version = config.getVersion(versionNumber);
  if (!version) {
    return res.status(404).json({ error: 'Version not found' });
  }
  res.json(version);
});

configRouter.post('/versions/:n/restore', (req, res) => {
  const versionNumber = parseInt(req.params.n);
  stopAll();
  const result = config.restoreVersion(versionNumber);
  if (result.success) {
    startAll();
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

configRouter.post('/versions/:n/pin', (req, res) => {
  const versionNumber = parseInt(req.params.n);
  const pinned = config.pinVersion(versionNumber);
  if (pinned === null) return res.status(404).json({ error: 'Version not found' });
  res.json({ version: versionNumber, pinned });
});
