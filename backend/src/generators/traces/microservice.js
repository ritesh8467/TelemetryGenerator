import { faker } from '@faker-js/faker';

const SERVICES = [
  { name: 'api-gateway', operations: ['route_request', 'validate_auth', 'rate_limit'] },
  { name: 'user-service', operations: ['get_user', 'update_profile', 'list_users'] },
  { name: 'order-service', operations: ['create_order', 'process_payment', 'update_status'] },
  { name: 'inventory-service', operations: ['check_stock', 'reserve_items', 'release_hold'] },
  { name: 'notification-service', operations: ['send_email', 'send_push', 'queue_sms'] },
  { name: 'payment-service', operations: ['charge_card', 'refund', 'validate_payment'] }
];

function hexId(length) {
  return faker.string.hexadecimal({ length, prefix: '' }).toLowerCase();
}

function nanoTimestamp(baseMs, offsetMs = 0) {
  return String((baseMs + offsetMs) * 1000000);
}

export function generate(count, opts = {}) {
  const traces = [];

  for (let i = 0; i < count; i++) {
    const traceId = hexId(32);
    const baseTime = Date.now();
    const chainLength = faker.number.int({ min: 3, max: 5 });
    const selectedServices = faker.helpers.arrayElements(SERVICES, chainLength);
    const allSpans = [];
    let currentOffset = 0;
    let parentSpanId = null;

    for (let s = 0; s < selectedServices.length; s++) {
      const svc = selectedServices[s];
      const operation = faker.helpers.arrayElement(svc.operations);
      const spanId = hexId(16);
      const duration = faker.number.int({ min: 10, max: 150 });

      const span = {
        traceId,
        spanId,
        name: `${svc.name}.${operation}`,
        kind: s === 0 ? 2 : 3,
        startTimeUnixNano: nanoTimestamp(baseTime, currentOffset),
        endTimeUnixNano: nanoTimestamp(baseTime, currentOffset + duration),
        attributes: [
          { key: 'service.name', value: { stringValue: svc.name } },
          { key: 'rpc.method', value: { stringValue: operation } },
          { key: 'rpc.system', value: { stringValue: 'grpc' } },
          { key: 'net.peer.name', value: { stringValue: `${svc.name}.svc.cluster.local` } },
          { key: 'net.peer.port', value: { intValue: faker.helpers.arrayElement([8080, 9090, 3000, 4000]) } }
        ],
        status: { code: 1 }
      };

      if (parentSpanId) {
        span.parentSpanId = parentSpanId;
      }

      allSpans.push({ span, serviceName: svc.name });
      parentSpanId = spanId;
      currentOffset += duration + faker.number.int({ min: 2, max: 20 });
    }

    const spansByService = {};
    for (const { span, serviceName } of allSpans) {
      if (!spansByService[serviceName]) spansByService[serviceName] = [];
      spansByService[serviceName].push(span);
    }

    const resourceSpans = Object.entries(spansByService).map(([svcName, spans]) => ({
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: svcName } },
          { key: 'service.version', value: { stringValue: `1.${faker.number.int({ min: 0, max: 9 })}.${faker.number.int({ min: 0, max: 20 })}` } },
          { key: 'deployment.environment', value: { stringValue: opts.environment || 'production' } }
        ]
      },
      scopeSpans: [{
        scope: { name: 'telemetry-generator', version: '1.0.0' },
        spans
      }]
    }));

    traces.push(...resourceSpans);
  }

  return { resourceSpans: traces };
}
