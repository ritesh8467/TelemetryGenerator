import { faker } from '@faker-js/faker';

const ERROR_SCENARIOS = [
  {
    name: 'NullPointerException',
    message: 'Cannot read property of null',
    stack: 'NullPointerException: Cannot read property \'id\' of null\n    at UserService.getUser(/app/src/services/user.js:45:12)\n    at OrderHandler.process(/app/src/handlers/order.js:78:24)\n    at Router.handle(/app/node_modules/express/lib/router/index.js:275:10)'
  },
  {
    name: 'TimeoutError',
    message: 'Request timeout after 30000ms',
    stack: 'TimeoutError: Request timeout after 30000ms\n    at ClientRequest.<anonymous>(/app/src/http/client.js:112:15)\n    at PaymentService.charge(/app/src/services/payment.js:34:9)\n    at async OrderProcessor.execute(/app/src/processors/order.js:56:5)'
  },
  {
    name: 'ConnectionRefusedError',
    message: 'connect ECONNREFUSED 10.0.1.5:5432',
    stack: 'ConnectionRefusedError: connect ECONNREFUSED 10.0.1.5:5432\n    at TCPConnectWrap.afterConnect(net.js:1141:16)\n    at Pool.connect(/app/node_modules/pg/lib/pool.js:89:11)\n    at Database.query(/app/src/db/connection.js:23:18)'
  },
  {
    name: 'ValidationError',
    message: 'Invalid input: email field is required',
    stack: 'ValidationError: Invalid input: email field is required\n    at validate(/app/src/middleware/validator.js:34:11)\n    at Layer.handle(/app/node_modules/express/lib/router/layer.js:95:5)'
  },
  {
    name: 'OutOfMemoryError',
    message: 'JavaScript heap out of memory',
    stack: 'FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory\n    at DataProcessor.transform(/app/src/processors/data.js:201:14)\n    at BatchJob.run(/app/src/jobs/batch.js:45:8)'
  }
];

function hexId(length) {
  return faker.string.hexadecimal({ length, prefix: '' }).toLowerCase();
}

function nanoTimestamp(baseMs, offsetMs = 0) {
  return String((baseMs + offsetMs) * 1000000);
}

export function generate(count, opts = {}) {
  const serviceName = opts.serviceName || 'order-service';
  const traces = [];

  for (let i = 0; i < count; i++) {
    const traceId = hexId(32);
    const baseTime = Date.now();
    const error = faker.helpers.arrayElement(ERROR_SCENARIOS);
    const totalDuration = faker.number.int({ min: 100, max: 30000 });
    const spans = [];

    const rootSpanId = hexId(16);
    spans.push({
      traceId,
      spanId: rootSpanId,
      name: `${faker.helpers.arrayElement(['POST', 'PUT', 'GET'])} /api/${faker.word.noun()}`,
      kind: 2,
      startTimeUnixNano: nanoTimestamp(baseTime),
      endTimeUnixNano: nanoTimestamp(baseTime, totalDuration),
      attributes: [
        { key: 'http.method', value: { stringValue: 'POST' } },
        { key: 'http.status_code', value: { intValue: faker.helpers.arrayElement([500, 502, 503, 504]) } },
        { key: 'error', value: { boolValue: true } }
      ],
      status: { code: 2, message: error.message },
      events: [{
        name: 'exception',
        timeUnixNano: nanoTimestamp(baseTime, totalDuration - 5),
        attributes: [
          { key: 'exception.type', value: { stringValue: error.name } },
          { key: 'exception.message', value: { stringValue: error.message } },
          { key: 'exception.stacktrace', value: { stringValue: error.stack } }
        ]
      }]
    });

    const childSpanId = hexId(16);
    const childDuration = faker.number.int({ min: 10, max: totalDuration - 20 });
    spans.push({
      traceId,
      spanId: childSpanId,
      parentSpanId: rootSpanId,
      name: `internal.${faker.word.verb()}`,
      kind: 1,
      startTimeUnixNano: nanoTimestamp(baseTime, 5),
      endTimeUnixNano: nanoTimestamp(baseTime, 5 + childDuration),
      attributes: [
        { key: 'error', value: { boolValue: true } },
        { key: 'exception.type', value: { stringValue: error.name } }
      ],
      status: { code: 2, message: error.message }
    });

    traces.push({
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: serviceName } },
          { key: 'service.version', value: { stringValue: '2.1.0' } },
          { key: 'host.name', value: { stringValue: opts.sourceHost || `${serviceName}-${faker.string.alphanumeric(5)}` } },
          { key: 'deployment.environment', value: { stringValue: opts.environment || 'production' } }
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
