import { faker } from '@faker-js/faker';
import { formatISOInZone } from '../../utils/time.js';

let _tz = 'UTC';

const SERVICES = [
  { name: 'api-gateway', port: 8080 },
  { name: 'user-service', port: 8081 },
  { name: 'order-service', port: 8082 },
  { name: 'payment-service', port: 8083 },
  { name: 'inventory-service', port: 8084 },
  { name: 'notification-service', port: 8085 },
  { name: 'search-service', port: 8086 },
  { name: 'analytics-service', port: 8087 }
];

const DB_HOSTS = ['db-primary.internal', 'db-replica-1.internal', 'db-replica-2.internal'];
const CACHE_HOSTS = ['redis-01.internal:6379', 'redis-02.internal:6379', 'memcached-01.internal:11211'];
const QUEUE_TOPICS = ['order.created', 'payment.processed', 'user.registered', 'notification.send', 'inventory.updated', 'analytics.event'];

function traceCtx() {
  return {
    traceId: faker.string.hexadecimal({ length: 32, prefix: '' }).toLowerCase(),
    spanId: faker.string.hexadecimal({ length: 16, prefix: '' }).toLowerCase(),
    parentSpanId: faker.string.hexadecimal({ length: 16, prefix: '' }).toLowerCase()
  };
}

function base(service, level, component) {
  return {
    '@timestamp': formatISOInZone(new Date(), _tz),
    level,
    service: service.name,
    component,
    host: `${service.name}-${faker.string.alphanumeric(5)}.pod.cluster.local`,
    pid: faker.number.int({ min: 1, max: 65535 }),
    thread: `worker-${faker.number.int({ min: 0, max: 15 })}`,
    environment: 'production',
    version: `${faker.number.int({ min: 1, max: 4 })}.${faker.number.int({ min: 0, max: 20 })}.${faker.number.int({ min: 0, max: 50 })}`,
    ...traceCtx()
  };
}

// --- ALB / Load Balancer Logs ---

const ALB_PATHS = ['/api/v1/users', '/api/v1/orders', '/api/v1/products', '/api/v1/search', '/api/v1/auth/token', '/api/v1/payments', '/api/v2/inventory', '/api/v1/notifications', '/health', '/ready'];
const ALB_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

function albLog() {
  const svc = faker.helpers.arrayElement(SERVICES);
  const path = faker.helpers.arrayElement(ALB_PATHS);
  const method = faker.helpers.arrayElement(ALB_METHODS);
  const status = faker.helpers.weightedArrayElement([
    { value: 200, weight: 55 }, { value: 201, weight: 8 }, { value: 204, weight: 5 },
    { value: 301, weight: 3 }, { value: 400, weight: 6 }, { value: 401, weight: 4 },
    { value: 403, weight: 3 }, { value: 404, weight: 7 }, { value: 429, weight: 3 },
    { value: 500, weight: 4 }, { value: 502, weight: 1 }, { value: 503, weight: 1 }
  ]);
  const targetProcessing = faker.number.float({ min: 0.001, max: 2.5, fractionDigits: 3 });
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

  return {
    ...base(svc, level, 'alb'),
    message: `${method} ${path} ${status} ${targetProcessing}s`,
    http: {
      method,
      path,
      status,
      client_ip: faker.internet.ipv4(),
      target: `${svc.name}.internal:${svc.port}`,
      request_size: faker.number.int({ min: 100, max: 50000 }),
      response_size: faker.number.int({ min: 50, max: 200000 }),
      target_processing_time_s: targetProcessing,
      user_agent: faker.internet.userAgent(),
      x_forwarded_for: `${faker.internet.ipv4()}, ${faker.internet.ipv4()}`
    }
  };
}

// --- Service-to-Service (gRPC / HTTP) ---

function serviceCallLog() {
  const caller = faker.helpers.arrayElement(SERVICES);
  const callee = faker.helpers.arrayElement(SERVICES.filter(s => s.name !== caller.name));
  const duration = faker.number.float({ min: 1, max: 800, fractionDigits: 1 });
  const success = Math.random() > 0.08;
  const level = !success ? 'error' : duration > 500 ? 'warn' : 'info';

  const log = {
    ...base(caller, level, 'http-client'),
    message: success
      ? `Outbound call to ${callee.name} completed in ${duration}ms`
      : `Outbound call to ${callee.name} failed after ${duration}ms`,
    rpc: {
      target_service: callee.name,
      target_host: `${callee.name}.internal:${callee.port}`,
      method: faker.helpers.arrayElement(['GetUser', 'CreateOrder', 'ProcessPayment', 'CheckInventory', 'SendNotification', 'IndexDocument']),
      protocol: faker.helpers.weightedArrayElement([{ value: 'grpc', weight: 60 }, { value: 'http', weight: 40 }]),
      duration_ms: duration,
      success,
      retry_count: success ? 0 : faker.number.int({ min: 1, max: 3 })
    }
  };

  if (!success) {
    log.error = {
      type: faker.helpers.arrayElement(['UNAVAILABLE', 'DEADLINE_EXCEEDED', 'INTERNAL', 'RESOURCE_EXHAUSTED']),
      message: faker.helpers.arrayElement([
        `Connection refused to ${callee.name}.internal:${callee.port}`,
        `Deadline exceeded: context deadline (500ms)`,
        `Service ${callee.name} returned INTERNAL error`,
        `Circuit breaker open for ${callee.name}`
      ])
    };
  }

  return log;
}

// --- Database Logs ---

const DB_OPERATIONS = [
  { op: 'SELECT', table: 'users', query: 'SELECT id, email, name FROM users WHERE id = $1' },
  { op: 'SELECT', table: 'orders', query: 'SELECT o.*, oi.* FROM orders o JOIN order_items oi ON o.id = oi.order_id WHERE o.user_id = $1 ORDER BY o.created_at DESC LIMIT 20' },
  { op: 'INSERT', table: 'orders', query: 'INSERT INTO orders (user_id, total, status, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id' },
  { op: 'UPDATE', table: 'inventory', query: 'UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND quantity >= $1' },
  { op: 'DELETE', table: 'sessions', query: 'DELETE FROM sessions WHERE expires_at < NOW()' },
  { op: 'SELECT', table: 'products', query: 'SELECT p.*, c.name category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.active = true AND p.price BETWEEN $1 AND $2' },
  { op: 'INSERT', table: 'audit_log', query: 'INSERT INTO audit_log (user_id, action, resource, details, created_at) VALUES ($1, $2, $3, $4, NOW())' },
  { op: 'SELECT', table: 'payments', query: 'SELECT * FROM payments WHERE order_id = $1 AND status = $2 FOR UPDATE' },
  { op: 'UPDATE', table: 'users', query: 'UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1' },
  { op: 'SELECT', table: 'analytics', query: 'SELECT date_trunc(\'hour\', created_at) AS hour, COUNT(*), AVG(response_time_ms) FROM requests WHERE created_at > NOW() - INTERVAL \'24 hours\' GROUP BY 1 ORDER BY 1' }
];

function databaseLog() {
  const svc = faker.helpers.arrayElement(SERVICES);
  const dbOp = faker.helpers.arrayElement(DB_OPERATIONS);
  const dbHost = faker.helpers.arrayElement(DB_HOSTS);
  const duration = faker.number.float({ min: 0.5, max: 1200, fractionDigits: 1 });
  const rowsAffected = faker.number.int({ min: 0, max: 500 });
  const slowThreshold = 200;
  const failed = Math.random() < 0.03;
  const level = failed ? 'error' : duration > slowThreshold ? 'warn' : duration < 5 ? 'debug' : 'info';

  const log = {
    ...base(svc, level, 'database'),
    message: failed
      ? `DB query failed: ${dbOp.op} ${dbOp.table} on ${dbHost}`
      : duration > slowThreshold
        ? `Slow query detected: ${dbOp.op} ${dbOp.table} took ${duration}ms`
        : `${dbOp.op} ${dbOp.table} completed in ${duration}ms`,
    db: {
      system: 'postgresql',
      host: dbHost,
      name: `${svc.name.replace('-service', '')}_production`,
      operation: dbOp.op,
      table: dbOp.table,
      statement: dbOp.query,
      duration_ms: duration,
      rows_affected: rowsAffected,
      connection_pool: {
        active: faker.number.int({ min: 1, max: 20 }),
        idle: faker.number.int({ min: 0, max: 10 }),
        max: 20
      }
    }
  };

  if (failed) {
    log.error = {
      type: faker.helpers.arrayElement(['ConnectionTimeout', 'DeadlockDetected', 'UniqueConstraintViolation', 'QueryCancelled', 'TooManyConnections']),
      message: faker.helpers.arrayElement([
        `Connection to ${dbHost} timed out after 5000ms`,
        `ERROR: deadlock detected on table "${dbOp.table}"`,
        `ERROR: duplicate key value violates unique constraint "${dbOp.table}_pkey"`,
        `ERROR: canceling statement due to statement timeout`,
        `FATAL: too many connections for role "app_user"`
      ]),
      sql_state: faker.helpers.arrayElement(['57014', '40P01', '23505', '53300', '08006'])
    };
  }

  return log;
}

// --- Cache Logs ---

function cacheLog() {
  const svc = faker.helpers.arrayElement(SERVICES);
  const cacheHost = faker.helpers.arrayElement(CACHE_HOSTS);
  const op = faker.helpers.weightedArrayElement([
    { value: 'GET', weight: 60 }, { value: 'SET', weight: 20 },
    { value: 'DEL', weight: 5 }, { value: 'MGET', weight: 10 }, { value: 'EXPIRE', weight: 5 }
  ]);
  const hit = op === 'GET' ? Math.random() > 0.2 : null;
  const key = faker.helpers.arrayElement([
    `user:${faker.string.uuid()}:profile`,
    `session:${faker.string.alphanumeric(32)}`,
    `product:${faker.number.int({ min: 1000, max: 9999 })}:details`,
    `rate_limit:${faker.internet.ipv4()}`,
    `order:${faker.string.uuid()}:status`,
    `inventory:${faker.number.int({ min: 1000, max: 9999 })}:stock`,
    `config:feature_flags`,
    `search:${faker.string.alphanumeric(16)}:results`
  ]);
  const duration = faker.number.float({ min: 0.1, max: 25, fractionDigits: 2 });
  const failed = Math.random() < 0.02;
  const level = failed ? 'error' : (hit === false ? 'debug' : 'debug');

  const log = {
    ...base(svc, level, 'cache'),
    message: failed
      ? `Cache ${op} failed for key ${key.split(':').slice(0, 2).join(':')}`
      : hit === false
        ? `Cache MISS: ${key.split(':').slice(0, 2).join(':')}`
        : `Cache ${op} ${key.split(':').slice(0, 2).join(':')} in ${duration}ms`,
    cache: {
      system: cacheHost.includes('memcached') ? 'memcached' : 'redis',
      host: cacheHost,
      operation: op,
      key,
      hit,
      duration_ms: duration,
      ttl_seconds: op === 'SET' ? faker.helpers.arrayElement([60, 300, 900, 3600, 86400]) : undefined,
      value_size_bytes: op === 'SET' ? faker.number.int({ min: 50, max: 50000 }) : undefined
    }
  };

  if (failed) {
    log.level = 'error';
    log.error = {
      type: faker.helpers.arrayElement(['ConnectionReset', 'CommandTimeout', 'MaxRetriesExceeded', 'OOM']),
      message: faker.helpers.arrayElement([
        `Connection to ${cacheHost} reset by peer`,
        `Command timed out after 100ms`,
        `Max retries (3) exceeded for ${op} on ${cacheHost}`,
        `OOM command not allowed when used memory > maxmemory`
      ])
    };
  }

  return log;
}

// --- Message Queue Logs ---

function queueLog() {
  const svc = faker.helpers.arrayElement(SERVICES);
  const topic = faker.helpers.arrayElement(QUEUE_TOPICS);
  const action = faker.helpers.weightedArrayElement([
    { value: 'publish', weight: 45 }, { value: 'consume', weight: 45 },
    { value: 'ack', weight: 5 }, { value: 'nack', weight: 5 }
  ]);
  const failed = action === 'nack' || Math.random() < 0.03;
  const level = failed ? 'warn' : 'info';
  const partition = faker.number.int({ min: 0, max: 11 });
  const offset = faker.number.int({ min: 100000, max: 9999999 });

  const log = {
    ...base(svc, level, 'queue'),
    message: failed
      ? `Message ${action} failed on topic ${topic} partition ${partition}`
      : `Message ${action} on topic ${topic} partition ${partition} offset ${offset}`,
    queue: {
      system: 'kafka',
      broker: `kafka-${faker.number.int({ min: 1, max: 3 })}.internal:9092`,
      topic,
      partition,
      offset,
      action,
      consumer_group: `${svc.name}-consumer`,
      message_size_bytes: faker.number.int({ min: 100, max: 10000 }),
      lag: action === 'consume' ? faker.number.int({ min: 0, max: 5000 }) : undefined
    }
  };

  if (failed) {
    log.error = {
      type: faker.helpers.arrayElement(['SerializationError', 'BrokerUnavailable', 'MessageTooLarge', 'AuthenticationFailed']),
      message: `Failed to ${action} message on ${topic}: ${faker.helpers.arrayElement([
        'serialization error: invalid JSON',
        'broker not available',
        'message exceeds max size (1048576 bytes)',
        'SASL authentication failed'
      ])}`
    };
  }

  return log;
}

// --- Application Logic Logs ---

function applicationLog() {
  const svc = faker.helpers.arrayElement(SERVICES);
  const scenario = faker.helpers.weightedArrayElement([
    { value: 'request_lifecycle', weight: 25 },
    { value: 'business_logic', weight: 25 },
    { value: 'auth', weight: 15 },
    { value: 'background_job', weight: 15 },
    { value: 'health', weight: 10 },
    { value: 'startup', weight: 10 }
  ]);

  switch (scenario) {
    case 'request_lifecycle':
      return requestLifecycleLog(svc);
    case 'business_logic':
      return businessLogicLog(svc);
    case 'auth':
      return authLog(svc);
    case 'background_job':
      return backgroundJobLog(svc);
    case 'health':
      return healthLog(svc);
    case 'startup':
      return startupLog(svc);
  }
}

function requestLifecycleLog(svc) {
  const reqId = faker.string.uuid();
  const duration = faker.number.float({ min: 5, max: 2000, fractionDigits: 1 });
  const level = duration > 1000 ? 'warn' : 'info';
  const phase = faker.helpers.arrayElement(['received', 'middleware', 'handler', 'response']);

  const messages = {
    received: `Incoming request ${reqId}: POST /api/v1/${faker.word.noun()}s`,
    middleware: `Request ${reqId}: auth validated, rate limit OK, body parsed (${faker.number.int({ min: 50, max: 5000 })} bytes)`,
    handler: `Request ${reqId}: handler executed in ${duration}ms, status=200`,
    response: `Request ${reqId}: response sent, total=${duration}ms, body=${faker.number.int({ min: 100, max: 50000 })} bytes`
  };

  return {
    ...base(svc, level, 'http-server'),
    message: messages[phase],
    request: {
      id: reqId,
      phase,
      duration_ms: duration
    }
  };
}

function businessLogicLog(svc) {
  const events = [
    { level: 'info', msg: () => `Order ${faker.string.uuid().slice(0, 8)} created: ${faker.number.int({ min: 1, max: 10 })} items, total=$${faker.commerce.price({ min: 10, max: 5000 })}` },
    { level: 'info', msg: () => `Payment authorized for $${faker.commerce.price()}, txn_id=${faker.string.alphanumeric(16)}, gateway=stripe` },
    { level: 'warn', msg: () => `Inventory low for product ${faker.number.int({ min: 1000, max: 9999 })}: ${faker.number.int({ min: 1, max: 5 })} units remaining, reorder threshold is 10` },
    { level: 'info', msg: () => `User ${faker.string.uuid().slice(0, 8)} updated profile: email changed, notification preferences updated` },
    { level: 'error', msg: () => `Payment declined for order ${faker.string.uuid().slice(0, 8)}: card_declined (insufficient_funds), amount=$${faker.commerce.price()}` },
    { level: 'info', msg: () => `Search query "${faker.commerce.productName()}" returned ${faker.number.int({ min: 0, max: 500 })} results in ${faker.number.int({ min: 10, max: 300 })}ms` },
    { level: 'warn', msg: () => `Duplicate order detection triggered for user ${faker.string.uuid().slice(0, 8)}: same items within 60s window` },
    { level: 'info', msg: () => `Notification queued: email to ${faker.internet.email()}, template=order_confirmation, scheduled=${new Date().toISOString()}` },
    { level: 'debug', msg: () => `Price calculation for cart: subtotal=$${faker.commerce.price()}, tax=$${faker.commerce.price({ min: 1, max: 50 })}, discount=$${faker.commerce.price({ min: 0, max: 20 })}, shipping=$${faker.commerce.price({ min: 0, max: 15 })}` },
    { level: 'error', msg: () => `Inventory reservation failed for product ${faker.number.int({ min: 1000, max: 9999 })}: optimistic lock conflict, retrying (attempt 2/3)` },
    { level: 'info', msg: () => `Refund processed: order=${faker.string.uuid().slice(0, 8)}, amount=$${faker.commerce.price()}, reason=customer_request, refund_id=${faker.string.alphanumeric(12)}` },
    { level: 'debug', msg: () => `Feature flag evaluated: flag=new_checkout_flow, user_segment=beta, result=enabled` }
  ];

  const event = faker.helpers.arrayElement(events);
  return {
    ...base(svc, event.level, 'app'),
    message: event.msg()
  };
}

function authLog(svc) {
  const events = [
    { level: 'info', msg: () => `Authentication successful: user=${faker.internet.email()}, method=jwt, ip=${faker.internet.ipv4()}` },
    { level: 'warn', msg: () => `Authentication failed: user=${faker.internet.email()}, reason=invalid_password, ip=${faker.internet.ipv4()}, attempts=3` },
    { level: 'warn', msg: () => `Rate limit exceeded for API key ${faker.string.alphanumeric(16)}...: 150/100 requests in 60s window` },
    { level: 'info', msg: () => `Token refreshed for user ${faker.string.uuid().slice(0, 8)}, new expiry=${new Date(Date.now() + 3600000).toISOString()}` },
    { level: 'error', msg: () => `JWT validation error: token expired at ${new Date(Date.now() - 60000).toISOString()}, issued by auth-service v2.1.0` },
    { level: 'warn', msg: () => `Suspicious login detected: user=${faker.internet.email()}, ip=${faker.internet.ipv4()}, country=XX, previous_country=US` },
    { level: 'info', msg: () => `API key created: key_prefix=${faker.string.alphanumeric(8)}..., scope=[read,write], user=${faker.internet.email()}` },
    { level: 'debug', msg: () => `RBAC check: user=${faker.string.uuid().slice(0, 8)}, resource=orders:write, role=admin, result=allowed` }
  ];

  const event = faker.helpers.arrayElement(events);
  return {
    ...base(svc, event.level, 'auth'),
    message: event.msg()
  };
}

function backgroundJobLog(svc) {
  const jobNames = ['email_sender', 'report_generator', 'data_cleanup', 'index_rebuilder', 'metrics_aggregator', 'cache_warmer', 'webhook_dispatcher', 'etl_pipeline'];
  const job = faker.helpers.arrayElement(jobNames);
  const duration = faker.number.int({ min: 100, max: 300000 });
  const processed = faker.number.int({ min: 1, max: 10000 });
  const failed = Math.random() < 0.05;
  const level = failed ? 'error' : duration > 60000 ? 'warn' : 'info';

  const log = {
    ...base(svc, level, 'job'),
    message: failed
      ? `Job ${job} failed after ${duration}ms: processed ${processed} items, ${faker.number.int({ min: 1, max: 10 })} errors`
      : `Job ${job} completed in ${duration}ms: processed ${processed} items`,
    job: {
      name: job,
      id: faker.string.uuid(),
      duration_ms: duration,
      items_processed: processed,
      items_failed: failed ? faker.number.int({ min: 1, max: 10 }) : 0,
      next_run: new Date(Date.now() + faker.number.int({ min: 60000, max: 3600000 })).toISOString()
    }
  };

  if (failed) {
    log.error = {
      type: 'JobExecutionError',
      message: faker.helpers.arrayElement([
        `Timeout after ${duration}ms processing batch`,
        `Failed to acquire lock for ${job}`,
        `Downstream service unavailable during ${job}`,
        `Out of memory processing large batch in ${job}`
      ])
    };
  }

  return log;
}

function healthLog(svc) {
  const deps = ['database', 'redis', 'kafka', 'elasticsearch', 'external-api'];
  const depStatus = deps.map(d => ({
    name: d,
    healthy: Math.random() > 0.05,
    latency_ms: faker.number.float({ min: 0.5, max: 50, fractionDigits: 1 })
  }));
  const allHealthy = depStatus.every(d => d.healthy);

  return {
    ...base(svc, allHealthy ? 'debug' : 'warn', 'health'),
    message: allHealthy
      ? `Health check passed: all ${deps.length} dependencies healthy`
      : `Health check degraded: ${depStatus.filter(d => !d.healthy).map(d => d.name).join(', ')} unhealthy`,
    health: {
      status: allHealthy ? 'healthy' : 'degraded',
      dependencies: depStatus,
      uptime_seconds: faker.number.int({ min: 3600, max: 864000 }),
      memory_mb: faker.number.int({ min: 256, max: 2048 }),
      cpu_percent: faker.number.float({ min: 5, max: 85, fractionDigits: 1 }),
      goroutines: faker.number.int({ min: 50, max: 500 })
    }
  };
}

function startupLog(svc) {
  const events = [
    { level: 'info', msg: () => `Service ${svc.name} starting on port ${svc.port}, environment=production, version=${faker.system.semver()}` },
    { level: 'info', msg: () => `Database connection pool initialized: host=${faker.helpers.arrayElement(DB_HOSTS)}, pool_size=20, ssl=true` },
    { level: 'info', msg: () => `Redis connection established: host=${faker.helpers.arrayElement(CACHE_HOSTS)}, db=0` },
    { level: 'info', msg: () => `Kafka consumer group ${svc.name}-consumer joined: topics=[${faker.helpers.arrayElements(QUEUE_TOPICS, 2).join(', ')}], partitions=12` },
    { level: 'info', msg: () => `HTTP server listening on 0.0.0.0:${svc.port}, read_timeout=30s, write_timeout=30s, max_connections=10000` },
    { level: 'info', msg: () => `Feature flags loaded: 12 flags from config-service, refresh_interval=60s` },
    { level: 'warn', msg: () => `Graceful shutdown initiated: draining ${faker.number.int({ min: 1, max: 50 })} in-flight requests, timeout=30s` },
    { level: 'info', msg: () => `Service ${svc.name} shut down cleanly, uptime=${faker.number.int({ min: 3600, max: 864000 })}s` }
  ];

  const event = faker.helpers.arrayElement(events);
  return {
    ...base(svc, event.level, 'lifecycle'),
    message: event.msg()
  };
}

// --- Generator dispatch ---

const LOG_GENERATORS = [
  { fn: albLog, weight: 20 },
  { fn: serviceCallLog, weight: 15 },
  { fn: databaseLog, weight: 20 },
  { fn: cacheLog, weight: 15 },
  { fn: queueLog, weight: 10 },
  { fn: applicationLog, weight: 20 }
];

function pickRecord() {
  const totalWeight = LOG_GENERATORS.reduce((s, g) => s + g.weight, 0);
  let r = Math.random() * totalWeight;
  for (const g of LOG_GENERATORS) {
    r -= g.weight;
    if (r <= 0) return g.fn();
  }
  return LOG_GENERATORS[0].fn();
}

function levelOf(record) {
  try {
    const obj = typeof record === 'string' ? JSON.parse(record) : record;
    return (obj.level || 'info').toLowerCase();
  } catch { return 'info'; }
}

export function generate(count, opts = {}) {
  _tz = opts.timezone || 'UTC';
  const dist = opts.levelDistribution;

  if (!dist) {
    const records = [];
    for (let i = 0; i < count; i++) records.push(JSON.stringify(pickRecord()));
    return records;
  }

  // Pool-based approach to honour requested level distribution
  const totalWeight = (dist.info ?? 0) + (dist.warn ?? 0) + (dist.error ?? 0) + (dist.debug ?? 0) || 1;
  const poolSize = Math.max(count * 4, 40);
  const pools = { info: [], warn: [], error: [], debug: [] };
  for (let i = 0; i < poolSize; i++) {
    const rec = JSON.stringify(pickRecord());
    const lvl = levelOf(rec);
    const key = ['info', 'warn', 'error', 'debug'].includes(lvl) ? lvl : 'info';
    pools[key].push(rec);
  }

  const targets = {
    info: Math.round(count * (dist.info ?? 0) / totalWeight),
    warn: Math.round(count * (dist.warn ?? 0) / totalWeight),
    error: Math.round(count * (dist.error ?? 0) / totalWeight),
    debug: Math.round(count * (dist.debug ?? 0) / totalWeight)
  };

  const result = [];
  for (const [lvl, target] of Object.entries(targets)) {
    const pool = pools[lvl];
    for (let i = 0; i < target; i++) {
      result.push(pool[i % Math.max(pool.length, 1)]);
    }
  }
  // Fill remainder from general pool
  while (result.length < count) result.push(JSON.stringify(pickRecord()));
  result.sort(() => Math.random() - 0.5);
  return result.slice(0, count);
}
