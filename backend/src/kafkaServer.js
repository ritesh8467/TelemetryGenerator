import net from 'net';

// ── Mock Kafka topics and consumer groups ────────────────────────────────────
const TOPICS = ['orders', 'payments', 'inventory', 'user-events', 'notifications', 'audit-log', 'dead-letter'];
const CONSUMER_GROUPS = ['analytics-consumers', 'order-processor', 'notification-service', 'audit-writer'];
const NUM_PARTITIONS = 3;
const BROKER_ID = 1;
const BROKER_HOST = 'localhost';
const BROKER_PORT = 9092;
const CLUSTER_ID = 'local-kafka-mock-cluster-1';

// ── Evolving offsets ─────────────────────────────────────────────────────────
const topicOffsets = {};
for (const t of TOPICS) {
  topicOffsets[t] = Array.from({ length: NUM_PARTITIONS }, () =>
    Math.floor(Math.random() * 500_000 + 10_000)
  );
}

const groupOffsets = {};
for (const g of CONSUMER_GROUPS) {
  groupOffsets[g] = {};
  for (const t of TOPICS.slice(0, 4)) {
    groupOffsets[g][t] = topicOffsets[t].map(o => Math.max(0, o - Math.floor(Math.random() * 5000)));
  }
}

setInterval(() => {
  for (const t of TOPICS) {
    for (let i = 0; i < NUM_PARTITIONS; i++) {
      topicOffsets[t][i] += Math.floor(Math.random() * 800 + 100);
    }
  }
  for (const g of CONSUMER_GROUPS) {
    for (const t of Object.keys(groupOffsets[g])) {
      for (let i = 0; i < NUM_PARTITIONS; i++) {
        groupOffsets[g][t][i] += Math.floor(Math.random() * 650 + 80);
      }
    }
  }
}, 5000);

// ── Buffer helpers ────────────────────────────────────────────────────────────
function writeUvarint(buf, offset, val) {
  while (val > 127) {
    buf[offset++] = (val & 0x7f) | 0x80;
    val >>>= 7;
  }
  buf[offset++] = val & 0x7f;
  return offset;
}

function kafkaStrBytes(s) {
  return s === null ? 2 : 2 + Buffer.byteLength(s);
}

class Writer {
  constructor(initial = 256) { this._bufs = []; this._len = 0; this._alloc(initial); }
  _alloc(n) { this._buf = Buffer.alloc(n); this._pos = 0; }
  _ensure(n) { if (this._pos + n > this._buf.length) { this._bufs.push(this._buf.slice(0, this._pos)); this._len += this._pos; this._alloc(Math.max(n, 256)); } }
  i16(v) { this._ensure(2); this._buf.writeInt16BE(v, this._pos); this._pos += 2; return this; }
  i32(v) { this._ensure(4); this._buf.writeInt32BE(v, this._pos); this._pos += 4; return this; }
  i64(v) { this._ensure(8); const b = typeof v === 'bigint' ? v : BigInt(v); this._buf.writeBigInt64BE(b, this._pos); this._pos += 8; return this; }
  str(s) {
    if (s === null) return this.i16(-1);
    const b = Buffer.from(s); this._ensure(2 + b.length);
    this._buf.writeInt16BE(b.length, this._pos); this._pos += 2;
    b.copy(this._buf, this._pos); this._pos += b.length;
    return this;
  }
  uvarint(v) { this._ensure(10); this._pos = writeUvarint(this._buf, this._pos, v); return this; }
  compactStr(s) {
    // compact nullable string: length+1 as uvarint, then bytes
    if (s === null) { this.uvarint(0); return this; }
    const b = Buffer.from(s); this.uvarint(b.length + 1); this._ensure(b.length);
    b.copy(this._buf, this._pos); this._pos += b.length;
    return this;
  }
  taggedFields() { return this.uvarint(0); } // empty tagged fields
  build() {
    this._bufs.push(this._buf.slice(0, this._pos));
    return Buffer.concat(this._bufs);
  }
}

function frame(correlationId, body) {
  const hdr = Buffer.alloc(4 + 4);
  hdr.writeInt32BE(4 + body.length, 0);
  hdr.writeInt32BE(correlationId, 4);
  return Buffer.concat([hdr, body]);
}

class Reader {
  constructor(buf) { this.buf = buf; this.pos = 0; }
  i16() { const v = this.buf.readInt16BE(this.pos); this.pos += 2; return v; }
  i32() { const v = this.buf.readInt32BE(this.pos); this.pos += 4; return v; }
  i64() { const v = this.buf.readBigInt64BE(this.pos); this.pos += 8; return v; }
  str() {
    const len = this.i16();
    if (len < 0) return null;
    const s = this.buf.slice(this.pos, this.pos + len).toString(); this.pos += len; return s;
  }
  skip(n) { this.pos += n; }
  remaining() { return this.buf.length - this.pos; }
}

// ── Response builders ─────────────────────────────────────────────────────────

function apiVersionsResponse(correlationId, requestedVersion) {
  // Supported APIs: key, min, max
  const apis = [
    [18, 0, 3],  // ApiVersions
    [3,  0, 5],  // Metadata
    [16, 0, 2],  // ListGroups
    [15, 0, 3],  // DescribeGroups
    [9,  0, 5],  // OffsetFetch
    [2,  0, 4],  // ListOffsets
    [10, 0, 3],  // FindCoordinator
    [4,  0, 2],  // LeaderAndIsr (just advertise, never called)
    [20, 0, 4],  // DeleteTopics (just advertise)
  ];

  if (requestedVersion >= 3) {
    // Flexible format response: use compact arrays + tagged fields
    const w = new Writer();
    w.i16(0); // error_code
    w.uvarint(apis.length + 1); // compact array length = N+1
    for (const [key, min, max] of apis) {
      w.i16(key).i16(min).i16(max).taggedFields();
    }
    w.i32(0); // throttle_time_ms
    w.taggedFields(); // top-level tagged fields
    return frame(correlationId, w.build());
  }

  // v0/v1/v2: old-style arrays
  const w = new Writer();
  w.i16(0); // error_code
  w.i32(apis.length);
  for (const [key, min, max] of apis) { w.i16(key).i16(min).i16(max); }
  if (requestedVersion >= 1) w.i32(0); // throttle_time_ms
  return frame(correlationId, w.build());
}

function buildMetadataFrame(correlationId) {
  const parts = [];

  function i32(v) { const b = Buffer.alloc(4); b.writeInt32BE(v, 0); return b; }
  function i16(v) { const b = Buffer.alloc(2); b.writeInt16BE(v, 0); return b; }
  function bool(v) { return Buffer.from([v ? 1 : 0]); }
  function kafkaStr(s) {
    if (s === null) return i16(-1);
    const enc = Buffer.from(s);
    return Buffer.concat([i16(enc.length), enc]);
  }

  // response header
  parts.push(i32(correlationId));
  // throttle_time_ms (v1+)
  parts.push(i32(0));

  // brokers: 1
  parts.push(i32(1));
  parts.push(i32(BROKER_ID));
  parts.push(kafkaStr(BROKER_HOST));
  parts.push(i32(BROKER_PORT));
  parts.push(kafkaStr(null)); // rack

  // cluster_id (v2+)
  parts.push(kafkaStr(CLUSTER_ID));

  // controller_id
  parts.push(i32(BROKER_ID));

  // topics
  parts.push(i32(TOPICS.length));
  for (const topic of TOPICS) {
    parts.push(i16(0));          // error_code
    parts.push(kafkaStr(topic));
    parts.push(bool(false));     // is_internal
    // partitions
    parts.push(i32(NUM_PARTITIONS));
    for (let p = 0; p < NUM_PARTITIONS; p++) {
      parts.push(i16(0));        // partition error_code
      parts.push(i32(p));        // partition_index
      parts.push(i32(BROKER_ID)); // leader
      // replicas: [BROKER_ID]
      parts.push(i32(1)); parts.push(i32(BROKER_ID));
      // isr: [BROKER_ID]
      parts.push(i32(1)); parts.push(i32(BROKER_ID));
      // offline_replicas (v5+)
      parts.push(i32(0));
    }
  }

  const body = Buffer.concat(parts);
  const sizeHdr = Buffer.alloc(4); sizeHdr.writeInt32BE(body.length, 0);
  return Buffer.concat([sizeHdr, body]);
}

function buildListGroupsFrame(correlationId) {
  const parts = [];

  function i32(v) { const b = Buffer.alloc(4); b.writeInt32BE(v, 0); return b; }
  function i16(v) { const b = Buffer.alloc(2); b.writeInt16BE(v, 0); return b; }
  function kafkaStr(s) {
    if (s === null) return i16(-1);
    const enc = Buffer.from(s); return Buffer.concat([i16(enc.length), enc]);
  }

  parts.push(i32(correlationId));
  parts.push(i32(0));            // throttle_time_ms
  parts.push(i16(0));            // error_code
  parts.push(i32(CONSUMER_GROUPS.length));
  for (const g of CONSUMER_GROUPS) {
    parts.push(kafkaStr(g));
    parts.push(kafkaStr('consumer'));
  }

  const body = Buffer.concat(parts);
  const sizeHdr = Buffer.alloc(4); sizeHdr.writeInt32BE(body.length, 0);
  return Buffer.concat([sizeHdr, body]);
}

function buildDescribeGroupsFrame(correlationId, groupIds) {
  const parts = [];

  function i32(v) { const b = Buffer.alloc(4); b.writeInt32BE(v, 0); return b; }
  function i16(v) { const b = Buffer.alloc(2); b.writeInt16BE(v, 0); return b; }
  function kafkaStr(s) {
    if (s === null) return i16(-1);
    const enc = Buffer.from(s); return Buffer.concat([i16(enc.length), enc]);
  }
  function i32Bytes(b) { return Buffer.concat([i32(b.length), b]); }

  parts.push(i32(correlationId));
  parts.push(i32(0)); // throttle_time_ms (v1+)
  parts.push(i32(groupIds.length));
  for (const g of groupIds) {
    parts.push(i16(0));            // error_code
    parts.push(kafkaStr(g));
    parts.push(kafkaStr('Stable')); // state
    parts.push(kafkaStr('consumer'));
    parts.push(kafkaStr('range'));
    // 1 member
    parts.push(i32(1));
    parts.push(kafkaStr(`${g}-consumer-1`));
    parts.push(kafkaStr('consumer-client-1'));
    parts.push(kafkaStr('/127.0.0.1'));
    parts.push(i32Bytes(Buffer.alloc(0))); // metadata
    parts.push(i32Bytes(Buffer.alloc(0))); // assignment
  }

  const body = Buffer.concat(parts);
  const sizeHdr = Buffer.alloc(4); sizeHdr.writeInt32BE(body.length, 0);
  return Buffer.concat([sizeHdr, body]);
}

function buildListOffsetsFrame(correlationId, requestedTopics, apiVersion) {
  const parts = [];

  function i32(v) { const b = Buffer.alloc(4); b.writeInt32BE(v, 0); return b; }
  function i16(v) { const b = Buffer.alloc(2); b.writeInt16BE(v, 0); return b; }
  function kafkaStr(s) {
    if (s === null) return i16(-1);
    const enc = Buffer.from(s); return Buffer.concat([i16(enc.length), enc]);
  }
  function i64(v) {
    const b = Buffer.alloc(8);
    const big = typeof v === 'bigint' ? v : BigInt(Math.round(v));
    b.writeBigInt64BE(big, 0); return b;
  }

  parts.push(i32(correlationId));
  if (apiVersion >= 2) parts.push(i32(0)); // throttle_time_ms

  parts.push(i32(requestedTopics.length));
  for (const { topic, partitions } of requestedTopics) {
    parts.push(kafkaStr(topic));
    parts.push(i32(partitions.length));
    for (const { partitionIndex, timestamp } of partitions) {
      const offsets = topicOffsets[topic] || [0, 0, 0];
      const pidx = Math.min(partitionIndex, offsets.length - 1);
      const isEarliest = (typeof timestamp === 'bigint' ? timestamp : BigInt(timestamp)) === -2n;
      const offset = isEarliest ? Math.max(0, offsets[pidx] - 100_000) : offsets[pidx];

      parts.push(i32(partitionIndex));
      parts.push(i16(0)); // error_code
      if (apiVersion >= 1) {
        parts.push(i64(BigInt(Date.now()))); // timestamp (v1+)
      } else {
        // v0: num_offsets(4) + offset(8)
        parts.push(i32(1));
      }
      parts.push(i64(BigInt(offset)));
    }
  }

  const body = Buffer.concat(parts);
  const sizeHdr = Buffer.alloc(4); sizeHdr.writeInt32BE(body.length, 0);
  return Buffer.concat([sizeHdr, body]);
}

function buildOffsetFetchFrame(correlationId, groupId) {
  const parts = [];

  function i32(v) { const b = Buffer.alloc(4); b.writeInt32BE(v, 0); return b; }
  function i16(v) { const b = Buffer.alloc(2); b.writeInt16BE(v, 0); return b; }
  function kafkaStr(s) {
    if (s === null) return i16(-1);
    const enc = Buffer.from(s); return Buffer.concat([i16(enc.length), enc]);
  }
  function i64(v) {
    const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(v), 0); return b;
  }

  parts.push(i32(correlationId));
  parts.push(i32(0)); // throttle_time_ms (v3+)

  const topicsForGroup = groupOffsets[groupId] || {};
  const topicNames = Object.keys(topicsForGroup);

  parts.push(i32(topicNames.length));
  for (const topic of topicNames) {
    const partOffsets = topicsForGroup[topic];
    parts.push(kafkaStr(topic));
    parts.push(i32(partOffsets.length));
    for (let p = 0; p < partOffsets.length; p++) {
      parts.push(i32(p));
      parts.push(i64(partOffsets[p]));
      parts.push(kafkaStr(null)); // metadata
      parts.push(i16(0));         // error_code
    }
  }

  // top-level error_code (v2+)
  parts.push(i16(0));

  const body = Buffer.concat(parts);
  const sizeHdr = Buffer.alloc(4); sizeHdr.writeInt32BE(body.length, 0);
  return Buffer.concat([sizeHdr, body]);
}

function buildFindCoordinatorFrame(correlationId) {
  const parts = [];

  function i32(v) { const b = Buffer.alloc(4); b.writeInt32BE(v, 0); return b; }
  function i16(v) { const b = Buffer.alloc(2); b.writeInt16BE(v, 0); return b; }
  function kafkaStr(s) {
    if (s === null) return i16(-1);
    const enc = Buffer.from(s); return Buffer.concat([i16(enc.length), enc]);
  }

  parts.push(i32(correlationId));
  parts.push(i32(0));    // throttle_time_ms
  parts.push(i16(0));    // error_code
  parts.push(kafkaStr(null)); // error_message
  parts.push(i32(BROKER_ID));
  parts.push(kafkaStr(BROKER_HOST));
  parts.push(i32(BROKER_PORT));

  const body = Buffer.concat(parts);
  const sizeHdr = Buffer.alloc(4); sizeHdr.writeInt32BE(body.length, 0);
  return Buffer.concat([sizeHdr, body]);
}

// ── Message dispatcher ────────────────────────────────────────────────────────

function handleMessage(socket, msg) {
  if (msg.length < 8) return;
  const r = new Reader(msg);

  const apiKey = r.i16();
  const apiVersion = r.i16();
  const correlationId = r.i32();
  const clientIdLen = r.i16();
  if (clientIdLen > 0) r.skip(clientIdLen);
  // For flexible request headers (apiVersion >= flex threshold), there would be
  // tagged fields here. We don't parse them — just dispatch on apiKey.

  try {
    switch (apiKey) {
      case 18: { // ApiVersions
        socket.write(apiVersionsResponse(correlationId, apiVersion));
        break;
      }
      case 3: { // Metadata
        socket.write(buildMetadataFrame(correlationId));
        break;
      }
      case 16: { // ListGroups
        socket.write(buildListGroupsFrame(correlationId));
        break;
      }
      case 15: { // DescribeGroups
        const numGroups = r.i32();
        const groupIds = [];
        for (let i = 0; i < Math.min(numGroups, 20); i++) {
          const g = r.str();
          if (g) groupIds.push(g);
        }
        socket.write(buildDescribeGroupsFrame(correlationId, groupIds.length > 0 ? groupIds : CONSUMER_GROUPS));
        break;
      }
      case 2: { // ListOffsets
        r.i32(); // replica_id
        if (apiVersion >= 2) r.skip(1); // isolation_level byte
        const numTopics = r.i32();
        const reqTopics = [];
        for (let t = 0; t < Math.min(numTopics, 20); t++) {
          const topic = r.str();
          const numParts = r.i32();
          const partitions = [];
          for (let p = 0; p < Math.min(numParts, 50); p++) {
            const partitionIndex = r.i32();
            const timestamp = r.i64();
            partitions.push({ partitionIndex, timestamp });
          }
          if (topic) reqTopics.push({ topic, partitions });
        }
        const topics = reqTopics.length > 0 ? reqTopics : TOPICS.map(t => ({
          topic: t,
          partitions: Array.from({ length: NUM_PARTITIONS }, (_, i) => ({ partitionIndex: i, timestamp: -1n }))
        }));
        socket.write(buildListOffsetsFrame(correlationId, topics, apiVersion));
        break;
      }
      case 9: { // OffsetFetch
        const groupId = r.str();
        socket.write(buildOffsetFetchFrame(correlationId, groupId || CONSUMER_GROUPS[0]));
        break;
      }
      case 10: { // FindCoordinator
        socket.write(buildFindCoordinatorFrame(correlationId));
        break;
      }
      default: {
        // Unknown API: respond with error UNSUPPORTED_VERSION(35)
        const b = Buffer.alloc(4 + 2);
        b.writeInt32BE(correlationId, 0);
        b.writeInt16BE(35, 4);
        const hdr = Buffer.alloc(4); hdr.writeInt32BE(6, 0);
        socket.write(Buffer.concat([hdr, b]));
        break;
      }
    }
  } catch (_) {
    // Malformed request — silently ignore
  }
}

// ── TCP server ────────────────────────────────────────────────────────────────

function handleConnection(socket) {
  let buf = Buffer.alloc(0);
  socket.on('data', data => {
    buf = Buffer.concat([buf, data]);
    while (buf.length >= 4) {
      const msgSize = buf.readInt32BE(0);
      if (msgSize < 4 || msgSize > 10_000_000) { socket.destroy(); return; }
      if (buf.length < 4 + msgSize) break;
      const msg = buf.slice(4, 4 + msgSize);
      buf = buf.slice(4 + msgSize);
      handleMessage(socket, msg);
    }
  });
  socket.on('error', () => {});
}

let _server = null;

export function startKafkaBrokerServer(port = 9092) {
  if (_server) return;
  _server = net.createServer(handleConnection);
  _server.on('error', err => {
    if (err.code === 'EADDRINUSE')
      console.warn(`[kafkaServer] Port ${port} already in use — Kafka mock not started`);
    else
      console.error('[kafkaServer]', err.message);
  });
  _server.listen(port, '0.0.0.0', () =>
    console.log(`[kafkaServer] Kafka mock broker on :${port}`)
  );
}

export function stopKafkaBrokerServer() {
  _server?.close();
  _server = null;
}
