import { faker } from '@faker-js/faker';

const OPERATIONS = [
  { name: 'SELECT users', statement: 'SELECT * FROM users WHERE id = $1' },
  { name: 'INSERT orders', statement: 'INSERT INTO orders (user_id, total, status) VALUES ($1, $2, $3)' },
  { name: 'UPDATE inventory', statement: 'UPDATE inventory SET quantity = quantity - $1 WHERE product_id = $2' },
  { name: 'DELETE sessions', statement: 'DELETE FROM sessions WHERE expires_at < NOW()' },
  { name: 'SELECT products JOIN', statement: 'SELECT p.*, c.name as category FROM products p JOIN categories c ON p.category_id = c.id WHERE p.active = true' },
  { name: 'AGGREGATE analytics', statement: 'SELECT date_trunc(\'hour\', created_at), COUNT(*) FROM events GROUP BY 1 ORDER BY 1 DESC LIMIT 24' }
];

const DB_SYSTEMS = ['postgresql', 'mysql', 'mongodb'];

function hexId(length) {
  return faker.string.hexadecimal({ length, prefix: '' }).toLowerCase();
}

function nanoTimestamp(baseMs, offsetMs = 0) {
  return String((baseMs + offsetMs) * 1000000);
}

export function generate(count, opts = {}) {
  const serviceName = opts.serviceName || 'data-service';
  const dbSystem = opts.dbSystem || faker.helpers.arrayElement(DB_SYSTEMS);
  const traces = [];

  for (let i = 0; i < count; i++) {
    const traceId = hexId(32);
    const baseTime = Date.now();
    const operation = faker.helpers.arrayElement(OPERATIONS);
    const totalDuration = faker.number.int({ min: 20, max: 500 });
    const spans = [];

    const connSpanId = hexId(16);
    const connDuration = faker.number.int({ min: 1, max: 15 });
    spans.push({
      traceId,
      spanId: connSpanId,
      name: 'db.connection.acquire',
      kind: 3,
      startTimeUnixNano: nanoTimestamp(baseTime),
      endTimeUnixNano: nanoTimestamp(baseTime, connDuration),
      attributes: [
        { key: 'db.system', value: { stringValue: dbSystem } },
        { key: 'db.connection_pool.size', value: { intValue: faker.number.int({ min: 5, max: 20 }) } },
        { key: 'db.connection_pool.used', value: { intValue: faker.number.int({ min: 1, max: 15 }) } }
      ],
      status: { code: 1 }
    });

    const querySpanId = hexId(16);
    const queryStart = connDuration + 1;
    const queryDuration = faker.number.int({ min: 10, max: totalDuration - connDuration - 10 });
    const rowsAffected = faker.number.int({ min: 0, max: 1000 });
    spans.push({
      traceId,
      spanId: querySpanId,
      parentSpanId: connSpanId,
      name: operation.name,
      kind: 3,
      startTimeUnixNano: nanoTimestamp(baseTime, queryStart),
      endTimeUnixNano: nanoTimestamp(baseTime, queryStart + queryDuration),
      attributes: [
        { key: 'db.system', value: { stringValue: dbSystem } },
        { key: 'db.statement', value: { stringValue: operation.statement } },
        { key: 'db.name', value: { stringValue: opts.dbName || 'app_production' } },
        { key: 'db.operation', value: { stringValue: operation.name.split(' ')[0] } },
        { key: 'db.rows_affected', value: { intValue: rowsAffected } }
      ],
      status: { code: 1 }
    });

    const resultSpanId = hexId(16);
    const resultStart = queryStart + queryDuration + 1;
    spans.push({
      traceId,
      spanId: resultSpanId,
      parentSpanId: querySpanId,
      name: 'db.result.process',
      kind: 1,
      startTimeUnixNano: nanoTimestamp(baseTime, resultStart),
      endTimeUnixNano: nanoTimestamp(baseTime, totalDuration),
      attributes: [
        { key: 'db.rows_returned', value: { intValue: rowsAffected } },
        { key: 'result.serialization_ms', value: { intValue: faker.number.int({ min: 1, max: 20 }) } }
      ],
      status: { code: 1 }
    });

    traces.push({
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: serviceName } },
          { key: 'db.system', value: { stringValue: dbSystem } },
          { key: 'host.name', value: { stringValue: opts.sourceHost || `${serviceName}-${faker.string.alphanumeric(5)}` } }
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
