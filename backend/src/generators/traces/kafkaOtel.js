import { faker } from '@faker-js/faker';

const TOPICS = ['orders', 'payments', 'inventory', 'user-events', 'notifications', 'audit-log', 'product-catalog', 'shipments'];
const CONSUMER_GROUPS = ['analytics-consumers', 'order-processor', 'notification-service', 'audit-writer', 'reporting-consumer'];

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

export function generate(count, opts = {}) {
  const serviceName = opts.serviceName || 'kafka-client';
  const host = opts.sourceHost || 'kafka-broker-01';
  const traces = [];

  for (let i = 0; i < count; i++) {
    const traceId = hexId(32);
    const spanId = hexId(16);
    const baseMs = Date.now();
    const topic = faker.helpers.arrayElement(TOPICS);
    const partition = faker.number.int({ min: 0, max: 11 });
    const offset = faker.number.int({ min: 0, max: 99999999 });
    const isProducer = Math.random() < 0.5;
    const isFailed = Math.random() < 0.03;

    const durationMs = faker.number.float({ min: 0.2, max: isProducer ? 100 : 500, fractionDigits: 2 });

    const attrs = isProducer
      ? {
          'messaging.system': 'kafka',
          'messaging.destination.name': topic,
          'messaging.operation': 'publish',
          'messaging.kafka.partition': partition,
          'messaging.kafka.message.offset': offset,
          'messaging.message.body.size': faker.number.int({ min: 100, max: 100000 }),
          'messaging.kafka.client_id': `producer-${faker.number.int({ min: 1, max: 100 })}`,
          'net.peer.name': host,
          'net.peer.port': 9092,
        }
      : {
          'messaging.system': 'kafka',
          'messaging.destination.name': topic,
          'messaging.operation': 'receive',
          'messaging.kafka.partition': partition,
          'messaging.kafka.message.offset': offset,
          'messaging.kafka.consumer.group': faker.helpers.arrayElement(CONSUMER_GROUPS),
          'messaging.kafka.client_id': `consumer-${faker.number.int({ min: 1, max: 50 })}`,
          'messaging.message.body.size': faker.number.int({ min: 100, max: 100000 }),
          'net.peer.name': host,
          'net.peer.port': 9092,
        };

    const events = [];
    if (isFailed) {
      events.push({
        timeUnixNano: toNano(baseMs + durationMs),
        name: 'exception',
        attributes: toAttr({
          'exception.type': faker.helpers.arrayElement([
            'RecordTooLargeException', 'TimeoutException', 'SerializationException',
            'AuthorizationException', 'ProducerFencedException'
          ]),
          'exception.message': faker.helpers.arrayElement([
            `Record size ${faker.number.int({ min: 1000001, max: 10000000 })} bytes exceeds max.request.size`,
            `Expiring ${faker.number.int({ min: 1, max: 100 })} record(s) for ${topic}-${partition}: ${faker.number.int({ min: 30000, max: 120000 })} ms has passed since batch creation`,
            `Failed to serialize value for topic ${topic}`,
            `Not authorized to access group: ${faker.helpers.arrayElement(CONSUMER_GROUPS)}`,
            `This producer has been fenced; another producer with the same transactional.id has been started`
          ])
        })
      });
    }

    const span = {
      traceId,
      spanId,
      name: `${topic} ${isProducer ? 'publish' : 'receive'}`,
      kind: isProducer ? 4 : 5, // 4=PRODUCER, 5=CONSUMER
      startTimeUnixNano: toNano(baseMs),
      endTimeUnixNano: toNano(baseMs + durationMs),
      attributes: toAttr(attrs),
      status: { code: isFailed ? 2 : 1 },
      events,
    };

    traces.push({
      resourceSpans: [{
        resource: {
          attributes: toAttr({
            'service.name': serviceName,
            'messaging.system': 'kafka',
            'server.address': host,
            'server.port': 9092,
            'host.name': host,
            'kafka.version': '3.6.0',
          })
        },
        scopeSpans: [{
          scope: { name: 'kafka-otel-instrumentation', version: '1.0.0' },
          spans: [span]
        }]
      }]
    });
  }

  return traces;
}
