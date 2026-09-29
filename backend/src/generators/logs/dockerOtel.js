import { faker } from '@faker-js/faker';

const IMAGES = [
  'nginx:1.25', 'redis:7.2', 'postgres:16', 'node:20-alpine', 'python:3.12-slim',
  'mysql:8.0', 'mongodb:7.0', 'rabbitmq:3.12', 'elasticsearch:8.11', 'grafana/grafana:10.2',
  'prom/prometheus:v2.48', 'confluentinc/cp-kafka:7.5', 'alpine:3.19', 'ubuntu:22.04'
];
const CONTAINER_NAMES = [
  'web-server', 'api-gateway', 'cache-layer', 'db-primary', 'queue-worker',
  'log-aggregator', 'metrics-collector', 'auth-service', 'payment-service', 'inventory-service'
];
const NETWORKS = ['bridge', 'host', 'overlay', 'custom-net', 'app-network', 'backend'];

function cid() {
  return faker.string.hexadecimal({ length: 12, prefix: '' }).toLowerCase();
}

function containerEventLog() {
  const image = faker.helpers.arrayElement(IMAGES);
  const name = faker.helpers.arrayElement(CONTAINER_NAMES);
  const id = cid();
  const action = faker.helpers.arrayElement(['start', 'stop', 'die', 'kill', 'pause', 'unpause', 'restart', 'destroy', 'create', 'oom']);
  const exitCode = action === 'die' ? faker.number.int({ min: 0, max: 137 }) : 0;

  const event = {
    status: action,
    id,
    from: image,
    Type: 'container',
    Action: action,
    Actor: {
      ID: id,
      Attributes: { image, name, ...(action === 'die' ? { exitCode: String(exitCode) } : {}) }
    },
    scope: 'local',
    time: Math.floor(Date.now() / 1000),
    timeNano: Date.now() * 1000000
  };
  return JSON.stringify(event);
}

function daemonLog() {
  const ts = new Date().toISOString();
  const id = cid();
  const image = faker.helpers.arrayElement(IMAGES);
  const name = faker.helpers.arrayElement(CONTAINER_NAMES);
  const network = faker.helpers.arrayElement(NETWORKS);
  const digest = `sha256:${faker.string.hexadecimal({ length: 64, prefix: '' }).toLowerCase()}`;

  const scenarios = [
    () => ({ time: ts, level: 'info', msg: 'container started', container: id, image, name }),
    () => ({ time: ts, level: 'info', msg: 'container stopped', container: id, image, name, exitCode: String(faker.number.int({ min: 0, max: 1 })) }),
    () => ({ time: ts, level: 'info', msg: 'pulling image', image, progressDetail: {} }),
    () => ({ time: ts, level: 'info', msg: 'image pulled successfully', image, digest }),
    () => ({ time: ts, level: 'info', msg: 'network connected', container: id, network }),
    () => ({ time: ts, level: 'info', msg: 'network disconnected', container: id, network }),
    () => ({ time: ts, level: 'info', msg: 'volume mounted', container: id, volume: `/data/${faker.lorem.word()}`, mode: 'rw' }),
    () => ({ time: ts, level: 'info', msg: 'container created', container: id, image, name }),
    () => ({ time: ts, level: 'info', msg: 'container destroyed', container: id, name }),
    () => ({ time: ts, level: 'info', msg: 'health check passed', container: id, name, consecutiveSuccess: faker.number.int({ min: 1, max: 10 }) }),
    () => ({ time: ts, level: 'warning', msg: 'container health check failed', container: id, name, failureCount: String(faker.number.int({ min: 1, max: 3 })) }),
    () => ({ time: ts, level: 'warning', msg: 'memory usage approaching limit', container: id, name, usagePct: `${faker.number.int({ min: 80, max: 95 })}%` }),
    () => ({ time: ts, level: 'warning', msg: 'high CPU usage detected', container: id, name, cpuPct: `${faker.number.float({ min: 80.0, max: 99.9, fractionDigits: 1 })}%` }),
    () => ({ time: ts, level: 'error', msg: 'failed to start container', container: id, error: faker.helpers.arrayElement(['OCI runtime error: permission denied', 'port already allocated', 'no such image']) }),
    () => ({ time: ts, level: 'error', msg: 'failed to pull image', image, error: `manifest for ${image} not found: manifest unknown` }),
    () => ({ time: ts, level: 'debug', msg: 'API request received', method: faker.helpers.arrayElement(['GET', 'POST', 'DELETE']), path: `/v1.44/containers/${id}/json` }),
  ];

  return JSON.stringify(faker.helpers.arrayElement(scenarios)());
}

export function generate(count, opts = {}) {
  const records = [];
  const dist = opts.levelDistribution;
  const total = dist ? ((dist.info ?? 0) + (dist.warn ?? 0) + (dist.error ?? 0) + (dist.debug ?? 0)) || 1 : 1;
  const errorProb = dist ? (dist.error ?? 0) / total : 0.05;
  const warnProb = dist ? (dist.warn ?? 0) / total : 0.10;

  for (let i = 0; i < count; i++) {
    const rand = Math.random();
    if (rand < errorProb) {
      // Generate error-level daemon log
      const ts = new Date().toISOString();
      const id = cid();
      const image = faker.helpers.arrayElement(IMAGES);
      records.push(JSON.stringify({
        time: ts, level: 'error',
        msg: faker.helpers.arrayElement(['failed to start container', 'failed to pull image', 'container OOM killed']),
        container: id, image, error: faker.helpers.arrayElement(['OOM killer invoked', 'port already allocated', 'no space left on device'])
      }));
    } else if (rand < errorProb + warnProb) {
      records.push(containerEventLog());
    } else {
      records.push(daemonLog());
    }
  }
  return records;
}
