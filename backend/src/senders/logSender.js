export async function send(records, endpointUrl, format, metadata = {}) {
  let body;
  let contentType;

  switch (format) {
    case 'json':
      body = JSON.stringify(records.map(r => ({
        timestamp: new Date().toISOString(),
        message: r,
        sourceCategory: metadata.sourceCategory || '',
        sourceHost: metadata.sourceHost || '',
        source: 'telemetry-generator'
      })));
      contentType = 'application/json';
      break;
    case 'syslog':
      body = records.join('\n');
      contentType = 'text/plain';
      break;
    case 'text':
    default:
      body = records.join('\n');
      contentType = 'text/plain';
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
      body,
      signal: AbortSignal.timeout(10000)
    });

    return {
      ok: response.ok,
      status: response.status,
      body: response.ok ? '' : await response.text()
    };
  } catch (err) {
    return { ok: false, status: 0, body: err.name === 'TimeoutError' ? 'Request timed out (10s)' : err.message };
  }
}
