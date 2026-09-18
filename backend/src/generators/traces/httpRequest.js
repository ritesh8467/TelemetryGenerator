import { faker } from '@faker-js/faker';

const ENDPOINTS = [
  { method: 'GET', path: '/api/users' },
  { method: 'POST', path: '/api/orders' },
  { method: 'GET', path: '/api/products/{id}' },
  { method: 'PUT', path: '/api/users/{id}/profile' },
  { method: 'DELETE', path: '/api/sessions' },
  { method: 'POST', path: '/api/auth/login' }
];

function hexId(length) {
  return faker.string.hexadecimal({ length, prefix: '' }).toLowerCase();
}

function nanoTimestamp(baseMs, offsetMs = 0) {
  return String((baseMs + offsetMs) * 1000000);
}

export function generate(count, opts = {}) {
  const serviceName = opts.serviceName || 'api-gateway';
  const traces = [];

  for (let i = 0; i < count; i++) {
    const traceId = hexId(32);
    const rootSpanId = hexId(16);
    const baseTime = Date.now();
    const endpoint = faker.helpers.arrayElement(ENDPOINTS);
    const totalDuration = faker.number.int({ min: 50, max: 800 });
    const statusCode = faker.helpers.weightedArrayElement([
      { value: 200, weight: 70 }, { value: 201, weight: 10 },
      { value: 400, weight: 8 }, { value: 404, weight: 7 }, { value: 500, weight: 5 }
    ]);

    const spans = [];

    spans.push({
      traceId,
      spanId: rootSpanId,
      name: `${endpoint.method} ${endpoint.path}`,
      kind: 2,
      startTimeUnixNano: nanoTimestamp(baseTime),
      endTimeUnixNano: nanoTimestamp(baseTime, totalDuration),
      attributes: [
        { key: 'http.method', value: { stringValue: endpoint.method } },
        { key: 'http.url', value: { stringValue: `https://${serviceName}.example.com${endpoint.path}` } },
        { key: 'http.status_code', value: { intValue: statusCode } },
        { key: 'http.route', value: { stringValue: endpoint.path } },
        { key: 'net.peer.ip', value: { stringValue: faker.internet.ipv4() } }
      ],
      status: { code: statusCode >= 400 ? 2 : 1 }
    });

    const authSpanId = hexId(16);
    const authDuration = faker.number.int({ min: 5, max: 30 });
    spans.push({
      traceId,
      spanId: authSpanId,
      parentSpanId: rootSpanId,
      name: 'auth.validate_token',
      kind: 1,
      startTimeUnixNano: nanoTimestamp(baseTime, 2),
      endTimeUnixNano: nanoTimestamp(baseTime, 2 + authDuration),
      attributes: [
        { key: 'auth.method', value: { stringValue: 'jwt' } },
        { key: 'auth.valid', value: { boolValue: statusCode !== 401 } }
      ],
      status: { code: 1 }
    });

    const dbSpanId = hexId(16);
    const dbStart = 2 + authDuration + 5;
    const dbDuration = faker.number.int({ min: 10, max: 200 });
    spans.push({
      traceId,
      spanId: dbSpanId,
      parentSpanId: rootSpanId,
      name: `SELECT ${endpoint.path.split('/')[2] || 'records'}`,
      kind: 3,
      startTimeUnixNano: nanoTimestamp(baseTime, dbStart),
      endTimeUnixNano: nanoTimestamp(baseTime, dbStart + dbDuration),
      attributes: [
        { key: 'db.system', value: { stringValue: 'postgresql' } },
        { key: 'db.statement', value: { stringValue: `SELECT * FROM ${endpoint.path.split('/')[2] || 'records'} WHERE id = $1` } },
        { key: 'db.name', value: { stringValue: 'app_production' } }
      ],
      status: { code: 1 }
    });

    if (Math.random() > 0.5) {
      const cacheSpanId = hexId(16);
      const cacheStart = dbStart + dbDuration + 2;
      spans.push({
        traceId,
        spanId: cacheSpanId,
        parentSpanId: rootSpanId,
        name: 'cache.get',
        kind: 3,
        startTimeUnixNano: nanoTimestamp(baseTime, cacheStart),
        endTimeUnixNano: nanoTimestamp(baseTime, cacheStart + faker.number.int({ min: 1, max: 5 })),
        attributes: [
          { key: 'cache.system', value: { stringValue: 'redis' } },
          { key: 'cache.hit', value: { boolValue: Math.random() > 0.3 } }
        ],
        status: { code: 1 }
      });
    }

    traces.push({
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: serviceName } },
          { key: 'service.version', value: { stringValue: '2.4.1' } },
          { key: 'host.name', value: { stringValue: opts.sourceHost || `${serviceName}-pod-${faker.string.alphanumeric(5)}` } }
        ]
      },
      scopeSpans: [{
        scope: { name: 'telemetry-generator', version: '1.0.0' },
        spans
      }]
    });
  }

  return { resourceSpans: traces };
}
