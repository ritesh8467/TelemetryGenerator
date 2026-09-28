import { faker } from '@faker-js/faker';

export function generate(count, opts = {}) {
  const template = opts.template || '{timestamp} [{level}] {message}';
  const records = [];

  for (let i = 0; i < count; i++) {
    let line = template
      .replace('{timestamp}', new Date().toISOString())
      .replace('{level}', faker.helpers.arrayElement(['INFO', 'WARN', 'ERROR', 'DEBUG']))
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
