import { faker } from '@faker-js/faker';
import { formatApacheTimestamp } from '../../utils/time.js';

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'];
const PATHS = [
  '/api/users', '/api/products', '/api/orders', '/api/auth/login',
  '/api/search', '/static/app.js', '/static/style.css', '/images/logo.png',
  '/api/cart', '/api/checkout', '/health', '/api/notifications',
  '/api/settings', '/docs/api', '/api/reports', '/dashboard',
  '/api/uploads', '/favicon.ico', '/robots.txt', '/sitemap.xml'
];
const STATUS_WEIGHTS = [
  { code: 200, weight: 60 }, { code: 201, weight: 5 }, { code: 204, weight: 3 },
  { code: 301, weight: 3 }, { code: 304, weight: 10 },
  { code: 400, weight: 4 }, { code: 401, weight: 3 }, { code: 403, weight: 2 },
  { code: 404, weight: 7 }, { code: 500, weight: 2 }, { code: 503, weight: 1 }
];

function buildStatusWeights(dist) {
  if (!dist) return STATUS_WEIGHTS;
  const e = Math.max(0, dist.error ?? 0);
  const w = Math.max(0, dist.warn ?? 0);
  const inf = Math.max(0, dist.info ?? 0);
  const total = e + w + inf || 1;
  const errorShare = e / total;
  const warnShare = w / total;
  const infoShare = (inf + Math.max(0, dist.debug ?? 0)) / total;
  return [
    { code: 200, weight: Math.round(infoShare * 60) + 1 },
    { code: 201, weight: Math.round(infoShare * 5) + 1 },
    { code: 204, weight: Math.round(infoShare * 3) + 1 },
    { code: 301, weight: 3 },
    { code: 304, weight: 10 },
    { code: 400, weight: Math.round(warnShare * 30) + 1 },
    { code: 401, weight: Math.round(warnShare * 20) + 1 },
    { code: 403, weight: Math.round(warnShare * 10) + 1 },
    { code: 404, weight: Math.round(warnShare * 40) + 1 },
    { code: 500, weight: Math.round(errorShare * 50) + 1 },
    { code: 503, weight: Math.round(errorShare * 50) + 1 }
  ];
}

function weightedStatus(weights) {
  const w = weights || STATUS_WEIGHTS;
  const total = w.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const { code, weight } of w) {
    r -= weight;
    if (r <= 0) return code;
  }
  return 200;
}

export function generate(count, opts = {}) {
  const lines = [];
  const timezone = opts.timezone || 'UTC';
  const statusWeights = buildStatusWeights(opts.levelDistribution);

  for (let i = 0; i < count; i++) {
    const ip = faker.internet.ipv4();
    const method = faker.helpers.arrayElement(METHODS);
    const path = faker.helpers.arrayElement(PATHS);
    const status = weightedStatus(statusWeights);
    const bytes = faker.number.int({ min: 200, max: 50000 });
    const referer = Math.random() > 0.3 ? faker.internet.url() : '-';
    const ua = faker.internet.userAgent();
    const ts = formatApacheTimestamp(new Date(), timezone);
    lines.push(`${ip} - - [${ts}] "${method} ${path} HTTP/1.1" ${status} ${bytes} "${referer}" "${ua}"`);
  }
  return lines;
}
