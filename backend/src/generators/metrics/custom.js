import { faker } from '@faker-js/faker';

export function generate(count, opts = {}) {
  const metricName = opts.metricName || 'custom.metric';
  const tags = opts.tags || { host: 'custom-host', env: 'production' };
  const minValue = opts.minValue ?? 0;
  const maxValue = opts.maxValue ?? 100;
  const metrics = [];
  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < count; i++) {
    metrics.push({
      name: metricName,
      value: parseFloat((minValue + Math.random() * (maxValue - minValue)).toFixed(3)),
      timestamp: now - (count - i),
      tags: { ...tags }
    });
  }

  return metrics;
}
