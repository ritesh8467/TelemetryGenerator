import { faker } from '@faker-js/faker';
import { formatApacheTimestamp } from '../../utils/time.js';

const PATHS = [
  '/', '/api/v1/users', '/api/v1/products', '/api/v1/orders', '/api/v1/auth/token',
  '/api/v1/search', '/api/v2/events', '/health', '/metrics', '/api/v1/webhooks',
  '/static/bundle.js', '/static/main.css', '/assets/logo.png', '/robots.txt', '/favicon.ico',
  '/graphql', '/api/v1/cart', '/api/v1/checkout', '/api/v2/inventory', '/api/v1/notifications'
];

const ACCESS_STATUS_WEIGHTS = [
  { value: 200, weight: 60 }, { value: 201, weight: 5 }, { value: 204, weight: 3 },
  { value: 301, weight: 4 }, { value: 304, weight: 10 },
  { value: 400, weight: 4 }, { value: 401, weight: 3 }, { value: 403, weight: 2 },
  { value: 404, weight: 6 }, { value: 429, weight: 1 },
  { value: 499, weight: 1 }, { value: 500, weight: 2 }, { value: 502, weight: 1 }, { value: 503, weight: 1 }
];

const NGINX_ERROR_LEVELS = ['warn', 'error', 'crit'];

function buildStatusWeights(dist) {
  if (!dist) return ACCESS_STATUS_WEIGHTS;
  const e = Math.max(0, dist.error ?? 0);
  const w = Math.max(0, dist.warn ?? 0);
  const inf = Math.max(0, (dist.info ?? 0) + (dist.debug ?? 0));
  const total = e + w + inf || 1;
  return [
    { value: 200, weight: Math.round((inf / total) * 60) + 1 },
    { value: 201, weight: Math.round((inf / total) * 5) + 1 },
    { value: 204, weight: Math.round((inf / total) * 3) + 1 },
    { value: 301, weight: 4 }, { value: 304, weight: 10 },
    { value: 400, weight: Math.round((w / total) * 20) + 1 },
    { value: 401, weight: Math.round((w / total) * 15) + 1 },
    { value: 403, weight: Math.round((w / total) * 10) + 1 },
    { value: 404, weight: Math.round((w / total) * 40) + 1 },
    { value: 429, weight: Math.round((w / total) * 15) + 1 },
    { value: 500, weight: Math.round((e / total) * 50) + 1 },
    { value: 502, weight: Math.round((e / total) * 30) + 1 },
    { value: 503, weight: Math.round((e / total) * 20) + 1 }
  ];
}

function accessLog(opts) {
  const tz = opts.timezone || 'UTC';
  const statusWeights = buildStatusWeights(opts.levelDistribution);
  const ip = faker.internet.ipv4();
  const method = faker.helpers.arrayElement(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']);
  const path = faker.helpers.arrayElement(PATHS);
  const status = faker.helpers.weightedArrayElement(statusWeights);
  const bytes = faker.number.int({ min: 100, max: 100000 });
  const requestTime = faker.number.float({ min: 0.001, max: 3.0, fractionDigits: 3 });
  const upstreamTime = status >= 500 || status === 502
    ? faker.number.float({ min: 1.0, max: 30.0, fractionDigits: 3 })
    : (requestTime - Math.random() * 0.05).toFixed(3);
  const referer = Math.random() > 0.4 ? faker.internet.url() : '-';
  const ua = faker.internet.userAgent();
  const ts = formatApacheTimestamp(new Date(), tz);
  return `${ip} - - [${ts}] "${method} ${path} HTTP/1.1" ${status} ${bytes} "${referer}" "${ua}" rt=${requestTime} uct="${upstreamTime}" uht="${upstreamTime}" urt="${requestTime}"`;
}

function errorLog() {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const pid = faker.number.int({ min: 1000, max: 99999 });
  const cid = faker.number.int({ min: 1, max: 999999 });
  const level = faker.helpers.weightedArrayElement([
    { value: 'warn', weight: 40 }, { value: 'error', weight: 50 }, { value: 'crit', weight: 10 }
  ]);
  const ip = faker.internet.ipv4();
  const path = faker.helpers.arrayElement(PATHS);
  const upstream = `http://${faker.helpers.arrayElement(['backend', 'api', 'app', 'service'])}:${faker.helpers.arrayElement([8080, 8081, 8082, 3000])}${path}`;
  const errors = [
    `upstream timed out (110: Connection timed out) while reading response header from upstream, client: ${ip}, server: example.com, request: "GET ${path} HTTP/1.1", upstream: "${upstream}"`,
    `connect() failed (111: Connection refused) while connecting to upstream, client: ${ip}, server: example.com, request: "POST ${path} HTTP/1.1", upstream: "${upstream}"`,
    `no live upstreams while connecting to upstream, client: ${ip}, server: _, request: "GET ${path} HTTP/1.1", upstream: "http://backend_pool${path}"`,
    `client intended to send too large body: ${faker.number.int({ min: 1048577, max: 104857600 })} bytes, client: ${ip}, server: example.com, request: "POST ${path} HTTP/1.1"`,
    `limiting requests, excess: ${faker.number.float({ min: 0.1, max: 50, fractionDigits: 1 })} by zone "api_limit", client: ${ip}, server: example.com, request: "GET ${path} HTTP/1.1"`,
    `SSL_do_handshake() failed (SSL: error:14094418:SSL routines:ssl3_read_bytes:tlsv1 alert unknown ca) while SSL handshaking, client: ${ip}`,
    `open() "${faker.system.filePath()}" failed (2: No such file or directory), client: ${ip}, server: example.com, request: "GET ${path} HTTP/1.1"`
  ];
  const msg = faker.helpers.arrayElement(errors);
  return `${ts} [${level}] ${pid}#${pid}: *${cid} ${msg}`;
}

export function generate(count, opts = {}) {
  const records = [];
  for (let i = 0; i < count; i++) {
    // 80% access logs, 20% error logs
    if (Math.random() < 0.8) {
      records.push(accessLog(opts));
    } else {
      records.push(errorLog());
    }
  }
  return records;
}
