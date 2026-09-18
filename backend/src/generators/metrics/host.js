import { faker } from '@faker-js/faker';

const DISK_DEVICES = ['sda', 'sdb', 'nvme0n1'];
const NET_INTERFACES = ['eth0', 'eth1', 'ens5'];

export function generate(count, opts = {}) {
  const host = opts.sourceHost || `host-${faker.number.int({ min: 1, max: 50 })}`;
  const region = opts.region || 'us-east-1';
  const metrics = [];
  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < count; i++) {
    const timestamp = now - (count - i);

    metrics.push({
      name: 'cpu.usage_percent',
      value: parseFloat((50 + Math.sin(i * 0.1) * 30 + Math.random() * 10).toFixed(2)),
      timestamp,
      tags: { host, region, cpu: `cpu${faker.number.int({ min: 0, max: 7 })}` }
    });

    metrics.push({
      name: 'memory.used_percent',
      value: parseFloat((70 + Math.random() * 20).toFixed(2)),
      timestamp,
      tags: { host, region }
    });

    metrics.push({
      name: 'memory.available_bytes',
      value: faker.number.int({ min: 1000000000, max: 8000000000 }),
      timestamp,
      tags: { host, region }
    });

    const disk = faker.helpers.arrayElement(DISK_DEVICES);
    metrics.push({
      name: 'disk.read_bytes_per_sec',
      value: faker.number.int({ min: 0, max: 50000000 }),
      timestamp,
      tags: { host, region, device: disk }
    });

    metrics.push({
      name: 'disk.write_bytes_per_sec',
      value: faker.number.int({ min: 0, max: 30000000 }),
      timestamp,
      tags: { host, region, device: disk }
    });

    metrics.push({
      name: 'disk.used_percent',
      value: parseFloat((40 + Math.random() * 40).toFixed(2)),
      timestamp,
      tags: { host, region, device: disk, mountpoint: '/data' }
    });

    const iface = faker.helpers.arrayElement(NET_INTERFACES);
    metrics.push({
      name: 'network.bytes_recv_per_sec',
      value: faker.number.int({ min: 10000, max: 100000000 }),
      timestamp,
      tags: { host, region, interface: iface }
    });

    metrics.push({
      name: 'network.bytes_sent_per_sec',
      value: faker.number.int({ min: 5000, max: 50000000 }),
      timestamp,
      tags: { host, region, interface: iface }
    });
  }

  return metrics;
}
