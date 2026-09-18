export async function send(traceData, endpointUrl, format, metadata = {}) {
  const body = JSON.stringify(traceData);

  const headers = {
    'Content-Type': 'application/json'
  };

  if (metadata.sourceCategory) headers['X-Sumo-Category'] = metadata.sourceCategory;
  if (metadata.sourceHost) headers['X-Sumo-Host'] = metadata.sourceHost;
  if (metadata.sourceName) headers['X-Sumo-Name'] = metadata.sourceName;

  let url = endpointUrl;
  if (!url.endsWith('/v1/traces') && !url.includes('receiver/v1/http')) {
    url = url.replace(/\/$/, '') + '/v1/traces';
  }

  try {
    const response = await fetch(url, {
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
