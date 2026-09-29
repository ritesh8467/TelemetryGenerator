import { faker } from '@faker-js/faker';

export function generate(count, opts = {}) {
  const host = opts.sourceHost || 'mysql-prod-01';
  const now = Math.floor(Date.now() / 1000);
  const records = [];

  for (let i = 0; i < count; i++) {
    const threadsConnected = faker.number.int({ min: 10, max: 200 });
    const threadsRunning = faker.number.int({ min: 1, max: Math.min(threadsConnected, 50) });
    const base = { timestamp: now, tags: { host, instance: `${host}:9104` } };

    records.push(
      { ...base, name: 'mysql_up', value: 1, type: 'gauge' },
      { ...base, name: 'mysql_global_status_threads_connected', value: threadsConnected, type: 'gauge' },
      { ...base, name: 'mysql_global_status_threads_running', value: threadsRunning, type: 'gauge' },
      { ...base, name: 'mysql_global_status_connections', value: faker.number.int({ min: 10000000, max: 99999999 }), type: 'sum' },
      { ...base, name: 'mysql_global_status_queries', value: faker.number.int({ min: 50000000, max: 999999999 }), type: 'sum' },
      { ...base, name: 'mysql_global_status_slow_queries', value: faker.number.int({ min: 100, max: 50000 }), type: 'sum' },
      { ...base, name: 'mysql_global_status_bytes_received', value: faker.number.int({ min: 1000000000, max: 9999999999 }), type: 'sum' },
      { ...base, name: 'mysql_global_status_bytes_sent', value: faker.number.int({ min: 5000000000, max: 99999999999 }), type: 'sum' },
      { ...base, name: 'mysql_global_status_innodb_buffer_pool_reads', value: faker.number.int({ min: 10000, max: 1000000 }), type: 'sum' },
      { ...base, name: 'mysql_global_status_innodb_buffer_pool_read_requests', value: faker.number.int({ min: 1000000000, max: 9999999999 }), type: 'sum' },
      { ...base, name: 'mysql_global_status_innodb_buffer_pool_pages_total', value: faker.number.int({ min: 50000, max: 1000000 }), type: 'gauge' },
      { ...base, name: 'mysql_global_status_innodb_buffer_pool_pages_free', value: faker.number.int({ min: 1000, max: 10000 }), type: 'gauge' },
      { ...base, name: 'mysql_global_status_innodb_data_reads', value: faker.number.int({ min: 1000000, max: 50000000 }), type: 'sum' },
      { ...base, name: 'mysql_global_status_innodb_data_writes', value: faker.number.int({ min: 500000, max: 25000000 }), type: 'sum' },
      { ...base, name: 'mysql_global_status_uptime', value: faker.number.int({ min: 86400, max: 31536000 }), type: 'gauge' },
      { ...base, name: 'mysql_global_status_aborted_connects', value: faker.number.int({ min: 0, max: 1000 }), type: 'sum' },
      { ...base, name: 'mysql_global_status_table_locks_waited', value: faker.number.int({ min: 0, max: 10000 }), type: 'sum' }
    );
  }

  return records;
}
