export async function send(metrics, endpointUrl, format, metadata = {}) {
  let body;
  let contentType = 'text/plain';

  switch (format) {
    case 'carbon2':
      body = metrics.map(m => {
        const tags = Object.entries(m.tags).map(([k, v]) => `${k}=${v}`).join(' ');
        return `metric=${m.name} ${tags}  ${m.value} ${m.timestamp}`;
      }).join('\n');
      break;

    case 'prometheus':
      body = metrics.map(m => {
        const labels = Object.entries(m.tags).map(([k, v]) => `${k}="${v}"`).join(',');
        return `${m.name.replace(/\./g, '_')}{${labels}} ${m.value} ${m.timestamp * 1000}`;
      }).join('\n');
      contentType = 'application/vnd.sumologic.prometheus';
      break;

    case 'graphite':
      body = metrics.map(m => {
        const host = m.tags.host || 'unknown';
        const path = `${host}.${m.name}`;
        return `${path} ${m.value} ${m.timestamp}`;
      }).join('\n');
      break;

    default:
      body = metrics.map(m => {
        const tags = Object.entries(m.tags).map(([k, v]) => `${k}=${v}`).join(' ');
        return `metric=${m.name} ${tags}  ${m.value} ${m.timestamp}`;
      }).join('\n');
      break;
  }

  const headers = {
    'Content-Type': contentType
  };

  if (metadata.sourceCategory) headers['X-Sumo-Category'] = metadata.sourceCategory;
  if (metadata.sourceHost) headers['X-Sumo-Host'] = metadata.sourceHost;
  if (metadata.sourceName) headers['X-Sumo-Name'] = metadata.sourceName;

  try {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body
    });

    return {
      ok: response.ok,
      status: response.status,
      body: response.ok ? '' : await response.text()
    };
  } catch (err) {
    return { ok: false, status: 0, body: err.message };
  }
}
