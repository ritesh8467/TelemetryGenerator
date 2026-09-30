import net from 'net';
import crypto from 'crypto';

// ── Evolving state mimicking a live MySQL 8.0 server ────────────────────────
const st = {
  connections:             50_000_000 + Math.floor(Math.random() * 50_000_000),
  queries:                500_000_000 + Math.floor(Math.random() * 500_000_000),
  slowQueries:              Math.floor(Math.random() * 10_000),
  bytesReceived:     10_000_000_000 + Math.floor(Math.random() * 10_000_000_000),
  bytesSent:         50_000_000_000 + Math.floor(Math.random() * 50_000_000_000),
  bufferPoolReads:           Math.floor(Math.random() * 1_000_000),
  bufferPoolReadReqs:  5_000_000_000 + Math.floor(Math.random() * 5_000_000_000),
  innodbDataReads:           Math.floor(Math.random() * 50_000_000),
  innodbDataWrites:          Math.floor(Math.random() * 25_000_000),
  abortedConnects:           Math.floor(Math.random() * 500),
  tableLockWaited:           Math.floor(Math.random() * 5_000),
  uptime:              86_400 + Math.floor(Math.random() * 2_592_000),
  threadsConnected:   50,
  threadsRunning:      5,
};

setInterval(() => {
  st.connections      += Math.floor(Math.random() * 5);
  st.queries          += Math.floor(Math.random() * 500);
  if (Math.random() < 0.02) st.slowQueries++;
  st.bytesReceived    += Math.floor(Math.random() * 500_000);
  st.bytesSent        += Math.floor(Math.random() * 2_000_000);
  st.bufferPoolReadReqs += Math.floor(Math.random() * 10_000);
  if (Math.random() < 0.1) st.bufferPoolReads += Math.floor(Math.random() * 10);
  st.uptime++;
  st.threadsConnected  = Math.max(5,  Math.min(200, st.threadsConnected + Math.floor(Math.random() * 6) - 3));
  st.threadsRunning    = Math.max(1,  Math.min(st.threadsConnected, st.threadsRunning + Math.floor(Math.random() * 4) - 2));
}, 1000);

// ── Protocol primitives ──────────────────────────────────────────────────────
const LE2 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const LE4 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };

function lenenc(n) {
  if (n < 0xfb) return Buffer.from([n]);
  if (n < 0x10000) { const b = Buffer.alloc(3); b[0] = 0xfc; b.writeUInt16LE(n, 1); return b; }
  const b = Buffer.alloc(4); b[0] = 0xfd; b.writeUIntLE(n, 1, 3); return b;
}

function les(s) {
  if (s == null) return Buffer.from([0xfb]);
  const b = Buffer.from(String(s), 'utf8');
  return Buffer.concat([lenenc(b.length), b]);
}

function pkt(payload, seq) {
  const h = Buffer.alloc(4);
  h.writeUIntLE(payload.length, 0, 3);
  h[3] = seq & 0xff;
  return Buffer.concat([h, payload]);
}

function okPkt(seq) {
  return pkt(Buffer.concat([
    Buffer.from([0x00]),     // OK
    Buffer.from([0x00]),     // affected rows
    Buffer.from([0x00]),     // last insert id
    LE2(0x0002),             // SERVER_STATUS_AUTOCOMMIT
    LE2(0x0000),             // warnings
  ]), seq);
}

function eofPkt(seq) {
  return pkt(Buffer.from([0xfe, 0x00, 0x00, 0x02, 0x00]), seq);
}

function colDef(name, seq, type = 0xfd) {
  return pkt(Buffer.concat([
    les('def'), les(''), les(''), les(''),
    les(name), les(name),
    Buffer.from([0x0c]),          // fixed-length fields
    LE2(0x21),                    // charset: utf8_general_ci
    LE4(0x0400),                  // column length
    Buffer.from([type]),          // column type: VAR_STRING
    LE2(0x0000),                  // flags
    Buffer.from([0x00, 0x00, 0x00]), // decimals + filler
  ]), seq);
}

function resultset(cols, rows, startSeq) {
  const bufs = [];
  let s = startSeq;
  bufs.push(pkt(lenenc(cols.length), s++));
  for (const c of cols) bufs.push(colDef(c, s++));
  bufs.push(eofPkt(s++));
  for (const row of rows) {
    bufs.push(pkt(Buffer.concat(row.map(v => les(v))), s++));
  }
  bufs.push(eofPkt(s++));
  return Buffer.concat(bufs);
}

// ── Query data ───────────────────────────────────────────────────────────────
function globalStatusRows() {
  const s = st;
  const bp = 65536;
  const q  = s.queries;
  return [
    // Uptime / connections
    ['Uptime',                                      s.uptime],
    ['Threads_connected',                           s.threadsConnected],
    ['Threads_running',                             s.threadsRunning],
    ['Threads_cached',                              Math.max(0, 100 - s.threadsConnected)],
    ['Threads_created',                             s.connections],
    ['Connections',                                 s.connections],
    ['Aborted_clients',                             Math.floor(s.abortedConnects * 0.1)],
    ['Aborted_connects',                            s.abortedConnects],
    ['Locked_connects',                             Math.floor(s.abortedConnects * 0.05)],
    ['Connection_errors_accept',                    0],
    ['Connection_errors_internal',                  Math.floor(s.abortedConnects * 0.01)],
    ['Connection_errors_max_connections',           Math.floor(s.abortedConnects * 0.20)],
    ['Connection_errors_peer_address',              0],
    ['Connection_errors_select',                    0],
    ['Connection_errors_tcpwrap',                   0],
    // Queries / statements
    ['Queries',                                     q],
    ['Questions',                                   q],
    ['Slow_queries',                                s.slowQueries],
    ['Bytes_received',                              s.bytesReceived],
    ['Bytes_sent',                                  s.bytesSent],
    // Commands
    ['Com_select',                                  Math.floor(q * 0.60)],
    ['Com_insert',                                  Math.floor(q * 0.10)],
    ['Com_update',                                  Math.floor(q * 0.05)],
    ['Com_delete',                                  Math.floor(q * 0.02)],
    ['Com_stmt_execute',                            Math.floor(q * 0.08)],
    ['Com_stmt_close',                              Math.floor(q * 0.08)],
    ['Com_stmt_fetch',                              Math.floor(q * 0.01)],
    ['Com_stmt_prepare',                            Math.floor(q * 0.08)],
    ['Com_stmt_reset',                              Math.floor(q * 0.001)],
    ['Com_stmt_send_long_data',                     0],
    // Buffer pool
    ['Innodb_buffer_pool_reads',                    s.bufferPoolReads],
    ['Innodb_buffer_pool_read_requests',            s.bufferPoolReadReqs],
    ['Innodb_buffer_pool_read_ahead',               Math.floor(s.bufferPoolReadReqs * 0.001)],
    ['Innodb_buffer_pool_read_ahead_evicted',       0],
    ['Innodb_buffer_pool_read_ahead_rnd',           0],
    ['Innodb_buffer_pool_write_requests',           Math.floor(q * 0.15)],
    ['Innodb_buffer_pool_pages_flushed',            Math.floor(q * 0.05)],
    ['Innodb_buffer_pool_pages_total',              bp],
    ['Innodb_buffer_pool_pages_free',               Math.floor(bp * 0.30)],
    ['Innodb_buffer_pool_pages_dirty',              Math.floor(bp * 0.05)],
    ['Innodb_buffer_pool_pages_data',               Math.floor(bp * 0.65)],
    ['Innodb_buffer_pool_bytes_data',               Math.floor(bp * 0.65 * 16384)],
    ['Innodb_buffer_pool_bytes_dirty',              Math.floor(bp * 0.05 * 16384)],
    // Double writes
    ['Innodb_dblwr_pages_written',                  Math.floor(q * 0.05)],
    ['Innodb_dblwr_writes',                         Math.floor(q * 0.01)],
    // Data operations
    ['Innodb_data_reads',                           s.innodbDataReads],
    ['Innodb_data_writes',                          s.innodbDataWrites],
    ['Innodb_data_fsyncs',                          Math.floor(q * 0.02)],
    ['Innodb_data_read',                            s.bytesReceived],
    ['Innodb_data_written',                         s.bytesSent],
    // Log operations
    ['Innodb_log_waits',                            Math.floor(q * 0.0001)],
    ['Innodb_log_write_requests',                   Math.floor(q * 0.30)],
    ['Innodb_log_writes',                           Math.floor(q * 0.15)],
    // Page operations
    ['Innodb_pages_created',                        Math.floor(q * 0.001)],
    ['Innodb_pages_read',                           s.innodbDataReads],
    ['Innodb_pages_written',                        s.innodbDataWrites],
    // Row locks
    ['Innodb_row_lock_time',                        Math.floor(q * 0.1)],
    ['Innodb_row_lock_time_avg',                    5],
    ['Innodb_row_lock_time_max',                    500],
    ['Innodb_row_lock_waits',                       Math.floor(q * 0.0002)],
    // Row operations
    ['Innodb_rows_read',                            q * 10],
    ['Innodb_rows_inserted',                        Math.floor(q * 0.10)],
    ['Innodb_rows_updated',                         Math.floor(q * 0.05)],
    ['Innodb_rows_deleted',                         Math.floor(q * 0.02)],
    // Handlers
    ['Handler_commit',                              Math.floor(q * 0.20)],
    ['Handler_delete',                              Math.floor(q * 0.02)],
    ['Handler_discover',                            0],
    ['Handler_external_lock',                       Math.floor(q * 0.40)],
    ['Handler_mrr_init',                            0],
    ['Handler_prepare',                             Math.floor(q * 0.08)],
    ['Handler_read_first',                          Math.floor(q * 0.01)],
    ['Handler_read_key',                            q * 5],
    ['Handler_read_last',                           Math.floor(q * 0.001)],
    ['Handler_read_next',                           q * 8],
    ['Handler_read_prev',                           Math.floor(q * 0.001)],
    ['Handler_read_rnd',                            Math.floor(q * 0.50)],
    ['Handler_read_rnd_next',                       q * 20],
    ['Handler_rollback',                            Math.floor(q * 0.001)],
    ['Handler_savepoint',                           Math.floor(q * 0.001)],
    ['Handler_savepoint_rollback',                  0],
    ['Handler_update',                              Math.floor(q * 0.05)],
    ['Handler_write',                               Math.floor(q * 0.10)],
    // Locks / tables
    ['Table_locks_waited',                          s.tableLockWaited],
    ['Table_locks_immediate',                       Math.floor(q * 0.90)],
    ['Open_tables',                                 Math.min(4000, s.threadsConnected * 5)],
    ['Opened_tables',                               Math.floor(q * 0.01)],
    ['Opened_files',                                Math.floor(q * 0.001)],
    ['Opened_table_definitions',                    Math.floor(q * 0.005)],
    // Sorts
    ['Sort_merge_passes',                           Math.floor(q * 0.0001)],
    ['Sort_range',                                  Math.floor(q * 0.10)],
    ['Sort_rows',                                   Math.floor(q * 5)],
    ['Sort_scan',                                   Math.floor(q * 0.05)],
    // Temp tables
    ['Created_tmp_disk_tables',                     Math.floor(q * 0.001)],
    ['Created_tmp_tables',                          Math.floor(q * 0.01)],
    ['Select_full_join',                            Math.floor(q * 0.0005)],
    ['Select_scan',                                 Math.floor(q * 0.05)],
    // Mysqlx
    ['Mysqlx_connections_accepted',                 Math.floor(s.connections * 0.01)],
    ['Mysqlx_connections_closed',                   Math.floor(s.connections * 0.01)],
    ['Mysqlx_connections_rejected',                 0],
  ].map(([k, v]) => [k, String(v)]);
}

function globalVarRows() {
  return [
    ['innodb_buffer_pool_size',      String(128 * 1024 * 1024)],
    ['innodb_buffer_pool_instances', '1'],
    ['innodb_log_file_size',         String(50 * 1024 * 1024)],
    ['innodb_flush_log_at_trx_commit','1'],
    ['max_connections',              '151'],
    ['max_allowed_packet',           '67108864'],
    ['thread_cache_size',            '9'],
    ['table_open_cache',             '4000'],
    ['sync_binlog',                  '1'],
    ['character_set_server',         'utf8mb4'],
    ['collation_server',             'utf8mb4_unicode_ci'],
    ['version',                      '8.0.35'],
    ['version_comment',              'MySQL Community Server - GPL'],
    ['innodb_file_per_table',        'ON'],
    ['slow_query_log',               'ON'],
    ['long_query_time',              '2.000000'],
  ];
}

const PERF_TABLES = ['users','orders','products','inventory','sessions','payments'];
const PERF_INDEXES = ['PRIMARY','idx_created_at','idx_status','idx_user_id','idx_email'];

function perfSchemaTableRows() {
  // column order matches receiver query: count_delete,count_fetch,count_insert,count_update,
  // sum_timer_delete,sum_timer_fetch,sum_timer_insert,sum_timer_update
  return PERF_TABLES.map(t => [
    'production', t,
    String(Math.floor(Math.random() * 100_000)),   // count_delete
    String(Math.floor(Math.random() * 1_000_000)), // count_fetch
    String(Math.floor(Math.random() * 1_000_000)), // count_insert
    String(Math.floor(Math.random() * 500_000)),   // count_update
    String(Math.floor(Math.random() * 1e11)),      // sum_timer_delete
    String(Math.floor(Math.random() * 1e12)),      // sum_timer_fetch
    String(Math.floor(Math.random() * 1e12)),      // sum_timer_insert
    String(Math.floor(Math.random() * 1e11)),      // sum_timer_update
  ]);
}

function perfSchemaLockRows() {
  return PERF_TABLES.map(t => [
    'production', t,
    String(Math.floor(Math.random() * 10_000)),  // count_read_normal
    String(Math.floor(Math.random() * 1_000)),   // count_read_with_shared_locks
    String(Math.floor(Math.random() * 500)),     // count_read_high_priority
    String(Math.floor(Math.random() * 200)),     // count_read_no_insert
    String(Math.floor(Math.random() * 100)),     // count_read_external
    String(Math.floor(Math.random() * 5_000)),   // count_write_allow_write
    String(Math.floor(Math.random() * 2_000)),   // count_write_concurrent_insert
    String(Math.floor(Math.random() * 500)),     // count_write_low_priority
    String(Math.floor(Math.random() * 5_000)),   // count_write_normal
    String(Math.floor(Math.random() * 100)),     // count_write_external
    String(Math.floor(Math.random() * 5e10)),    // sum_timer_read_normal
    String(Math.floor(Math.random() * 1e10)),    // sum_timer_read_with_shared_locks
    String(Math.floor(Math.random() * 5e9)),     // sum_timer_read_high_priority
    String(Math.floor(Math.random() * 2e9)),     // sum_timer_read_no_insert
    String(Math.floor(Math.random() * 1e9)),     // sum_timer_read_external
    String(Math.floor(Math.random() * 2e10)),    // sum_timer_write_allow_write
    String(Math.floor(Math.random() * 1e10)),    // sum_timer_write_concurrent_insert
    String(Math.floor(Math.random() * 5e9)),     // sum_timer_write_low_priority
    String(Math.floor(Math.random() * 2e10)),    // sum_timer_write_normal
    String(Math.floor(Math.random() * 1e9)),     // sum_timer_write_external
  ]);
}

function infoSchemaTableRows() {
  const tables = [
    ['production', 'users',     150000, 150, 22500000, 8000000],
    ['production', 'orders',    500000, 200, 100000000, 30000000],
    ['production', 'products',   50000, 300, 15000000, 5000000],
    ['production', 'inventory', 200000, 100, 20000000, 8000000],
    ['production', 'sessions',  800000,  80, 64000000, 10000000],
    ['production', 'payments',  400000, 250, 100000000, 20000000],
  ];
  return tables.map(([schema, name, rows, avgLen, dataLen, idxLen]) => [
    schema, name, String(rows), String(avgLen), String(dataLen), String(idxLen),
  ]);
}

function perfSchemaIndexRows() {
  const rows = [];
  for (const t of PERF_TABLES) {
    for (const idx of PERF_INDEXES.slice(0, 3)) {
      rows.push([
        'production', t, idx,
        String(Math.floor(Math.random() * 500_000)),
        String(Math.floor(Math.random() * 100_000)),
        String(Math.floor(Math.random() * 50_000)),
        String(Math.floor(Math.random() * 10_000)),
        String(Math.floor(Math.random() * 5e11)),
        String(Math.floor(Math.random() * 1e11)),
        String(Math.floor(Math.random() * 5e10)),
        String(Math.floor(Math.random() * 1e10)),
      ]);
    }
  }
  return rows;
}

// ── Query dispatcher ─────────────────────────────────────────────────────────
function respond(sql, seq) {
  const q = sql.trim();

  if (/^(SET\b|USE\b|BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION|RESET\b)/i.test(q))
    return okPkt(seq + 1);

  if (/^SHOW\s+GLOBAL\s+STATUS/i.test(q))
    return resultset(['Variable_name', 'Value'], globalStatusRows(), seq + 1);

  if (/^SHOW\s+GLOBAL\s+VARIABLES/i.test(q))
    return resultset(['Variable_name', 'Value'], globalVarRows(), seq + 1);

  if (/^SHOW\s+(SLAVE|REPLICA)\s+STATUS/i.test(q))
    return resultset(['Slave_IO_Running', 'Slave_SQL_Running'], [], seq + 1);

  if (/^SHOW\s+BINARY\s+LOGS/i.test(q))
    return resultset(['Log_name', 'File_size'], [['mysql-bin.000001', '154']], seq + 1);

  // innodb_metrics buffer pool size (receiver queries QueryRow — must return 1 row)
  if (/innodb_metrics.*buffer_pool_size/i.test(q))
    return resultset(['name','count'], [['buffer_pool_size', String(128 * 1024 * 1024)]], seq + 1);

  // table_io_waits: receiver selects COUNT_DELETE,COUNT_FETCH,COUNT_INSERT,COUNT_UPDATE order
  if (/performance_schema\.table_io_waits_summary_by_index/i.test(q))
    return resultset(
      ['object_schema','object_name','index_name','count_fetch','count_insert','count_update','count_delete','sum_timer_fetch','sum_timer_insert','sum_timer_update','sum_timer_delete'],
      perfSchemaIndexRows(), seq + 1
    );

  if (/performance_schema\.table_io_waits/i.test(q))
    return resultset(
      ['object_schema','object_name','count_delete','count_fetch','count_insert','count_update','sum_timer_delete','sum_timer_fetch','sum_timer_insert','sum_timer_update'],
      perfSchemaTableRows(), seq + 1
    );

  // table_lock_waits: 22 columns (12 counts + 10 timer floors)
  if (/performance_schema\.table_lock_waits/i.test(q))
    return resultset(
      ['object_schema','object_name',
       'count_read_normal','count_read_with_shared_locks','count_read_high_priority','count_read_no_insert','count_read_external',
       'count_write_allow_write','count_write_concurrent_insert','count_write_low_priority','count_write_normal','count_write_external',
       'sum_timer_read_normal','sum_timer_read_with_shared_locks','sum_timer_read_high_priority','sum_timer_read_no_insert','sum_timer_read_external',
       'sum_timer_write_allow_write','sum_timer_write_concurrent_insert','sum_timer_write_low_priority','sum_timer_write_normal','sum_timer_write_external'],
      perfSchemaLockRows(), seq + 1
    );

  // information_schema.TABLES: 6 columns
  if (/information_schema\.TABLES/i.test(q))
    return resultset(
      ['table_schema','table_name','table_rows','avg_row_length','data_length','index_length'],
      infoSchemaTableRows(), seq + 1
    );

  // events_statements_summary: 14 columns
  if (/events_statements_summary_by_digest/i.test(q))
    return resultset(
      ['schema_name','digest','digest_text','sum_timer_wait','sum_errors','sum_warnings',
       'sum_rows_affected','sum_rows_sent','sum_rows_examined','sum_created_tmp_disk_tables',
       'sum_created_tmp_tables','sum_sort_merge_passes','sum_sort_rows','sum_no_index_used'],
      [], seq + 1
    );

  if (/performance_schema|information_schema/i.test(q))
    return resultset(['result'], [], seq + 1);

  const varMatch = q.match(/SELECT\s+@@(\w+)/i);
  if (varMatch) {
    const name = varMatch[1].toLowerCase();
    const vals = { version: '8.0.35', version_comment: 'MySQL Community Server - GPL',
                   max_allowed_packet: '67108864', autocommit: '1',
                   character_set_client: 'utf8mb4', character_set_connection: 'utf8mb4',
                   global: { max_allowed_packet: '67108864' } };
    return resultset([`@@${varMatch[1]}`], [[vals[name] ?? '']], seq + 1);
  }

  if (/^SELECT\s+1/i.test(q)) return resultset(['1'], [['1']], seq + 1);
  if (/^(SELECT|SHOW)/i.test(q)) return resultset(['result'], [], seq + 1);
  return okPkt(seq + 1);
}

// ── Connection handler ───────────────────────────────────────────────────────
let connCounter = 0;

// SERVER_CAPS: LONG_PASSWORD | FOUND_ROWS | LONG_FLAG | CONNECT_WITH_DB |
//              PROTOCOL_41 | TRANSACTIONS | SECURE_CONNECTION | PLUGIN_AUTH
const SERVER_CAPS = 0x0001 | 0x0002 | 0x0004 | 0x0008 | 0x0200 | 0x2000 | 0x8000 | 0x80000;

function handleConn(sock) {
  sock.setNoDelay(true);
  const connId = ++connCounter;
  const authSalt = crypto.randomBytes(20);
  let phase = 'auth';
  let buf = Buffer.alloc(0);

  // Send server greeting (seq 0)
  sock.write(pkt(Buffer.concat([
    Buffer.from([0x0a]),                          // protocol v10
    Buffer.from('8.0.35\0', 'utf8'),             // server version
    LE4(connId),                                  // connection id
    authSalt.slice(0, 8),                         // auth-data part 1
    Buffer.from([0x00]),                          // filler
    LE2(SERVER_CAPS & 0xffff),                   // caps lower
    Buffer.from([0x21]),                          // charset utf8
    LE2(0x0002),                                  // status autocommit
    LE2((SERVER_CAPS >> 16) & 0xffff),          // caps upper
    Buffer.from([0x15]),                          // auth-data length = 21
    Buffer.alloc(10),                             // reserved
    authSalt.slice(8),                            // auth-data part 2 (12 bytes)
    Buffer.from([0x00]),                          // null term
    Buffer.from('mysql_native_password\0'),      // auth plugin
  ]), 0));

  sock.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);

    while (buf.length >= 4) {
      const pktLen = buf.readUIntLE(0, 3);
      if (buf.length < 4 + pktLen) break;

      const seq     = buf[3];
      const payload = buf.slice(4, 4 + pktLen);
      buf = buf.slice(4 + pktLen);

      if (phase === 'auth') {
        // Accept any credentials unconditionally
        phase = 'command';
        sock.write(okPkt(seq + 1));
        continue;
      }

      const cmd = payload[0];
      if      (cmd === 0x03) sock.write(respond(payload.slice(1).toString('utf8'), seq));
      else if (cmd === 0x01) sock.end();
      else if (cmd === 0x0e) sock.write(okPkt(seq + 1));  // COM_PING
      else if (cmd === 0x02) sock.write(okPkt(seq + 1));  // COM_INIT_DB
      else                   sock.write(okPkt(seq + 1));
    }
  });

  sock.on('error', () => {});
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
let server = null;

export function startMysqlServer(port = 3306) {
  if (server) return;
  server = net.createServer(handleConn);
  server.on('error', err => {
    if (err.code === 'EADDRINUSE') console.warn(`[mysqlServer] port ${port} already in use — not started`);
    else console.error('[mysqlServer] error:', err.message);
  });
  server.listen(port, '::', () =>
    console.log(`[mysqlServer] MySQL wire protocol on :${port}`)
  );
  return server;
}

export function stopMysqlServer() {
  server?.close();
  server = null;
}
