import { faker } from '@faker-js/faker';

export function generate(count, opts = {}) {
  const host = opts.sourceHost || 'nginx-prod-01';
  const now = Math.floor(Date.now() / 1000);
  const records = [];

  for (let i = 0; i < count; i++) {
    const active = faker.number.int({ min: 10, max: 500 });
    const reading = faker.number.int({ min: 0, max: Math.floor(active * 0.1) });
    const writing = faker.number.int({ min: 1, max: Math.floor(active * 0.3) });
    const waiting = active - reading - writing;
    const reqRate = faker.number.int({ min: 50, max: 2000 });

    const base = { timestamp: now, tags: { host, instance: `${host}:9113` } };
    records.push(
      { ...base, name: 'nginx_connections_active', value: active, type: 'gauge' },
      { ...base, name: 'nginx_connections_reading', value: reading, type: 'gauge' },
      { ...base, name: 'nginx_connections_writing', value: writing, type: 'gauge' },
      { ...base, name: 'nginx_connections_waiting', value: Math.max(0, waiting), type: 'gauge' },
      { ...base, name: 'nginx_connections_accepted_total', value: faker.number.int({ min: 1000000, max: 9999999 }), type: 'sum' },
      { ...base, name: 'nginx_connections_handled_total', value: faker.number.int({ min: 999000, max: 9998000 }), type: 'sum' },
      { ...base, name: 'nginx_http_requests_total', value: faker.number.int({ min: 5000000, max: 50000000 }), type: 'sum' },
      { ...base, name: 'nginx_up', value: 1, type: 'gauge' }
    );
  }

  return records;
}
