import { faker } from '@faker-js/faker';

const DB_TABLES = ['users', 'orders', 'products', 'inventory', 'sessions', 'payments', 'audit_log', 'categories', 'reviews', 'addresses'];

const QUERY_TEMPLATES = [
  { op: 'SELECT', sql: (t) => `SELECT * FROM ${t} WHERE id = ?`, type: 'read' },
  { op: 'SELECT', sql: (t) => `SELECT ${t}.*, COUNT(orders.id) AS order_count FROM ${t} LEFT JOIN orders ON orders.user_id = ${t}.id WHERE ${t}.active = 1 GROUP BY ${t}.id LIMIT 100`, type: 'read' },
  { op: 'INSERT', sql: (t) => `INSERT INTO ${t} (created_at, updated_at, status) VALUES (NOW(), NOW(), 'active')`, type: 'write' },
  { op: 'UPDATE', sql: (t) => `UPDATE ${t} SET updated_at = NOW(), status = ? WHERE id = ?`, type: 'write' },
  { op: 'DELETE', sql: (t) => `DELETE FROM ${t} WHERE expire_at < NOW() LIMIT 1000`, type: 'write' },
  { op: 'SELECT', sql: (t) => `SELECT COUNT(*) FROM ${t} WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`, type: 'read' }
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
  const serviceName = opts.serviceName || 'mysql-server';
  const host = opts.sourceHost || 'mysql-prod-01';
  const dbPort = 3306;
  const traces = [];

  for (let i = 0; i < count; i++) {
    const traceId = hexId(32);
    const spanId = hexId(16);
    const baseMs = Date.now();
    const table = faker.helpers.arrayElement(DB_TABLES);
    const queryTpl = faker.helpers.arrayElement(QUERY_TEMPLATES);
    const sql = queryTpl.sql(table);
    const durationMs = queryTpl.type === 'read'
      ? faker.number.float({ min: 0.5, max: 800, fractionDigits: 2 })
      : faker.number.float({ min: 1.0, max: 200, fractionDigits: 2 });
    const rowsAffected = queryTpl.op === 'SELECT' ? faker.number.int({ min: 0, max: 5000 }) : faker.number.int({ min: 0, max: 100 });
    const isSlowQuery = durationMs > 200;
    const isFailed = Math.random() < 0.03;

    const events = [];
    if (isSlowQuery) {
      events.push({
        timeUnixNano: toNano(baseMs + durationMs),
        name: 'slow_query',
        attributes: toAttr({
          'db.mysql.slow_query_threshold_ms': 200,
          'db.mysql.rows_examined': faker.number.int({ min: rowsAffected * 10, max: rowsAffected * 1000 + 1 })
        })
      });
    }
    if (isFailed) {
      events.push({
        timeUnixNano: toNano(baseMs + durationMs),
        name: 'exception',
        attributes: toAttr({
          'exception.type': faker.helpers.arrayElement(['DeadlockException', 'LockWaitTimeout', 'DuplicateKeyError', 'ConnectionTimeout']),
          'exception.message': faker.helpers.arrayElement([
            `Deadlock found when trying to get lock; try restarting transaction`,
            `Lock wait timeout exceeded; try restarting transaction`,
            `Duplicate entry '${faker.number.int({ min: 1, max: 99999 })}' for key 'PRIMARY'`,
            `Connection timed out after 30000ms`
          ])
        })
      });
    }

    const span = {
      traceId,
      spanId,
      name: `${queryTpl.op} ${table}`,
      kind: 3, // CLIENT
      startTimeUnixNano: toNano(baseMs),
      endTimeUnixNano: toNano(baseMs + durationMs),
      attributes: toAttr({
        'db.system': 'mysql',
        'db.name': 'production',
        'db.operation': queryTpl.op,
        'db.sql.table': table,
        'db.statement': sql,
        'net.peer.name': host,
        'net.peer.port': dbPort,
        'db.user': 'app_user',
        'db.mysql.rows_affected': rowsAffected,
        'db.mysql.num_rows': queryTpl.op === 'SELECT' ? rowsAffected : 0
      }),
      status: { code: isFailed ? 2 : 1 },
      events
    };

    traces.push({
      resourceSpans: [{
        resource: {
          attributes: toAttr({
            'service.name': serviceName,
            'db.system': 'mysql',
            'db.version': '8.0.35',
            'host.name': host
          })
        },
        scopeSpans: [{
          scope: { name: 'mysql-otel-instrumentation', version: '1.0.0' },
          spans: [span]
        }]
      }]
    });
  }

  return traces;
}
