import { faker } from '@faker-js/faker';

const ENDPOINTS = [
  { method: 'GET', path: '/api/v1/users' },
  { method: 'POST', path: '/api/v1/orders' },
  { method: 'GET', path: '/api/v1/products' },
  { method: 'PUT', path: '/api/v1/users/{id}' },
  { method: 'DELETE', path: '/api/v1/sessions' },
  { method: 'POST', path: '/api/v1/auth/token' },
  { method: 'GET', path: '/api/v2/search' },
  { method: 'POST', path: '/graphql' },
  { method: 'GET', path: '/health' },
  { method: 'GET', path: '/api/v1/cart' }
];

function hexId(len) {
  return faker.string.hexadecimal({ length: len, prefix: '' }).toLowerCase();
}

function toNano(ms) {
  return (BigInt(Math.round(ms)) * 1_000_000n).toString();
}

function toAttr(obj) {
  return Object.entries(obj).map(([key, val]) => {
    let value;
    if (typeof val === 'string') value = { stringValue: val };
    else if (typeof val === 'boolean') value = { boolValue: val };
    else if (Number.isInteger(val)) value = { intValue: String(val) };
    else value = { doubleValue: val };
    return { key, value };
  });
}

export function generate(count, opts = {}) {
  const serviceName = opts.serviceName || 'nginx-ingress';
  const host = opts.sourceHost || 'nginx-prod-01';
  const traces = [];

  for (let i = 0; i < count; i++) {
    const traceId = hexId(32);
    const spanId = hexId(16);
    const baseMs = Date.now();
    const ep = faker.helpers.arrayElement(ENDPOINTS);
    const durationMs = faker.number.int({ min: 2, max: 1200 });
    const statusCode = faker.helpers.weightedArrayElement([
      { value: 200, weight: 55 }, { value: 201, weight: 8 }, { value: 204, weight: 4 },
      { value: 304, weight: 10 }, { value: 400, weight: 6 }, { value: 401, weight: 4 },
      { value: 403, weight: 2 }, { value: 404, weight: 7 }, { value: 429, weight: 2 },
      { value: 500, weight: 2 }, { value: 502, weight: 1 }, { value: 503, weight: 1 }
    ]);
    const isError = statusCode >= 500;
    const upstreamDuration = Math.max(0, durationMs - faker.number.int({ min: 1, max: 5 }));
    const clientIp = faker.internet.ipv4();
    const upstream = `http://backend:8080${ep.path.replace('{id}', faker.string.uuid())}`;

    const span = {
      traceId,
      spanId,
      name: `${ep.method} ${ep.path}`,
      kind: 1, // SERVER
      startTimeUnixNano: toNano(baseMs),
      endTimeUnixNano: toNano(baseMs + durationMs),
      attributes: toAttr({
        'http.method': ep.method,
        'http.target': ep.path.replace('{id}', faker.string.uuid()),
        'http.status_code': statusCode,
        'http.flavor': '1.1',
        'http.user_agent': faker.internet.userAgent(),
        'http.scheme': 'https',
        'http.host': 'api.example.com',
        'net.peer.ip': clientIp,
        'net.peer.port': faker.number.int({ min: 32768, max: 60999 }),
        'nginx.upstream_addr': upstream,
        'nginx.upstream_response_time': upstreamDuration / 1000,
        'nginx.request_time': durationMs / 1000
      }),
      status: { code: isError ? 2 : 1 },
      events: isError ? [{
        timeUnixNano: toNano(baseMs + durationMs),
        name: 'upstream_error',
        attributes: toAttr({
          'exception.type': statusCode === 502 ? 'UpstreamError' : 'InternalServerError',
          'exception.message': statusCode === 502
            ? `Upstream ${upstream} returned 502`
            : `Server error processing ${ep.method} ${ep.path}`
        })
      }] : []
    };

    traces.push({
      resourceSpans: [{
        resource: {
          attributes: toAttr({
            'service.name': serviceName,
            'service.version': '1.25.3',
            'host.name': host,
            'process.runtime.name': 'nginx'
          })
        },
        scopeSpans: [{
          scope: { name: 'nginx-otel-module', version: '0.2.0' },
          spans: [span]
        }]
      }]
    });
  }

  return traces;
}
