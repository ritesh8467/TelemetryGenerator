import * as config from './config.js';
import { createWorker } from './workers/sourceWorker.js';

const activeWorkers = new Map();

export function start(sourceId) {
  if (activeWorkers.has(sourceId)) return;
  const source = config.getOne(sourceId);
  if (!source) return;

  const worker = createWorker(source);
  const timerId = setInterval(() => worker.tick(), source.intervalSeconds * 1000);
  activeWorkers.set(sourceId, { timerId, worker });
  worker.tick();
}

export function stop(sourceId) {
  const entry = activeWorkers.get(sourceId);
  if (!entry) return;
  clearInterval(entry.timerId);
  activeWorkers.delete(sourceId);
}

export function isActive(sourceId) {
  return activeWorkers.has(sourceId);
}

export function startAll() {
  const sources = config.getAll();
  for (const source of sources) {
    if (source.enabled !== false) {
      start(source.id);
    }
  }
}

export function stopAll() {
  for (const [id] of activeWorkers) {
    stop(id);
  }
}
