import http from 'http';

// ── Evolving Kafka state ─────────────────────────────────────────────────────
const kafkaState = {
  messagesIn:      100_000_000 + Math.floor(Math.random() * 100_000_000),
  bytesIn:      10_000_000_000 + Math.floor(Math.random() * 10_000_000_000),
  bytesOut:     50_000_000_000 + Math.floor(Math.random() * 50_000_000_000),
  requestsTotal:  500_000_000 + Math.floor(Math.random() * 500_000_000),
  fetchRequests:  300_000_000 + Math.floor(Math.random() * 300_000_000),
  produceRequests: 50_000_000 + Math.floor(Math.random() * 50_000_000),
  underReplicated:  0,
  partitionCount: 120 + Math.floor(Math.random() * 380),
  leaderCount:     60 + Math.floor(Math.random() * 190),
  logSize:     5_000_000_000 + Math.floor(Math.random() * 5_000_000_000),
  idlePercent: 0.65 + Math.random() * 0.30,
};

setInterval(() => {
  kafkaState.messagesIn    += Math.floor(Math.random() * 10000);
  kafkaState.bytesIn       += Math.floor(Math.random() * 5_000_000);
  kafkaState.bytesOut      += Math.floor(Math.random() * 20_000_000);
  kafkaState.requestsTotal += Math.floor(Math.random() * 500);
  kafkaState.fetchRequests += Math.floor(Math.random() * 300);
  kafkaState.produceRequests += Math.floor(Math.random() * 50);
  kafkaState.logSize       += Math.floor(Math.random() * 100_000);
  kafkaState.underReplicated = Math.random() < 0.02 ? Math.floor(Math.random() * 4) : Math.max(0, kafkaState.underReplicated - 1);
  kafkaState.idlePercent = Math.max(0.3, Math.min(0.99, kafkaState.idlePercent + (Math.random() * 0.04 - 0.02)));
}, 1000);

function kafkaMetrics() {
  const k = kafkaState;
  const topics = ['orders', 'payments', 'inventory', 'user-events', 'notifications'];
  const lines = [
    '# HELP kafka_brokers Number of brokers in the Kafka cluster',
    '# TYPE kafka_brokers gauge',
    'kafka_brokers 1',
    '# HELP kafka_controller_kafkacontroller_activecontrollercount Number of active controllers',
    '# TYPE kafka_controller_kafkacontroller_activecontrollercount gauge',
    'kafka_controller_kafkacontroller_activecontrollercount 1',
    '# HELP kafka_controller_kafkacontroller_offlinepartitionscount Number of offline partitions',
    '# TYPE kafka_controller_kafkacontroller_offlinepartitionscount gauge',
    'kafka_controller_kafkacontroller_offlinepartitionscount 0',
    '# HELP kafka_server_replicamanager_underreplicatedpartitions Number of under-replicated partitions',
    '# TYPE kafka_server_replicamanager_underreplicatedpartitions gauge',
    `kafka_server_replicamanager_underreplicatedpartitions ${k.underReplicated}`,
    '# HELP kafka_server_replicamanager_partitioncount Number of partitions on this broker',
    '# TYPE kafka_server_replicamanager_partitioncount gauge',
    `kafka_server_replicamanager_partitioncount ${k.partitionCount}`,
    '# HELP kafka_server_replicamanager_leadercount Number of leader partitions on this broker',
    '# TYPE kafka_server_replicamanager_leadercount gauge',
    `kafka_server_replicamanager_leadercount ${k.leaderCount}`,
    '# HELP kafka_server_kafkarequesthandlerpool_requesthandleravgidlepercent Average fraction of time the request handler threads are idle',
    '# TYPE kafka_server_kafkarequesthandlerpool_requesthandleravgidlepercent gauge',
    `kafka_server_kafkarequesthandlerpool_requesthandleravgidlepercent ${k.idlePercent.toFixed(4)}`,
    '# HELP kafka_network_requestmetrics_requests_total Total requests received',
    '# TYPE kafka_network_requestmetrics_requests_total counter',
    `kafka_network_requestmetrics_requests_total{request="Produce"} ${k.produceRequests}`,
    `kafka_network_requestmetrics_requests_total{request="FetchConsumer"} ${k.fetchRequests}`,
    `kafka_network_requestmetrics_requests_total{request="Metadata"} ${Math.floor(k.requestsTotal * 0.05)}`,
    '# HELP kafka_server_brokertopicmetrics_messagesin_total Total messages in per topic',
    '# TYPE kafka_server_brokertopicmetrics_messagesin_total counter',
    ...topics.map(t => `kafka_server_brokertopicmetrics_messagesin_total{topic="${t}"} ${Math.floor(k.messagesIn / topics.length)}`),
    '# HELP kafka_server_brokertopicmetrics_bytesin_total Total bytes in per topic',
    '# TYPE kafka_server_brokertopicmetrics_bytesin_total counter',
    ...topics.map(t => `kafka_server_brokertopicmetrics_bytesin_total{topic="${t}"} ${Math.floor(k.bytesIn / topics.length)}`),
    '# HELP kafka_server_brokertopicmetrics_bytesout_total Total bytes out per topic',
    '# TYPE kafka_server_brokertopicmetrics_bytesout_total counter',
    ...topics.map(t => `kafka_server_brokertopicmetrics_bytesout_total{topic="${t}"} ${Math.floor(k.bytesOut / topics.length)}`),
    '# HELP kafka_log_log_size Total log size per topic-partition',
    '# TYPE kafka_log_log_size gauge',
    ...topics.map(t => `kafka_log_log_size{topic="${t}",partition="0"} ${Math.floor(k.logSize / topics.length)}`),
  ];
  return lines.join('\n') + '\n';
}

// ── Evolving Docker state ────────────────────────────────────────────────────
const dockerState = {
  running:  8 + Math.floor(Math.random() * 12),
  stopped:  Math.floor(Math.random() * 3),
  paused:   0,
  images:  15 + Math.floor(Math.random() * 35),
  goroutines: 80 + Math.floor(Math.random() * 80),
  cpuUsage: {} ,
  memUsage: {},
};

const DOCKER_CONTAINERS = [
  { name: 'web-server',     image: 'nginx:1.25',       memLimit: 256 },
  { name: 'api-gateway',    image: 'node:20-alpine',   memLimit: 512 },
  { name: 'cache-layer',    image: 'redis:7.2',        memLimit: 128 },
  { name: 'db-primary',     image: 'postgres:16',      memLimit: 1024 },
  { name: 'queue-worker',   image: 'rabbitmq:3.12',    memLimit: 256 },
  { name: 'auth-service',   image: 'python:3.12-slim', memLimit: 256 },
  { name: 'metrics-collector', image: 'prom/prometheus:v2.48', memLimit: 512 },
  { name: 'log-aggregator', image: 'grafana/grafana:10.2', memLimit: 512 },
];

const DOCKER_NUM_CPUS = 4;
// Stable container IDs (fixed hex derived from name)
const dockerContainerIds = {};
for (const c of DOCKER_CONTAINERS) {
  const h = Buffer.from(c.name).toString('hex');
  dockerContainerIds[c.name] = (h + '0'.repeat(64)).slice(0, 64);
}

// Seed initial per-container state
for (const c of DOCKER_CONTAINERS) {
  dockerState.cpuUsage[c.name] = Math.random() * 100;
  dockerState.memUsage[c.name] = Math.floor(c.memLimit * 1024 * 1024 * (0.2 + Math.random() * 0.6));
}

// Per-container CPU nanosecond counters for Docker API /stats responses
const dockerCpuNs = {};
const dockerPrevCpuNs = {};
const dockerNetStats = {};
for (const c of DOCKER_CONTAINERS) {
  dockerCpuNs[c.name]     = Math.floor(Math.random() * 1e13) + 1e12;
  dockerPrevCpuNs[c.name] = dockerCpuNs[c.name] - Math.floor(0.05 * 1e9);
  dockerNetStats[c.name]  = {
    rxBytes: Math.floor(Math.random() * 1e9), txBytes: Math.floor(Math.random() * 5e8),
    rxPkts:  Math.floor(Math.random() * 1e7), txPkts:  Math.floor(Math.random() * 5e6),
  };
}

// System CPU ns counter (increments by DOCKER_NUM_CPUS * 1e9 each second)
let dockerSysCpuNs    = Math.floor(Math.random() * 1e15) + 1e14;
let dockerPrevSysCpuNs = dockerSysCpuNs - DOCKER_NUM_CPUS * 1_000_000_000;

setInterval(() => {
  dockerState.running = Math.max(3, Math.min(30, dockerState.running + Math.floor(Math.random() * 2) - 1));
  dockerState.goroutines = Math.max(50, Math.min(300, dockerState.goroutines + Math.floor(Math.random() * 10) - 5));
  dockerPrevSysCpuNs = dockerSysCpuNs;
  dockerSysCpuNs += DOCKER_NUM_CPUS * 1_000_000_000;
  for (const c of DOCKER_CONTAINERS) {
    dockerState.cpuUsage[c.name] = Math.max(0, Math.min(100, dockerState.cpuUsage[c.name] + (Math.random() * 10 - 5)));
    const limitBytes = c.memLimit * 1024 * 1024;
    dockerState.memUsage[c.name] = Math.max(16 * 1024 * 1024, Math.min(limitBytes - 1, dockerState.memUsage[c.name] + Math.floor(Math.random() * 4_000_000) - 2_000_000));
    dockerPrevCpuNs[c.name] = dockerCpuNs[c.name];
    dockerCpuNs[c.name] += Math.round((dockerState.cpuUsage[c.name] / 100) * 1_000_000_000);
    const n = dockerNetStats[c.name];
    n.rxBytes += Math.floor(Math.random() * 50_000);
    n.txBytes += Math.floor(Math.random() * 20_000);
    n.rxPkts  += Math.floor(Math.random() * 50);
    n.txPkts  += Math.floor(Math.random() * 20);
  }
}, 1000);

function dockerMetrics() {
  const d = dockerState;
  const lines = [
    '# HELP engine_daemon_container_states_containers Number of containers in various states',
    '# TYPE engine_daemon_container_states_containers gauge',
    `engine_daemon_container_states_containers{state="running"} ${d.running}`,
    `engine_daemon_container_states_containers{state="stopped"} ${d.stopped}`,
    `engine_daemon_container_states_containers{state="paused"} ${d.paused}`,
    '# HELP engine_daemon_images_total Total number of images stored',
    '# TYPE engine_daemon_images_total gauge',
    `engine_daemon_images_total ${d.images}`,
    '# HELP engine_daemon_goroutines Number of goroutines that currently exist',
    '# TYPE engine_daemon_goroutines gauge',
    `engine_daemon_goroutines ${d.goroutines}`,
    '# HELP container_cpu_usage_seconds_total Cumulative CPU time consumed',
    '# TYPE container_cpu_usage_seconds_total counter',
  ];
  for (const c of DOCKER_CONTAINERS) {
    lines.push(`container_cpu_usage_seconds_total{container_name="${c.name}",image="${c.image}"} ${(d.cpuUsage[c.name] * 100).toFixed(6)}`);
  }
  lines.push(
    '# HELP container_memory_usage_bytes Current memory usage',
    '# TYPE container_memory_usage_bytes gauge'
  );
  for (const c of DOCKER_CONTAINERS) {
    lines.push(`container_memory_usage_bytes{container_name="${c.name}",image="${c.image}"} ${d.memUsage[c.name]}`);
  }
  lines.push(
    '# HELP container_memory_limit_bytes Memory limit per container',
    '# TYPE container_memory_limit_bytes gauge'
  );
  for (const c of DOCKER_CONTAINERS) {
    lines.push(`container_memory_limit_bytes{container_name="${c.name}",image="${c.image}"} ${c.memLimit * 1024 * 1024}`);
  }
  return lines.join('\n') + '\n';
}

// ── Evolving nginx state ─────────────────────────────────────────────────────
const nginxState = {
  connectionsAccepted: 1_000_000 + Math.floor(Math.random() * 9_000_000),
  connectionsHandled:  0,
  httpRequestsTotal:   10_000_000 + Math.floor(Math.random() * 90_000_000),
  active:  50,
  reading:  2,
  writing:  8,
  waiting: 40,
};
nginxState.connectionsHandled = nginxState.connectionsAccepted - Math.floor(Math.random() * 1000);

setInterval(() => {
  const newConns = Math.floor(Math.random() * 10);
  nginxState.connectionsAccepted  += newConns;
  nginxState.connectionsHandled   += newConns - Math.floor(Math.random() * 2);
  nginxState.httpRequestsTotal    += Math.floor(Math.random() * 200);
  nginxState.active   = Math.max(5,  Math.min(500, nginxState.active  + Math.floor(Math.random() * 10) - 5));
  nginxState.reading  = Math.floor(Math.random() * 5);
  nginxState.writing  = Math.floor(Math.random() * 20) + 1;
  nginxState.waiting  = Math.max(0, nginxState.active - nginxState.reading - nginxState.writing);
}, 1000);

// nginx stub_status format — consumed by the OTel nginx/ receiver
function nginxStubStatus() {
  const s = nginxState;
  return `Active connections: ${s.active} \nserver accepts handled requests\n ${s.connectionsAccepted} ${s.connectionsHandled} ${s.httpRequestsTotal} \nReading: ${s.reading} Writing: ${s.writing} Waiting: ${s.waiting} \n`;
}

function makeNginxServer(port) {
  const server = http.createServer((req, res) => {
    if (req.url === '/nginx_status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(nginxStubStatus());
    } else if (req.url === '/' || req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
  server.on('error', err => {
    if (err.code === 'EADDRINUSE') console.warn(`[metricsServer] port ${port} already in use — not started`);
    else console.error('[metricsServer] error:', err.message);
  });
  server.listen(port, '0.0.0.0', () =>
    console.log(`[metricsServer] nginx stub_status on :${port}/nginx_status`)
  );
  return server;
}

function makePrometheusServer(port, metricsFn, label) {
  const server = http.createServer((req, res) => {
    if ((req.url === '/metrics' || req.url === '/') && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
      res.end(metricsFn());
    } else if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
  server.on('error', err => {
    if (err.code === 'EADDRINUSE') console.warn(`[metricsServer] ${label} port ${port} already in use — not started`);
    else console.error(`[metricsServer] ${label} error:`, err.message);
  });
  server.listen(port, '0.0.0.0', () =>
    console.log(`[metricsServer] ${label} Prometheus metrics on :${port}/metrics`)
  );
  return server;
}

function makeDockerApiServer(port) {
  const json = (res, data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Api-Version': '1.44' });
    res.end(JSON.stringify(data));
  };

  const server = http.createServer((req, res) => {
    // Strip optional /v1.XX API version prefix
    const pathname = req.url.replace(/^\/v\d+\.\d+/, '').split('?')[0];

    if (req.method === 'GET' && pathname === '/_ping') {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Api-Version': '1.44' });
      res.end('OK');
      return;
    }

    if (req.method === 'GET' && pathname === '/info') {
      return json(res, {
        Containers: dockerState.running + dockerState.stopped,
        ContainersRunning: dockerState.running, ContainersStopped: dockerState.stopped,
        Images: dockerState.images, ServerVersion: '24.0.7',
        NCPU: DOCKER_NUM_CPUS, MemTotal: 16 * 1024 * 1024 * 1024,
        OperatingSystem: 'Ubuntu 22.04.3 LTS', OSType: 'linux', Architecture: 'x86_64',
        KernelVersion: '5.15.0-91-generic',
      });
    }

    if (req.method === 'GET' && pathname === '/containers/json') {
      return json(res, DOCKER_CONTAINERS.map(c => ({
        Id: dockerContainerIds[c.name],
        Names: [`/${c.name}`],
        Image: c.image,
        Status: 'Up 2 hours',
        State: 'running',
        Labels: { 'com.docker.compose.service': c.name },
      })));
    }

    const statsMatch = pathname.match(/^\/containers\/([^/]+)\/stats$/);
    if (req.method === 'GET' && statsMatch) {
      const ref = statsMatch[1];
      const c = DOCKER_CONTAINERS.find(c =>
        c.name === ref || dockerContainerIds[c.name] === ref || dockerContainerIds[c.name].startsWith(ref)
      ) || DOCKER_CONTAINERS[0];
      const cpu    = dockerCpuNs[c.name];
      const prevCpu = dockerPrevCpuNs[c.name];
      const sys    = dockerSysCpuNs;
      const prevSys = dockerPrevSysCpuNs;
      const mem    = dockerState.memUsage[c.name];
      const limit  = c.memLimit * 1024 * 1024;
      const n      = dockerNetStats[c.name];
      return json(res, {
        read:    new Date().toISOString(),
        preread: new Date(Date.now() - 1000).toISOString(),
        id: dockerContainerIds[c.name],
        name: `/${c.name}`,
        cpu_stats: {
          cpu_usage: {
            total_usage: cpu,
            percpu_usage: Array.from({ length: DOCKER_NUM_CPUS }, () => Math.floor(cpu / DOCKER_NUM_CPUS)),
            usage_in_kernelmode: Math.floor(cpu * 0.25),
            usage_in_usermode:   Math.floor(cpu * 0.75),
          },
          system_cpu_usage: sys,
          online_cpus: DOCKER_NUM_CPUS,
          throttling_data: { throttled_periods: 0, throttled_time: 0 },
        },
        precpu_stats: {
          cpu_usage: {
            total_usage: prevCpu,
            usage_in_kernelmode: Math.floor(prevCpu * 0.25),
            usage_in_usermode:   Math.floor(prevCpu * 0.75),
          },
          system_cpu_usage: prevSys,
          online_cpus: DOCKER_NUM_CPUS,
          throttling_data: { throttled_periods: 0, throttled_time: 0 },
        },
        memory_stats: {
          usage: mem,
          max_usage: Math.floor(limit * 0.8),
          stats: { cache: Math.floor(mem * 0.1), rss: Math.floor(mem * 0.9),
                   total_rss: Math.floor(mem * 0.9), total_cache: Math.floor(mem * 0.1) },
          limit,
        },
        networks: {
          eth0: { rx_bytes: n.rxBytes, rx_packets: n.rxPkts, rx_errors: 0, rx_dropped: 0,
                  tx_bytes: n.txBytes, tx_packets: n.txPkts, tx_errors: 0, tx_dropped: 0 },
        },
        blkio_stats: {
          io_service_bytes_recursive: [
            { major: 8, minor: 0, op: 'Read',  value: Math.floor(n.rxBytes * 0.5) },
            { major: 8, minor: 0, op: 'Write', value: Math.floor(n.txBytes * 0.3) },
          ],
        },
      });
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Not Found' }));
  });
  server.on('error', err => {
    if (err.code === 'EADDRINUSE') console.warn(`[metricsServer] Docker API port ${port} already in use — not started`);
    else console.error('[metricsServer] Docker API error:', err.message);
  });
  server.listen(port, '0.0.0.0', () =>
    console.log(`[metricsServer] Docker API mock on :${port}`)
  );
  return server;
}

let nginxServer = null;
let kafkaPrometheusServer = null;
let dockerPrometheusServer = null;
let dockerApiServer = null;

export function startMetricsServers() {
  if (!nginxServer) nginxServer = makeNginxServer(9113);
  if (!kafkaPrometheusServer) kafkaPrometheusServer = makePrometheusServer(9308, kafkaMetrics, 'Kafka JMX exporter');
  if (!dockerPrometheusServer) dockerPrometheusServer = makePrometheusServer(9323, dockerMetrics, 'Docker daemon');
  if (!dockerApiServer) dockerApiServer = makeDockerApiServer(2375);
}

export function stopMetricsServers() {
  nginxServer?.close();
  kafkaPrometheusServer?.close();
  dockerPrometheusServer?.close();
  dockerApiServer?.close();
  nginxServer = null;
  kafkaPrometheusServer = null;
  dockerPrometheusServer = null;
  dockerApiServer = null;
}
