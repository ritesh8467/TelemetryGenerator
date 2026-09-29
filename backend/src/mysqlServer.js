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
  return [
    ['Uptime',                              s.uptime],
    ['Threads_connected',                   s.threadsConnected],
    ['Threads_running',                     s.threadsRunning],
    ['Connections',                         s.connections],
    ['Aborted_connects',                    s.abortedConnects],
    ['Queries',                             s.queries],
    ['Questions',                           s.queries],
    ['Slow_queries',                        s.slowQueries],
    ['Bytes_received',                      s.bytesReceived],
    ['Bytes_sent',                          s.bytesSent],
    ['Innodb_buffer_pool_reads',            s.bufferPoolReads],
    ['Innodb_buffer_pool_read_requests',    s.bufferPoolReadReqs],
    ['Innodb_buffer_pool_pages_total',      bp],
    ['Innodb_buffer_pool_pages_free',       Math.floor(bp * 0.30)],
    ['Innodb_buffer_pool_pages_dirty',      Math.floor(bp * 0.05)],
    ['Innodb_buffer_pool_bytes_data',       Math.floor(bp * 0.65 * 16384)],
    ['Innodb_data_reads',                   s.innodbDataReads],
    ['Innodb_data_writes',                  s.innodbDataWrites],
    ['Innodb_rows_read',                    s.queries * 10],
    ['Innodb_rows_inserted',                Math.floor(s.queries * 0.10)],
    ['Innodb_rows_updated',                 Math.floor(s.queries * 0.05)],
    ['Innodb_rows_deleted',                 Math.floor(s.queries * 0.02)],
    ['Table_locks_waited',                  s.tableLockWaited],
    ['Table_locks_immediate',               Math.floor(s.queries * 0.90)],
    ['Open_tables',                         Math.min(4000, s.threadsConnected * 5)],
    ['Opened_tables',                       Math.floor(s.queries * 0.01)],
    ['Com_select',                          Math.floor(s.queries * 0.60)],
    ['Com_insert',                          Math.floor(s.queries * 0.10)],
    ['Com_update',                          Math.floor(s.queries * 0.05)],
    ['Com_delete',                          Math.floor(s.queries * 0.02)],
    ['Handler_read_first',                  Math.floor(s.queries * 0.01)],
    ['Handler_read_key',                    s.queries * 5],
    ['Handler_read_next',                   s.queries * 8],
    ['Handler_read_rnd',                    Math.floor(s.queries * 0.50)],
    ['Handler_read_rnd_next',               s.queries * 20],
    ['Created_tmp_disk_tables',             Math.floor(s.queries * 0.001)],
    ['Created_tmp_tables',                  Math.floor(s.queries * 0.01)],
    ['Select_full_join',                    Math.floor(s.queries * 0.0005)],
    ['Select_scan',                         Math.floor(s.queries * 0.05)],
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

function perfSchemaRows() {
  const tables = ['users','orders','products','inventory','sessions','payments'];
  return tables.map(t => [
    'production', t,
    String(Math.floor(Math.random() * 1_000_000)),
    String(Math.floor(Math.random() * 1_000_000)),
    String(Math.floor(Math.random() * 500_000)),
    String(Math.floor(Math.random() * 100_000)),
    String(Math.floor(Math.random() * 1e12)),
    String(Math.floor(Math.random() * 1e12)),
    String(Math.floor(Math.random() * 1e11)),
    String(Math.floor(Math.random() * 1e11)),
  ]);
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

  if (/performance_schema\.table_io_waits/i.test(q))
    return resultset(
      ['object_schema','object_name','count_fetch','count_insert','count_update','count_delete','sum_timer_fetch','sum_timer_insert','sum_timer_update','sum_timer_delete'],
      perfSchemaRows(), seq + 1
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
  server.listen(port, '0.0.0.0', () =>
    console.log(`[mysqlServer] MySQL wire protocol on :${port}`)
  );
  return server;
}

export function stopMysqlServer() {
  server?.close();
  server = null;
}
