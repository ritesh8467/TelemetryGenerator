import { faker } from '@faker-js/faker';

const ENDPOINTS = ['/api/users', '/api/orders', '/api/products', '/api/auth', '/api/search', '/graphql'];
const METHODS = ['GET', 'POST', 'PUT', 'DELETE'];

export function generate(count, opts = {}) {
  const service = opts.serviceName || 'api-gateway';
  const host = opts.sourceHost || `${service}-${faker.number.int({ min: 1, max: 5 })}`;
  const metrics = [];
  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < count; i++) {
    const timestamp = now - (count - i);
    const endpoint = faker.helpers.arrayElement(ENDPOINTS);
    const method = faker.helpers.arrayElement(METHODS);

    metrics.push({
      name: 'http.requests_total',
      value: faker.number.int({ min: 10, max: 500 }),
      timestamp,
      tags: { service, host, endpoint, method, status: '200' }
    });

    metrics.push({
      name: 'http.requests_total',
      value: faker.number.int({ min: 0, max: 20 }),
      timestamp,
      tags: { service, host, endpoint, method, status: '500' }
    });

    metrics.push({
      name: 'http.request_duration_seconds_p50',
      value: parseFloat((Math.random() * 0.1 + 0.01).toFixed(4)),
      timestamp,
      tags: { service, host, endpoint, method }
    });

    metrics.push({
      name: 'http.request_duration_seconds_p95',
      value: parseFloat((Math.random() * 0.5 + 0.05).toFixed(4)),
      timestamp,
      tags: { service, host, endpoint, method }
    });

    metrics.push({
      name: 'http.request_duration_seconds_p99',
      value: parseFloat((Math.random() * 2 + 0.1).toFixed(4)),
      timestamp,
      tags: { service, host, endpoint, method }
    });

    metrics.push({
      name: 'app.active_connections',
      value: faker.number.int({ min: 50, max: 2000 }),
      timestamp,
      tags: { service, host }
    });

    metrics.push({
      name: 'app.error_rate',
      value: parseFloat((Math.random() * 5).toFixed(3)),
      timestamp,
      tags: { service, host }
    });

    metrics.push({
      name: 'app.queue_depth',
      value: faker.number.int({ min: 0, max: 500 }),
      timestamp,
      tags: { service, host, queue: faker.helpers.arrayElement(['default', 'priority', 'retry']) }
    });
  }

  return metrics;
}
