import { Router } from 'express';
import * as settings from '../settings.js';
import * as config from '../config.js';
import { stop, start, isActive } from '../sourceManager.js';

export const settingsRouter = Router();

settingsRouter.get('/', (req, res) => {
  res.json(settings.get());
});

settingsRouter.put('/', (req, res) => {
  try {
    const before = settings.get();
    const updated = settings.save(req.body);

    if (req.body.maxVersions !== undefined) {
      config.pruneVersionHistory(updated.maxVersions);
    }

    // Restart active workers when override toggle or global interval changes,
    // so the new setInterval fires at the correct cadence immediately.
    const intervalAffected =
      (req.body.overrideEnabled !== undefined && before.overrideEnabled !== updated.overrideEnabled) ||
      (req.body.globalIntervalSeconds !== undefined && before.globalIntervalSeconds !== updated.globalIntervalSeconds);

    if (intervalAffected) {
      for (const source of config.getAll()) {
        if (isActive(source.id)) {
          stop(source.id);
          start(source.id);
        }
      }
    }

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
