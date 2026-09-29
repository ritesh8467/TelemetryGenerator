import { faker } from '@faker-js/faker';

const LEVELS = ['info', 'warn', 'error', 'debug'];
const LEVEL_WEIGHTS = [
  { value: 'info', weight: 60 }, { value: 'debug', weight: 15 },
  { value: 'warn', weight: 15 }, { value: 'error', weight: 10 }
];
const SERVICES = ['user-service', 'order-service', 'payment-service', 'notification-service', 'auth-service'];
const MESSAGES = {
  info: [
    'Request processed successfully', 'User authenticated', 'Cache hit for key',
    'Database query completed', 'Background job started', 'Health check passed',
    'Configuration reloaded', 'Connection pool refreshed'
  ],
  warn: [
    'Slow query detected', 'Rate limit approaching threshold', 'Deprecated API version used',
    'Connection pool nearing capacity', 'Retry attempt for external service',
    'Memory usage above 80%', 'Request timeout approaching'
  ],
  error: [
    'Failed to process payment', 'Database connection timeout', 'External API returned 500',
    'Authentication token expired', 'Message queue publish failed',
    'Disk space critically low', 'Unhandled exception in worker'
  ],
  debug: [
    'Entering function processOrder', 'Cache key generated', 'SQL query built',
    'Request headers validated', 'Middleware chain completed', 'Event published to queue'
  ]
};

export function generate(count, opts = {}) {
  const records = [];
  const service = opts.serviceName || faker.helpers.arrayElement(SERVICES);

  const dist = opts.levelDistribution;
  const weights = dist
    ? [
        { value: 'info', weight: Math.max(0, dist.info ?? 60) },
        { value: 'debug', weight: Math.max(0, dist.debug ?? 15) },
        { value: 'warn', weight: Math.max(0, dist.warn ?? 15) },
        { value: 'error', weight: Math.max(0, dist.error ?? 10) }
      ].filter(w => w.weight > 0)
    : LEVEL_WEIGHTS;
  const effectiveWeights = weights.length > 0 ? weights : LEVEL_WEIGHTS;

  for (let i = 0; i < count; i++) {
    const level = faker.helpers.weightedArrayElement(effectiveWeights);
    const msg = faker.helpers.arrayElement(MESSAGES[level]);
    const record = {
      timestamp: new Date().toISOString(),
      level,
      service,
      message: msg,
      traceId: faker.string.hexadecimal({ length: 32, prefix: '' }),
      spanId: faker.string.hexadecimal({ length: 16, prefix: '' }),
      host: opts.sourceHost || faker.internet.ipv4(),
      environment: opts.environment || 'production',
      version: opts.version || '2.4.1'
    };

    if (level === 'error') {
      record.error = {
        type: faker.helpers.arrayElement(['TimeoutError', 'ConnectionError', 'ValidationError', 'AuthError']),
        stack: `Error: ${msg}\n    at handler (/app/src/handlers/${service}.js:${faker.number.int({ min: 10, max: 200 })}:${faker.number.int({ min: 1, max: 40 })})`
      };
    }

    if (level === 'info' || level === 'debug') {
      record.duration_ms = faker.number.int({ min: 1, max: 500 });
    }

    records.push(JSON.stringify(record));
  }
  return records;
}
