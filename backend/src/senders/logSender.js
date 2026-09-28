export async function send(records, endpointUrl, format, metadata = {}) {
  let body;
  let contentType;

  switch (format) {
    case 'json':
      body = records.map(r => {
        try {
          JSON.parse(r);
          return r;
        } catch {
          return JSON.stringify({
            timestamp: new Date().toISOString(),
            message: r,
            source: 'telemetry-generator'
          });
        }
      }).join('\n');
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

    const bytes = response.ok ? Buffer.byteLength(body, 'utf-8') : 0;
    return {
      ok: response.ok,
      status: response.status,
      body: response.ok ? '' : await response.text(),
      bytes
    };
  } catch (err) {
    return { ok: false, status: 0, body: err.name === 'TimeoutError' ? 'Request timed out (10s)' : err.message, bytes: 0 };
  }
}
