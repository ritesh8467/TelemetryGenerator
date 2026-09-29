import { faker } from '@faker-js/faker';

const NAMESPACES = ['default', 'production', 'staging', 'monitoring', 'kube-system'];
const CONTAINERS = ['app', 'sidecar', 'init', 'envoy-proxy', 'fluentd'];
const POD_PREFIXES = ['api-server', 'worker', 'web-frontend', 'scheduler', 'cache-proxy', 'ingress-controller'];
const LEVELS = ['INFO', 'WARN', 'ERROR', 'DEBUG'];
const LEVEL_WEIGHTS = [
  { value: 'INFO', weight: 55 }, { value: 'DEBUG', weight: 20 },
  { value: 'WARN', weight: 15 }, { value: 'ERROR', weight: 10 }
];

const MESSAGES = {
  INFO: [
    'Request handled successfully', 'Pod readiness probe passed',
    'Configuration loaded from ConfigMap', 'Liveness probe succeeded',
    'Connected to service mesh', 'Graceful shutdown initiated',
    'Rolling update completed for deployment', 'HPA scaled replicas to {replicas}'
  ],
  WARN: [
    'Pod memory usage at 85%', 'Readiness probe took longer than expected',
    'Connection pool exhausted, waiting for release', 'Rate limiter activated',
    'Pod restart count: {restarts}', 'Node affinity not optimal'
  ],
  ERROR: [
    'CrashLoopBackOff: container failed to start', 'OOMKilled: memory limit exceeded',
    'Failed to pull image: ErrImagePull', 'Service endpoint not reachable',
    'PVC mount failed: volume not found', 'TLS handshake timeout with upstream'
  ],
  DEBUG: [
    'DNS resolution for service completed', 'Envoy sidecar config updated',
    'Token refresh scheduled', 'Metrics endpoint scraped by Prometheus',
    'Network policy evaluated', 'Resource quota check passed'
  ]
};

export function generate(count, opts = {}) {
  const records = [];
  const namespace = opts.namespace || faker.helpers.arrayElement(NAMESPACES);
  const podPrefix = faker.helpers.arrayElement(POD_PREFIXES);
  const podName = `${podPrefix}-${faker.string.alphanumeric(10)}`;
  const container = faker.helpers.arrayElement(CONTAINERS);

  const dist = opts.levelDistribution;
  const weights = dist
    ? [
        { value: 'INFO', weight: Math.max(0, dist.info ?? 55) },
        { value: 'DEBUG', weight: Math.max(0, dist.debug ?? 20) },
        { value: 'WARN', weight: Math.max(0, dist.warn ?? 15) },
        { value: 'ERROR', weight: Math.max(0, dist.error ?? 10) }
      ].filter(w => w.weight > 0)
    : LEVEL_WEIGHTS;
  const effectiveWeights = weights.length > 0 ? weights : LEVEL_WEIGHTS;

  for (let i = 0; i < count; i++) {
    const level = faker.helpers.weightedArrayElement(effectiveWeights);
    let msg = faker.helpers.arrayElement(MESSAGES[level]);
    msg = msg
      .replace('{replicas}', String(faker.number.int({ min: 2, max: 10 })))
      .replace('{restarts}', String(faker.number.int({ min: 1, max: 50 })));

    records.push(JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      logger: `${podPrefix}.${container}`,
      msg,
      pod: podName,
      namespace,
      container,
      node: `ip-${faker.number.int({ min: 10, max: 192 })}-${faker.number.int({ min: 0, max: 255 })}-${faker.number.int({ min: 0, max: 255 })}-${faker.number.int({ min: 1, max: 254 })}.ec2.internal`,
      cluster: opts.cluster || 'prod-us-east-1',
      stream: level === 'ERROR' ? 'stderr' : 'stdout'
    }));
  }
  return records;
}
