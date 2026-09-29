export async function send(metrics, endpointUrl, format, metadata = {}, customHeaders = []) {
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

    case 'otlp':
      body = JSON.stringify(formatOTLPMetrics(metrics, metadata));
      contentType = 'application/json';
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
  for (const h of customHeaders) {
    if (h.key) headers[h.key] = h.value || '';
  }

  let url = endpointUrl;
  if (format === 'otlp' && !url.endsWith('/v1/metrics') && !url.includes('receiver/v1/http')) {
    url = url.replace(/\/$/, '') + '/v1/metrics';
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

function formatOTLPMetrics(metrics, metadata) {
  const resourceMetrics = [{
    resource: {
      attributes: [
        { key: 'service.name', value: { stringValue: metadata.serviceName || 'metrics-service' } },
        { key: 'service.instance.id', value: { stringValue: metadata.sourceHost || 'unknown' } }
      ]
    },
    scopeMetrics: [{
      scope: {
        name: 'telemetry-generator',
        version: '1.0.0'
      },
      metrics: metrics.map(m => ({
        name: m.name,
        type: m.type || 'gauge',
        gauge: m.type === 'gauge' || !m.type ? {
          dataPoints: [{
            attributes: Object.entries(m.tags).map(([k, v]) => ({
              key: k,
              value: { stringValue: String(v) }
            })),
            timeUnixNano: String(BigInt(m.timestamp) * 1000000n),
            asDouble: m.value
          }]
        } : undefined,
        sum: m.type === 'sum' ? {
          dataPoints: [{
            attributes: Object.entries(m.tags).map(([k, v]) => ({
              key: k,
              value: { stringValue: String(v) }
            })),
            timeUnixNano: String(BigInt(m.timestamp) * 1000000n),
            asDouble: m.value
          }]
        } : undefined
      }))
    }]
  }];

  return { resourceMetrics };
}
