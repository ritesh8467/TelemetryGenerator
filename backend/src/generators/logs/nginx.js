import { faker } from '@faker-js/faker';

const PATHS = [
  '/', '/api/v1/users', '/api/v1/products', '/static/bundle.js',
  '/api/v1/auth/token', '/api/v1/events', '/health', '/metrics',
  '/api/v1/webhooks', '/assets/main.css', '/api/v2/search', '/graphql'
];

function buildNginxStatusWeights(dist) {
  if (!dist) return null;
  const e = Math.max(0, dist.error ?? 0);
  const w = Math.max(0, dist.warn ?? 0);
  const inf = Math.max(0, (dist.info ?? 0) + (dist.debug ?? 0));
  const total = e + w + inf || 1;
  const es = e / total, ws = w / total, is_ = inf / total;
  return [
    { value: 200, weight: Math.round(is_ * 65) + 1 },
    { value: 301, weight: 5 },
    { value: 304, weight: 10 },
    { value: 404, weight: Math.round(ws * 40) + 1 },
    { value: 429, weight: Math.round(ws * 20) + 1 },
    { value: 500, weight: Math.round(es * 40) + 1 },
    { value: 502, weight: Math.round(es * 30) + 1 },
    { value: 503, weight: Math.round(es * 30) + 1 }
  ];
}

export function generate(count, opts = {}) {
  const lines = [];
  const serverName = opts.sourceHost || 'nginx-prod-01';
  const statusWeights = buildNginxStatusWeights(opts.levelDistribution) || [
    { value: 200, weight: 65 }, { value: 301, weight: 5 },
    { value: 304, weight: 10 }, { value: 404, weight: 10 },
    { value: 500, weight: 5 }, { value: 502, weight: 3 }, { value: 503, weight: 2 }
  ];

  for (let i = 0; i < count; i++) {
    const ip = faker.internet.ipv4();
    const timestamp = new Date().toISOString();
    const method = faker.helpers.arrayElement(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
    const path = faker.helpers.arrayElement(PATHS);
    const status = faker.helpers.weightedArrayElement(statusWeights);
    const bodyBytes = faker.number.int({ min: 100, max: 80000 });
    const requestTime = (Math.random() * 2).toFixed(3);
    const upstreamTime = (parseFloat(requestTime) - Math.random() * 0.1).toFixed(3);
    const ua = faker.internet.userAgent();

    lines.push(
      `${ip} - - [${new Date().toUTCString()}] "${method} ${path} HTTP/2.0" ${status} ${bodyBytes} "-" "${ua}" rt=${requestTime} uct="${upstreamTime}" uht="${upstreamTime}" urt="${requestTime}"`
    );
  }
  return lines;
}
