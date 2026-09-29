import { faker } from '@faker-js/faker';

const IMAGES = [
  'nginx:1.25', 'redis:7.2', 'postgres:16', 'node:20-alpine',
  'python:3.12-slim', 'mysql:8.0', 'rabbitmq:3.12', 'elasticsearch:8.11'
];
const CONTAINER_NAMES = [
  'web-server', 'api-gateway', 'cache-layer', 'db-primary',
  'queue-worker', 'auth-service', 'payment-service', 'inventory-service'
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
    if (typeof val === 'string')       value = { stringValue: val };
    else if (typeof val === 'boolean') value = { boolValue: val };
    else if (Number.isInteger(val))    value = { intValue: String(val) };
    else                               value = { doubleValue: val };
    return { key, value };
  });
}

const API_OPERATIONS = [
  { method: 'GET',    path: '/v1.44/containers/json',            name: 'list containers',   minMs: 1,   maxMs: 30 },
  { method: 'POST',   path: '/v1.44/containers/create',          name: 'create container',  minMs: 10,  maxMs: 500 },
  { method: 'POST',   path: '/v1.44/containers/{id}/start',      name: 'start container',   minMs: 100, maxMs: 2000 },
  { method: 'POST',   path: '/v1.44/containers/{id}/stop',       name: 'stop container',    minMs: 50,  maxMs: 10000 },
  { method: 'DELETE', path: '/v1.44/containers/{id}',            name: 'remove container',  minMs: 50,  maxMs: 500 },
  { method: 'GET',    path: '/v1.44/containers/{id}/stats',      name: 'container stats',   minMs: 5,   maxMs: 50 },
  { method: 'GET',    path: '/v1.44/containers/{id}/json',       name: 'inspect container', minMs: 1,   maxMs: 20 },
  { method: 'POST',   path: '/v1.44/containers/{id}/exec',       name: 'exec in container', minMs: 10,  maxMs: 1000 },
  { method: 'GET',    path: '/v1.44/images/json',                name: 'list images',       minMs: 1,   maxMs: 20 },
  { method: 'POST',   path: '/v1.44/images/create',              name: 'pull image',        minMs: 500, maxMs: 30000 },
  { method: 'DELETE', path: '/v1.44/images/{name}',              name: 'remove image',      minMs: 50,  maxMs: 300 },
  { method: 'GET',    path: '/v1.44/networks',                   name: 'list networks',     minMs: 1,   maxMs: 15 },
  { method: 'POST',   path: '/v1.44/networks/create',            name: 'create network',    minMs: 10,  maxMs: 200 },
  { method: 'GET',    path: '/v1.44/volumes',                    name: 'list volumes',      minMs: 1,   maxMs: 15 },
  { method: 'GET',    path: '/v1.44/info',                       name: 'system info',       minMs: 1,   maxMs: 10 },
];

export function generate(count, opts = {}) {
  const serviceName = opts.serviceName || 'docker-daemon';
  const host = opts.sourceHost || 'docker-host-01';
  const traces = [];

  for (let i = 0; i < count; i++) {
    const traceId = hexId(32);
    const spanId = hexId(16);
    const baseMs = Date.now();
    const op = faker.helpers.arrayElement(API_OPERATIONS);
    const containerId = hexId(12);
    const image = faker.helpers.arrayElement(IMAGES);
    const containerName = faker.helpers.arrayElement(CONTAINER_NAMES);
    const isFailed = Math.random() < 0.03;

    const durationMs = faker.number.float({ min: op.minMs, max: op.maxMs, fractionDigits: 2 });
    const path = op.path.replace('{id}', containerId).replace('{name}', image.replace('/', '-'));
    const statusCode = isFailed ? faker.helpers.arrayElement([400, 404, 409, 500]) : 200;

    const events = [];
    if (isFailed) {
      events.push({
        timeUnixNano: toNano(baseMs + durationMs),
        name: 'exception',
        attributes: toAttr({
          'exception.type': faker.helpers.arrayElement([
            'ContainerNotFound', 'ImageNotFound', 'PortAlreadyAllocated',
            'ContainerAlreadyRunning', 'DockerDaemonError'
          ]),
          'exception.message': faker.helpers.arrayElement([
            `No such container: ${containerId}`,
            `No such image: ${image}`,
            `Port already allocated: 0.0.0.0:${faker.number.int({ min: 1024, max: 65535 })}`,
            `Container ${containerId} is already running`,
            `Error response from daemon: conflict: unable to delete ${image}`
          ])
        })
      });
    }

    const span = {
      traceId,
      spanId,
      name: `${op.method} ${op.name}`,
      kind: 2, // SERVER
      startTimeUnixNano: toNano(baseMs),
      endTimeUnixNano: toNano(baseMs + durationMs),
      attributes: toAttr({
        'http.method': op.method,
        'http.url': `http://${host}:2375${path}`,
        'http.target': path,
        'http.status_code': statusCode,
        'http.scheme': 'http',
        'net.peer.name': host,
        'net.peer.port': 2375,
        'docker.container.id': containerId,
        'docker.container.name': containerName,
        'docker.image.name': image,
        'docker.api.version': '1.44',
      }),
      status: { code: isFailed ? 2 : 1 },
      events,
    };

    traces.push({
      resourceSpans: [{
        resource: {
          attributes: toAttr({
            'service.name': serviceName,
            'host.name': host,
            'docker.daemon.version': '24.0.7',
            'os.type': 'linux',
          })
        },
        scopeSpans: [{
          scope: { name: 'docker-otel-instrumentation', version: '1.0.0' },
          spans: [span]
        }]
      }]
    });
  }

  return traces;
}
