import { Router } from 'express';
import * as settings from '../settings.js';
import * as config from '../config.js';

export const settingsRouter = Router();

settingsRouter.get('/', (req, res) => {
  res.json(settings.get());
});

settingsRouter.put('/', (req, res) => {
  try {
    const updated = settings.save(req.body);
    if (req.body.maxVersions !== undefined) {
      config.pruneVersionHistory(updated.maxVersions);
    }
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
