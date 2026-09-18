import { faker } from '@faker-js/faker';

const NAMESPACES = ['production', 'staging', 'monitoring', 'kube-system'];
const DEPLOYMENTS = ['api-server', 'web-frontend', 'worker', 'scheduler', 'cache'];

export function generate(count, opts = {}) {
  const cluster = opts.cluster || 'prod-us-east-1';
  const metrics = [];
  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < count; i++) {
    const timestamp = now - (count - i);
    const namespace = faker.helpers.arrayElement(NAMESPACES);
    const deployment = faker.helpers.arrayElement(DEPLOYMENTS);
    const pod = `${deployment}-${faker.string.alphanumeric(10)}`;
    const node = `ip-10-${faker.number.int({ min: 0, max: 255 })}-${faker.number.int({ min: 0, max: 255 })}-${faker.number.int({ min: 1, max: 254 })}.ec2.internal`;

    metrics.push({
      name: 'kube.pod.cpu_usage_cores',
      value: parseFloat((Math.random() * 2).toFixed(4)),
      timestamp,
      tags: { cluster, namespace, pod, node, container: 'app' }
    });

    metrics.push({
      name: 'kube.pod.memory_usage_bytes',
      value: faker.number.int({ min: 50000000, max: 2000000000 }),
      timestamp,
      tags: { cluster, namespace, pod, node, container: 'app' }
    });

    metrics.push({
      name: 'kube.pod.memory_limit_bytes',
      value: 2147483648,
      timestamp,
      tags: { cluster, namespace, pod, node }
    });

    metrics.push({
      name: 'kube.pod.restarts_total',
      value: faker.number.int({ min: 0, max: 5 }),
      timestamp,
      tags: { cluster, namespace, pod }
    });

    metrics.push({
      name: 'kube.node.cpu_usage_percent',
      value: parseFloat((30 + Math.random() * 50).toFixed(2)),
      timestamp,
      tags: { cluster, node }
    });

    metrics.push({
      name: 'kube.node.memory_usage_percent',
      value: parseFloat((50 + Math.random() * 35).toFixed(2)),
      timestamp,
      tags: { cluster, node }
    });

    metrics.push({
      name: 'kube.deployment.replicas_available',
      value: faker.number.int({ min: 2, max: 10 }),
      timestamp,
      tags: { cluster, namespace, deployment }
    });

    metrics.push({
      name: 'kube.hpa.current_replicas',
      value: faker.number.int({ min: 2, max: 15 }),
      timestamp,
      tags: { cluster, namespace, deployment }
    });
  }

  return metrics;
}
