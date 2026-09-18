import { Router } from 'express';
import * as config from '../config.js';
import { isActive } from '../sourceManager.js';

export const statsRouter = Router();

statsRouter.get('/', (req, res) => {
  const sources = config.getAll();
  const aggregate = {
    totalSources: sources.length,
    activeSources: sources.filter(s => isActive(s.id)).length,
    totalMessagesSent: sources.reduce((sum, s) => sum + (s.stats?.messagesSent || 0), 0),
    totalErrors: sources.reduce((sum, s) => sum + (s.stats?.errors || 0), 0),
    byDataType: {}
  };

  for (const s of sources) {
    if (!aggregate.byDataType[s.dataType]) {
      aggregate.byDataType[s.dataType] = { count: 0, active: 0, messagesSent: 0 };
    }
    aggregate.byDataType[s.dataType].count++;
    if (isActive(s.id)) aggregate.byDataType[s.dataType].active++;
    aggregate.byDataType[s.dataType].messagesSent += s.stats?.messagesSent || 0;
  }

  res.json(aggregate);
});
