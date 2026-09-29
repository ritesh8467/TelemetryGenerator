import { faker } from '@faker-js/faker';

const CONTAINERS = [
  'web-server', 'api-gateway', 'cache-layer', 'db-primary', 'queue-worker',
  'log-aggregator', 'metrics-collector', 'auth-service', 'payment-service', 'inventory-service'
];
const IMAGES = [
  'nginx:1.25', 'redis:7.2', 'postgres:16', 'node:20-alpine', 'python:3.12-slim',
  'mysql:8.0', 'rabbitmq:3.12', 'elasticsearch:8.11'
];
const INTERFACES = ['eth0', 'eth1'];

export function generate(count, opts = {}) {
  const host = opts.sourceHost || 'docker-host-01';
  const now = Math.floor(Date.now() / 1000);
  const records = [];

  for (let i = 0; i < count; i++) {
    const container = faker.helpers.arrayElement(CONTAINERS);
    const image = faker.helpers.arrayElement(IMAGES);
    const cid = faker.string.hexadecimal({ length: 12, prefix: '' }).toLowerCase();
    const iface = faker.helpers.arrayElement(INTERFACES);

    const memLimitBytes = 512 * 1024 * 1024; // 512 MB
    const memUsageBytes = faker.number.int({ min: 32 * 1024 * 1024, max: memLimitBytes - 8 * 1024 * 1024 });
    const memCacheBytes = faker.number.int({ min: 4 * 1024 * 1024, max: 64 * 1024 * 1024 });
    const cpuUsage = faker.number.float({ min: 0, max: 8000, fractionDigits: 6 });
    const containerAge = faker.number.int({ min: 60, max: 604800 });

    const base = { timestamp: now, tags: { host, container_name: container, image, container_id: cid } };
    const baseNet = { timestamp: now, tags: { host, container_name: container, image, container_id: cid, interface: iface } };
    const baseHost = { timestamp: now, tags: { host } };

    records.push(
      { ...base, name: 'container_cpu_usage_seconds_total', value: cpuUsage, type: 'sum' },
      { ...base, name: 'container_cpu_system_seconds_total', value: faker.number.float({ min: 0, max: 4000, fractionDigits: 6 }), type: 'sum' },
      { ...base, name: 'container_cpu_throttled_seconds_total', value: faker.number.float({ min: 0, max: 100, fractionDigits: 6 }), type: 'sum' },
      { ...base, name: 'container_memory_usage_bytes', value: memUsageBytes, type: 'gauge' },
      { ...base, name: 'container_memory_limit_bytes', value: memLimitBytes, type: 'gauge' },
      { ...base, name: 'container_memory_cache', value: memCacheBytes, type: 'gauge' },
      { ...base, name: 'container_memory_rss', value: memUsageBytes - memCacheBytes, type: 'gauge' },
      { ...base, name: 'container_memory_swap', value: faker.number.int({ min: 0, max: 32 * 1024 * 1024 }), type: 'gauge' },
      { ...baseNet, name: 'container_network_receive_bytes_total', value: faker.number.int({ min: 10000000, max: 9999999999 }), type: 'sum' },
      { ...baseNet, name: 'container_network_transmit_bytes_total', value: faker.number.int({ min: 5000000, max: 4999999999 }), type: 'sum' },
      { ...baseNet, name: 'container_network_receive_packets_total', value: faker.number.int({ min: 10000, max: 9999999 }), type: 'sum' },
      { ...baseNet, name: 'container_network_transmit_packets_total', value: faker.number.int({ min: 10000, max: 9999999 }), type: 'sum' },
      { ...baseNet, name: 'container_network_receive_errors_total', value: faker.number.int({ min: 0, max: 10 }), type: 'sum' },
      { ...baseNet, name: 'container_network_transmit_errors_total', value: faker.number.int({ min: 0, max: 5 }), type: 'sum' },
      { ...base, name: 'container_fs_reads_bytes_total', value: faker.number.int({ min: 100000, max: 999999999 }), type: 'sum' },
      { ...base, name: 'container_fs_writes_bytes_total', value: faker.number.int({ min: 100000, max: 999999999 }), type: 'sum' },
      { ...base, name: 'container_fs_io_time_seconds_total', value: faker.number.float({ min: 0, max: 100, fractionDigits: 6 }), type: 'sum' },
      { ...base, name: 'container_start_time_seconds', value: now - containerAge, type: 'gauge' },
      { ...base, name: 'container_last_seen', value: now, type: 'gauge' },
      { ...baseHost, name: 'engine_daemon_container_states_containers', value: faker.number.int({ min: 5, max: 25 }), type: 'gauge', tags: { ...baseHost.tags, state: 'running' } },
      { ...baseHost, name: 'engine_daemon_container_states_containers', value: faker.number.int({ min: 0, max: 5 }), type: 'gauge', tags: { ...baseHost.tags, state: 'stopped' } },
      { ...baseHost, name: 'engine_daemon_container_states_containers', value: 0, type: 'gauge', tags: { ...baseHost.tags, state: 'paused' } },
      { ...baseHost, name: 'engine_daemon_images_total', value: faker.number.int({ min: 10, max: 100 }), type: 'gauge' },
      { ...baseHost, name: 'engine_daemon_goroutines', value: faker.number.int({ min: 50, max: 200 }), type: 'gauge' },
      { ...baseHost, name: 'engine_daemon_health_failures', value: faker.number.int({ min: 0, max: 3 }), type: 'gauge' },
    );
  }

  return records;
}
