export async function send(traceData, endpointUrl, format, metadata = {}) {
  // Generator returns an array of trace objects; flatten into a single OTLP ExportTraceServiceRequest.
  const otlpPayload = Array.isArray(traceData)
    ? { resourceSpans: traceData.flatMap(t => t.resourceSpans || []) }
    : traceData;
  const body = JSON.stringify(otlpPayload);

  const headers = {
    'Content-Type': 'application/json'
  };

  if (metadata.sourceCategory) headers['X-Sumo-Category'] = metadata.sourceCategory;
  if (metadata.sourceHost) headers['X-Sumo-Host'] = metadata.sourceHost;
  if (metadata.sourceName) headers['X-Sumo-Name'] = metadata.sourceName;

  let url = endpointUrl;
  // Only append /v1/traces for generic OTLP collector endpoints.
  // Sumo Logic receiver URLs (receiver/v1/trace, receiver/v1/http, etc.) are already complete.
  if (!url.endsWith('/v1/traces') && !url.includes('receiver/v1/')) {
    url = url.replace(/\/$/, '') + '/v1/traces';
  }

  try {
    const response = await fetch(url, {
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
