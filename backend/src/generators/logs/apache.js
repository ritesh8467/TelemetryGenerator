import { faker } from '@faker-js/faker';

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

function weightedStatus() {
  const total = STATUS_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  let r = Math.random() * total;
  for (const { code, weight } of STATUS_WEIGHTS) {
    r -= weight;
    if (r <= 0) return code;
  }
  return 200;
}

export function generate(count, opts = {}) {
  const lines = [];
  const host = opts.sourceHost || faker.internet.ipv4();

  for (let i = 0; i < count; i++) {
    const ip = faker.internet.ipv4();
    const timestamp = new Date().toISOString().replace('T', ':').replace('Z', ' +0000');
    const method = faker.helpers.arrayElement(METHODS);
    const path = faker.helpers.arrayElement(PATHS);
    const status = weightedStatus();
    const bytes = faker.number.int({ min: 200, max: 50000 });
    const referer = Math.random() > 0.3 ? faker.internet.url() : '-';
    const ua = faker.internet.userAgent();

    const formatted = new Date().toUTCString().replace(/GMT/, '+0000');
    lines.push(`${ip} - - [${formatted}] "${method} ${path} HTTP/1.1" ${status} ${bytes} "${referer}" "${ua}"`);
  }
  return lines;
}
