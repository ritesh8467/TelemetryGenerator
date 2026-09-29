import { faker } from '@faker-js/faker';

const TOPICS = ['orders', 'payments', 'inventory', 'user-events', 'notifications', 'audit-log', 'metrics', 'dead-letter'];
const REQUEST_TYPES = ['Produce', 'FetchConsumer', 'FetchFollower', 'Metadata', 'OffsetCommit', 'FindCoordinator', 'JoinGroup', 'Heartbeat'];

export function generate(count, opts = {}) {
  const host = opts.sourceHost || 'kafka-broker-01';
  const now = Math.floor(Date.now() / 1000);
  const records = [];

  for (let i = 0; i < count; i++) {
    const topic = faker.helpers.arrayElement(TOPICS);
    const requestType = faker.helpers.arrayElement(REQUEST_TYPES);
    const base = { timestamp: now, tags: { host, instance: `${host}:9308`, topic } };
    const baseGlobal = { timestamp: now, tags: { host, instance: `${host}:9308` } };
    const baseReq = { timestamp: now, tags: { host, instance: `${host}:9308`, request: requestType } };

    records.push(
      { ...baseGlobal, name: 'kafka_brokers', value: faker.number.int({ min: 1, max: 5 }), type: 'gauge' },
      { ...base, name: 'kafka_server_brokertopicmetrics_messagesin_total', value: faker.number.int({ min: 100000, max: 10000000 }), type: 'sum' },
      { ...base, name: 'kafka_server_brokertopicmetrics_bytesin_total', value: faker.number.int({ min: 1000000, max: 100000000 }), type: 'sum' },
      { ...base, name: 'kafka_server_brokertopicmetrics_bytesout_total', value: faker.number.int({ min: 5000000, max: 500000000 }), type: 'sum' },
      { ...base, name: 'kafka_server_brokertopicmetrics_failedproducerequests_total', value: faker.number.int({ min: 0, max: 100 }), type: 'sum' },
      { ...base, name: 'kafka_server_brokertopicmetrics_failedfetchrequests_total', value: faker.number.int({ min: 0, max: 50 }), type: 'sum' },
      { ...base, name: 'kafka_log_log_size', value: faker.number.int({ min: 1000000, max: 10000000000 }), type: 'gauge' },
      { ...base, name: 'kafka_log_log_logendoffset', value: faker.number.int({ min: 1000000, max: 999999999 }), type: 'gauge' },
      { ...base, name: 'kafka_consumer_group_lag', value: faker.number.int({ min: 0, max: 100000 }), type: 'gauge' },
      { ...baseGlobal, name: 'kafka_controller_kafkacontroller_activecontrollercount', value: 1, type: 'gauge' },
      { ...baseGlobal, name: 'kafka_controller_kafkacontroller_offlinepartitionscount', value: faker.number.int({ min: 0, max: 2 }), type: 'gauge' },
      { ...baseGlobal, name: 'kafka_server_replicamanager_underreplicatedpartitions', value: faker.number.int({ min: 0, max: 5 }), type: 'gauge' },
      { ...baseGlobal, name: 'kafka_server_replicamanager_partitioncount', value: faker.number.int({ min: 50, max: 500 }), type: 'gauge' },
      { ...baseGlobal, name: 'kafka_server_replicamanager_leadercount', value: faker.number.int({ min: 20, max: 250 }), type: 'gauge' },
      { ...baseGlobal, name: 'kafka_server_replicamanager_isrshrinks_total', value: faker.number.int({ min: 0, max: 100 }), type: 'sum' },
      { ...baseGlobal, name: 'kafka_server_replicamanager_isrexpands_total', value: faker.number.int({ min: 0, max: 100 }), type: 'sum' },
      { ...baseReq, name: 'kafka_network_requestmetrics_requests_total', value: faker.number.int({ min: 1000000, max: 999999999 }), type: 'sum' },
      { ...baseReq, name: 'kafka_network_requestmetrics_totaltime_mean', value: faker.number.float({ min: 0.5, max: 100.0, fractionDigits: 2 }), type: 'gauge' },
      { ...baseReq, name: 'kafka_network_requestmetrics_requestqueuetime_mean', value: faker.number.float({ min: 0.1, max: 50.0, fractionDigits: 2 }), type: 'gauge' },
      { ...baseGlobal, name: 'kafka_server_kafkarequesthandlerpool_requesthandleravgidlepercent', value: faker.number.float({ min: 0.3, max: 0.99, fractionDigits: 4 }), type: 'gauge' },
      { ...baseGlobal, name: 'kafka_network_socketserver_networkprocessoravgidlepercent', value: faker.number.float({ min: 0.5, max: 0.99, fractionDigits: 4 }), type: 'gauge' },
    );
  }

  return records;
}
