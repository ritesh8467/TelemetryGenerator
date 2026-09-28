import { faker } from '@faker-js/faker';

const FACILITIES = [
  { name: 'kern', code: 0 }, { name: 'user', code: 1 },
  { name: 'mail', code: 2 }, { name: 'daemon', code: 3 },
  { name: 'auth', code: 4 }, { name: 'syslog', code: 5 },
  { name: 'local0', code: 16 }, { name: 'local7', code: 23 }
];
const SEVERITIES = [
  { name: 'emerg', code: 0 }, { name: 'alert', code: 1 },
  { name: 'crit', code: 2 }, { name: 'err', code: 3 },
  { name: 'warning', code: 4 }, { name: 'notice', code: 5 },
  { name: 'info', code: 6 }, { name: 'debug', code: 7 }
];
const SEVERITY_WEIGHTS = [1, 2, 3, 10, 15, 20, 35, 14];
const APP_NAMES = ['sshd', 'nginx', 'systemd', 'cron', 'kernel', 'dockerd', 'kubelet', 'postfix'];

const MESSAGES = {
  sshd: ['Accepted publickey for user from {ip}', 'Failed password for root from {ip}', 'Connection closed by {ip}'],
  nginx: ['upstream timed out connecting to {ip}:8080', 'client {ip} sent invalid request', 'worker process exited on signal 11'],
  systemd: ['Started {service}.service', 'Stopping {service}.service', 'Unit {service}.service entered failed state'],
  cron: ['(root) CMD (/usr/bin/logrotate)', '(www-data) CMD (php /app/artisan schedule:run)', '(root) CMD (/usr/sbin/ntpdate pool.ntp.org)'],
  kernel: ['Out of memory: Kill process {pid} ({service})', 'TCP: out of memory -- consider tuning tcp_mem', 'NMI watchdog: BUG: soft lockup - CPU#{cpu} stuck'],
  dockerd: ['Container {container} started', 'Container {container} health check failed', 'Pulling image {image}'],
  kubelet: ['Pod {pod} is evicted due to memory pressure', 'Successfully pulled image {image}', 'Readiness probe failed for {pod}'],
  postfix: ['connect from {hostname}[{ip}]', 'warning: hostname verification failed', 'NOQUEUE: reject: RCPT from {hostname}']
};

function pickSeverity() {
  const total = SEVERITY_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < SEVERITY_WEIGHTS.length; i++) {
    r -= SEVERITY_WEIGHTS[i];
    if (r <= 0) return SEVERITIES[i];
  }
  return SEVERITIES[6];
}

export function generate(count, opts = {}) {
  const lines = [];
  const hostname = opts.sourceHost || `server-${faker.number.int({ min: 1, max: 20 })}.dc1.example.com`;

  for (let i = 0; i < count; i++) {
    const facility = faker.helpers.arrayElement(FACILITIES);
    const severity = pickSeverity();
    const priority = facility.code * 8 + severity.code;
    const appName = faker.helpers.arrayElement(APP_NAMES);
    const pid = faker.number.int({ min: 100, max: 65535 });
    const msgId = faker.string.alphanumeric(8).toUpperCase();
    const timestamp = new Date().toISOString();

    let message = faker.helpers.arrayElement(MESSAGES[appName] || ['System event occurred']);
    message = message
      .replace('{ip}', faker.internet.ipv4())
      .replace('{service}', faker.helpers.arrayElement(['nginx', 'redis', 'postgres', 'app']))
      .replace('{pid}', String(faker.number.int({ min: 1000, max: 50000 })))
      .replace('{container}', faker.string.hexadecimal({ length: 12, prefix: '' }))
      .replace('{image}', `docker.io/library/${faker.helpers.arrayElement(['nginx', 'redis', 'node', 'python'])}:latest`)
      .replace('{pod}', `${faker.helpers.arrayElement(['api', 'worker', 'web'])}-${faker.string.alphanumeric(5)}`)
      .replace('{hostname}', faker.internet.domainName())
      .replace('{cpu}', String(faker.number.int({ min: 0, max: 15 })));

    lines.push(`<${priority}>1 ${timestamp} ${hostname} ${appName} ${pid} ${msgId} - ${message}`);
  }
  return lines;
}
