import { faker } from '@faker-js/faker';

function buildLevelWeights(dist) {
  if (!dist) return null;
  const weights = [
    { value: 'INFO', weight: Math.max(0, dist.info ?? 0) },
    { value: 'WARN', weight: Math.max(0, dist.warn ?? 0) },
    { value: 'ERROR', weight: Math.max(0, dist.error ?? 0) },
    { value: 'DEBUG', weight: Math.max(0, dist.debug ?? 0) }
  ].filter(w => w.weight > 0);
  return weights.length > 0 ? weights : null;
}

export function generate(count, opts = {}) {
  const template = opts.template || '{timestamp} [{level}] {message}';
  const records = [];
  const levelWeights = buildLevelWeights(opts.levelDistribution);

  for (let i = 0; i < count; i++) {
    const level = levelWeights
      ? faker.helpers.weightedArrayElement(levelWeights)
      : faker.helpers.arrayElement(['INFO', 'WARN', 'ERROR', 'DEBUG']);
    let line = template
      .replace('{timestamp}', new Date().toISOString())
      .replace('{level}', level)
      .replace('{message}', faker.lorem.sentence())
      .replace('{ip}', faker.internet.ipv4())
      .replace('{host}', opts.sourceHost || faker.internet.domainName())
      .replace('{user}', faker.internet.username())
      .replace('{method}', faker.helpers.arrayElement(['GET', 'POST', 'PUT', 'DELETE']))
      .replace('{path}', `/${faker.word.noun()}/${faker.word.verb()}`)
      .replace('{status}', String(faker.helpers.arrayElement([200, 201, 400, 404, 500])))
      .replace('{duration}', String(faker.number.int({ min: 1, max: 5000 })))
      .replace('{service}', faker.helpers.arrayElement(['auth', 'api', 'worker', 'gateway']));
    records.push(line);
  }
  return records;
}
