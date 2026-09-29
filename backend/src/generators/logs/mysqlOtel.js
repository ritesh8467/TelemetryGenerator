import { faker } from '@faker-js/faker';

const TABLES = ['users', 'orders', 'products', 'inventory', 'sessions', 'payments', 'audit_log', 'categories', 'reviews', 'addresses'];
const OPERATIONS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
const USERS = ['app_user', 'api_service', 'reporting', 'migration_user', 'root'];

function errorLog(opts) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 23);
  const scenarios = [
    () => `[ERROR] [MY-010055] [Server] Fatal error: Can't open and lock privilege tables: Table 'mysql.user' doesn't exist`,
    () => `[Warning] [MY-010075] [Server] No existing UUID has been found, so we assume that this is the first time that this server has been started. Generating a new UUID: ${faker.string.uuid()}.`,
    () => `[ERROR] [MY-013130] [InnoDB] Tablespace id ${faker.number.int({ min: 1, max: 999 })}, name: ${faker.helpers.arrayElement(TABLES)}, encryption: N is missing from the tablespace memory cache.`,
    () => `[Warning] [MY-011825] [Xtrabackup] innodb_log_file_size is not equal to innodb_log_file_size in ib_logfile0! ${faker.number.int({ min: 100, max: 500 })}MB != ${faker.number.int({ min: 50, max: 100 })}MB`,
    () => `[ERROR] [MY-013183] [InnoDB] Assertion failure: row0upd.cc:${faker.number.int({ min: 100, max: 9999 })} thread ${faker.number.int({ min: 100, max: 9999 })}`,
    () => `[Warning] [MY-010055] [Server] IP address '${faker.internet.ipv4()}' could not be resolved: Name or service not known`,
    () => `[ERROR] [MY-010119] [Server] Aborting`,
    () => `[Note] [MY-010068] [Server] ${faker.number.int({ min: 1, max: 50 })} connections were still in use when the server shut down`,
    () => `[Warning] [MY-010082] [Server] Insecure configuration for --pid-file: Location '/tmp' in the path is accessible to all OS users. Consider choosing a different directory.`,
    () => `[ERROR] [MY-013129] [InnoDB] Failed to find tablespace for table '${faker.helpers.arrayElement(TABLES)}' in the cache. Attempting to load the tablespace with space id ${faker.number.int({ min: 1, max: 100 })}.`
  ];
  return `${ts} ${faker.helpers.arrayElement(scenarios)()}`;
}

function slowQueryLog(opts) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 23);
  const queryTime = faker.number.float({ min: 2.1, max: 120.0, fractionDigits: 6 });
  const lockTime = faker.number.float({ min: 0.0, max: 1.0, fractionDigits: 6 });
  const rowsSent = faker.number.int({ min: 0, max: 50000 });
  const rowsExamined = faker.number.int({ min: rowsSent, max: rowsSent * 100 + 1 });
  const user = faker.helpers.arrayElement(USERS);
  const host = opts.sourceHost || 'app-server-01';
  const db = 'production';
  const table = faker.helpers.arrayElement(TABLES);
  const op = faker.helpers.arrayElement(OPERATIONS);

  const queries = {
    SELECT: `SELECT * FROM ${table} WHERE created_at > '${new Date(Date.now() - 86400000).toISOString().slice(0, 10)}' AND status IN ('active', 'pending') ORDER BY created_at DESC;`,
    INSERT: `INSERT INTO ${table} (user_id, data, created_at) VALUES (${faker.number.int({ min: 1, max: 99999 })}, '${faker.lorem.words(5)}', NOW());`,
    UPDATE: `UPDATE ${table} SET status='processed', updated_at=NOW() WHERE id IN (SELECT id FROM ${table}_queue WHERE processed=0 LIMIT 1000);`,
    DELETE: `DELETE FROM ${table} WHERE created_at < '${new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)}' LIMIT 10000;`
  };

  return `# Time: ${ts}\n# User@Host: ${user}[${user}] @ ${host} [${faker.internet.ipv4()}]\n# Query_time: ${queryTime}  Lock_time: ${lockTime} Rows_sent: ${rowsSent}  Rows_examined: ${rowsExamined}\nSET timestamp=${Math.floor(Date.now() / 1000)};\n${queries[op]}`;
}

function generalLog(opts) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 23);
  const threadId = faker.number.int({ min: 1, max: 9999 });
  const commands = ['Query', 'Connect', 'Quit', 'Init DB', 'Field List', 'Statistics'];
  const cmd = faker.helpers.arrayElement(commands);
  const user = faker.helpers.arrayElement(USERS);
  const host = faker.internet.ipv4();
  const table = faker.helpers.arrayElement(TABLES);
  const op = faker.helpers.arrayElement(OPERATIONS);
  const queries = [
    `SELECT id, name, email FROM ${table} WHERE active=1 LIMIT 100`,
    `UPDATE ${table} SET last_seen=NOW() WHERE id=${faker.number.int({ min: 1, max: 99999 })}`,
    `INSERT INTO ${table} (col1, col2) VALUES ('val1', 'val2')`,
    `DELETE FROM ${table} WHERE expire_at < NOW()`,
    `SHOW PROCESSLIST`,
    `SHOW GLOBAL STATUS`,
    `SET NAMES utf8mb4`,
    `BEGIN`,
    `COMMIT`,
    `ROLLBACK`
  ];
  const detail = cmd === 'Query'
    ? faker.helpers.arrayElement(queries)
    : cmd === 'Connect'
      ? `${user}@${host} on production`
      : '';
  return `${ts}\t   ${String(threadId).padStart(6)} ${cmd.padEnd(14)} ${detail}`;
}

export function generate(count, opts = {}) {
  const records = [];
  const dist = opts.levelDistribution;
  const errorProb = dist ? (dist.error ?? 0) / ((dist.info ?? 0) + (dist.warn ?? 0) + (dist.error ?? 0) + (dist.debug ?? 0) || 1) : 0.05;
  const slowProb = dist ? (dist.warn ?? 0) / ((dist.info ?? 0) + (dist.warn ?? 0) + (dist.error ?? 0) + (dist.debug ?? 0) || 1) : 0.15;

  for (let i = 0; i < count; i++) {
    const rand = Math.random();
    if (rand < errorProb) {
      records.push(errorLog(opts));
    } else if (rand < errorProb + slowProb) {
      records.push(slowQueryLog(opts));
    } else {
      records.push(generalLog(opts));
    }
  }
  return records;
}
