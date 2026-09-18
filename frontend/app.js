const API = '/api';
let state = { sources: [], filter: 'all' };

const SUB_TYPES = {
  logs: [
    { value: 'apache', label: 'Apache Access Logs' },
    { value: 'nginx', label: 'Nginx Access Logs' },
    { value: 'appJson', label: 'Application JSON' },
    { value: 'syslog', label: 'Syslog RFC 5424' },
    { value: 'k8sPod', label: 'Kubernetes Pod' },
    { value: 'cloudtrail', label: 'AWS CloudTrail' },
    { value: 'pii', label: 'PII / Sensitive Data' },
    { value: 'microservice', label: 'Microservice App Logs' },
    { value: 'csiem', label: 'CSIEM Security Events' },
    { value: 'custom', label: 'Custom Template' }
  ],
  metrics: [
    { value: 'host', label: 'Host Metrics' },
    { value: 'application', label: 'Application Metrics' },
    { value: 'kubernetes', label: 'Kubernetes Metrics' },
    { value: 'custom', label: 'Custom Metrics' }
  ],
  traces: [
    { value: 'httpRequest', label: 'HTTP Request Traces' },
    { value: 'database', label: 'Database Traces' },
    { value: 'microservice', label: 'Microservice Chain' },
    { value: 'error', label: 'Error Traces' },
    { value: 'genai', label: 'GenAI / LLM Traces' }
  ]
};

const FORMATS = {
  logs: [
    { value: 'text', label: 'Plain Text' },
    { value: 'json', label: 'JSON' },
    { value: 'syslog', label: 'Syslog' }
  ],
  metrics: [
    { value: 'carbon2', label: 'Carbon 2.0' },
    { value: 'prometheus', label: 'Prometheus' },
    { value: 'graphite', label: 'Graphite' }
  ],
  traces: [
    { value: 'otlp', label: 'OTLP JSON' }
  ]
};

async function fetchSources() {
  const res = await fetch(`${API}/sources`);
  const data = await res.json();
  state.sources = data.sources;
  render();
}

async function fetchStats() {
  const res = await fetch(`${API}/stats`);
  const data = await res.json();
  renderAggregateStats(data);
}

async function toggleSource(id, e) {
  e.stopPropagation();
  await fetch(`${API}/sources/${id}/toggle`, { method: 'POST' });
  await fetchSources();
}

async function toggleHttpSource(id, e) {
  e.stopPropagation();
  await fetch(`${API}/sources/${id}/toggle-http`, { method: 'POST' });
  await fetchSources();
}

async function toggleFileSource(id, e) {
  e.stopPropagation();
  await fetch(`${API}/sources/${id}/toggle-file`, { method: 'POST' });
  await fetchSources();
}

async function duplicateSource(id) {
  await fetch(`${API}/sources/${id}/duplicate`, { method: 'POST' });
  closeModal();
  await fetchSources();
}

async function deleteSourceQuick(id, e) {
  e.stopPropagation();
  if (!confirm('Delete this source?')) return;
  await fetch(`${API}/sources/${id}`, { method: 'DELETE' });
  await fetchSources();
}

function toggleKebabMenu(id, e) {
  e.stopPropagation();
  const menu = document.getElementById(`kebab-menu-${id}`);
  document.querySelectorAll('.kebab-menu').forEach(m => {
    if (m.id !== `kebab-menu-${id}`) m.classList.remove('active');
  });
  menu.classList.toggle('active');
}

async function saveSource(formData, id) {
  const method = id ? 'PUT' : 'POST';
  const url = id ? `${API}/sources/${id}` : `${API}/sources`;
  await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData)
  });
  closeModal();
  await fetchSources();
}

function renderAggregateStats(data) {
  document.getElementById('aggregate-stats').innerHTML = `
    <div class="stat"><span class="stat-value">${data.totalSources}</span> sources</div>
    <div class="stat"><span class="stat-value">${data.activeSources}</span> active</div>
    <div class="stat"><span class="stat-value">${formatNumber(data.totalMessagesSent)}</span> messages sent</div>
    <div class="stat"><span class="stat-value">${data.totalErrors}</span> errors</div>
  `;
}

function render() {
  const grid = document.getElementById('sources-grid');
  const filtered = state.filter === 'all'
    ? state.sources
    : state.sources.filter(s => s.dataType === state.filter);

  if (filtered.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 60px 0; color: var(--text-muted);">
      <p style="font-size: 18px; margin-bottom: 8px;">No sources configured</p>
      <p>Click "+ Add Source" to get started</p>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(source => {
    const healthClass = source.health?.status === 'green' ? 'health-green'
      : source.health?.status === 'red' ? 'health-red'
      : source.health?.status === 'mixed' ? 'health-mixed' : '';
    var httpEnabled = source.httpEnabled !== false;
    var fileEnabled = !!source.fileEnabled;
    var epCount = (source.endpointUrls || []).length;
    var modeBadges = '';
    if (fileEnabled) modeBadges += ' <span class="badge badge-ep">file</span>';
    if (epCount > 1) modeBadges += ' <span class="badge badge-ep">' + epCount + ' ep</span>';
    var healthHints = '';
    if (source.health?.endpoints) {
      var failedEps = source.health.endpoints.filter(function(e) { return e.status === 'red'; });
      if (failedEps.length > 0) {
        healthHints = '<div class="health-error-hint">' + failedEps.map(function(e) {
          return escHtml(e.label || 'Endpoint') + ': ' + escHtml(e.error || 'failed');
        }).join('<br>') + '</div>';
      }
    }

    return `
    <div class="source-card ${healthClass}" onclick="showEditForm('${source.id}')">
      <div class="source-card-header">
        <span class="source-card-title">${escHtml(source.name)}</span>
        <div class="source-card-actions">
          ${modeBadges}<span class="badge badge-${source.dataType}">${source.dataType}</span>
          <div class="kebab-menu-container">
            <button class="kebab-menu-btn" onclick="toggleKebabMenu('${source.id}', event)" title="Options">⋯</button>
            <div class="kebab-menu" id="kebab-menu-${source.id}">
              <button class="kebab-item" onclick="showSourceDetail('${source.id}'); event.stopPropagation();">View Details</button>
              <button class="kebab-item" onclick="showErrorLogs('${source.id}'); event.stopPropagation();">View Errors</button>
              <button class="kebab-item" onclick="duplicateSource('${source.id}'); event.stopPropagation();">Duplicate</button>
              <button class="kebab-item kebab-delete" onclick="deleteSourceQuick('${source.id}', event)">Delete</button>
            </div>
          </div>
        </div>
      </div>
      <div class="source-card-meta">
        ${escHtml(source.subType)} &middot; ${source.format} &middot; every ${source.intervalSeconds}s &middot; ${source.volumePerInterval} records
      </div>
      <div class="source-card-stats">
        <span><span class="status-dot ${(httpEnabled || fileEnabled) ? 'active' : 'inactive'}"></span>${(httpEnabled || fileEnabled) ? 'Running' : 'Stopped'}</span>
        <span>${formatNumber(source.stats?.messagesSent || 0)} sent</span>
        <span>${source.stats?.errors || 0} errors</span>
      </div>${healthHints}
      <div class="source-card-footer">
        <span style="font-size: 11px; color: var(--text-muted);">${source.stats?.lastSentAt ? timeAgo(source.stats.lastSentAt) : 'Never sent'}</span>
        <div class="export-toggles" onclick="event.stopPropagation()">
          <div class="export-toggle-item">
            <span class="export-toggle-label">HTTP</span>
            ${httpEnabled ? '<span class="toggle-health" style="background:' + ((source.health?.endpoints || []).find(e => e.label !== 'File')?.status === 'green' ? 'var(--success)' : 'var(--danger)') + '"></span>' : ''}
            <label class="toggle toggle-sm">
              <input type="checkbox" ${httpEnabled ? 'checked' : ''} onchange="toggleHttpSource('${source.id}', event)">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="export-toggle-divider"></div>
          <div class="export-toggle-item">
            <span class="export-toggle-label">File</span>
            ${fileEnabled ? '<span class="toggle-health" style="background:' + ((source.health?.endpoints || []).find(e => e.label === 'File')?.status === 'green' ? 'var(--success)' : 'var(--danger)') + '"></span>' : ''}
            <label class="toggle toggle-sm">
              <input type="checkbox" ${fileEnabled ? 'checked' : ''} onchange="toggleFileSource('${source.id}', event)">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}


async function showErrorLogs(id) {
  const source = state.sources.find(s => s.id === id);
  if (!source) return;

  document.getElementById('modal-content').innerHTML = `
    <h2>${escHtml(source.name)} - Error Logs</h2>
    <div id="error-logs" class="error-logs"><span style="color:var(--text-muted)">Loading...</span></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
    </div>
  `;
  openModal();

  try {
    const res = await fetch(`${API}/sources/${id}/errors`);
    const data = await res.json();
    const container = document.getElementById('error-logs');
    if (!container) return;

    if (!data.errors || data.errors.length === 0) {
      container.innerHTML = '<span style="color:var(--text-muted)">No errors recorded</span>';
      return;
    }

    container.innerHTML = data.errors.map(entry => `
      <div class="error-log-entry">
        <div class="error-log-header">
          <span class="error-log-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
          <span class="error-log-type" style="background: ${entry.type === 'HTTP' ? 'rgba(88,166,255,0.2)' : 'rgba(210,153,34,0.2)'}; color: ${entry.type === 'HTTP' ? 'var(--logs)' : 'var(--metrics)'};">${entry.type}</span>
        </div>
        <div class="error-log-endpoint">${escHtml(entry.endpoint)}</div>
        <pre class="error-log-message">${escHtml(entry.error)}</pre>
      </div>
    `).join('');
  } catch (err) {
    const container = document.getElementById('error-logs');
    if (container) container.innerHTML = '<span style="color:var(--danger)">Failed to load error logs.</span>';
  }
}

async function showSourceDetail(id) {
  const source = state.sources.find(s => s.id === id);
  if (!source) return;

  document.getElementById('modal-content').innerHTML = `
    <h2>${escHtml(source.name)}</h2>
    <div class="stats-grid">
      <div class="stat-box">
        <div class="value">${formatNumber(source.stats?.messagesSent || 0)}</div>
        <div class="label">Messages Sent</div>
      </div>
      <div class="stat-box">
        <div class="value">${source.stats?.errors || 0}</div>
        <div class="label">Errors</div>
      </div>
      <div class="stat-box">
        <div class="value">${((source.httpEnabled !== false) || source.fileEnabled) ? '<span style="color:var(--success)">Running</span>' : 'Stopped'}</div>
        <div class="label">Status</div>
      </div>
    </div>
    <div class="detail-tabs">
      <button class="detail-tab active" data-tab="config">Configuration</button>
      <button class="detail-tab" data-tab="logs">Recent Data</button>
    </div>
    <div class="tab-panel" id="tab-config">
      <table class="config-table">
        <tr><td>Data Type</td><td>${source.dataType}</td></tr>
        <tr><td>Sub Type</td><td>${source.subType}</td></tr>
        <tr><td>Format</td><td>${source.format}</td></tr>
        <tr><td>Interval</td><td>${source.intervalSeconds} seconds</td></tr>
        <tr><td>Volume</td><td>${source.volumePerInterval} records/request</td></tr>
        <tr><td>Last Sent</td><td>${source.stats?.lastSentAt || 'Never'}</td></tr>
      </table>
    </div>
    <div class="tab-panel hidden" id="tab-logs">
      <div id="recent-logs" class="recent-logs"><span style="color:var(--text-muted)">Loading...</span></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
    </div>
  `;
  openModal();
  setupDetailTabs(id);
  await loadRecentLogs(id);
}

function setupDetailTabs(sourceId) {
  const tabs = document.querySelectorAll('.detail-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
      if (tab.dataset.tab === 'logs') {
        loadRecentLogs(sourceId);
      }
    });
  });
}

async function loadRecentLogs(id) {
  try {
    const res = await fetch(`${API}/sources/${id}/recent`);
    const data = await res.json();
    const container = document.getElementById('recent-logs');
    if (!container) return;

    if (!data.recent || data.recent.length === 0) {
      container.innerHTML = '<span style="color:var(--text-muted)">No data sent yet. Start the source to see recent entries.</span>';
      return;
    }

    container.innerHTML = data.recent.map(entry => `
      <div class="recent-log-entry">
        <span class="recent-log-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
        <pre class="recent-log-data">${escHtml(entry.data)}</pre>
      </div>
    `).join('');
  } catch (err) {
    const container = document.getElementById('recent-logs');
    if (container) container.innerHTML = '<span style="color:var(--danger)">Failed to load recent data.</span>';
  }
}

function showAddForm() {
  document.getElementById('modal-content').innerHTML = renderForm(null);
  openModal();
  setupFormListeners();
}

function showEditForm(id) {
  const source = state.sources.find(s => s.id === id);
  document.getElementById('modal-content').innerHTML = renderForm(source);
  openModal();
  setupFormListeners();
}

function renderForm(source) {
  const isEdit = !!source;
  const dataType = source?.dataType || 'logs';
  const httpEnabled = source?.httpEnabled !== false;
  const fileEnabled = !!source?.fileEnabled;
  const activeTab = fileEnabled && !httpEnabled ? 'file' : 'http';

  return `
    <h2>${isEdit ? 'Edit Source' : 'Add New Source'}</h2>
    <form id="source-form" data-id="${source?.id || ''}">
      <div class="form-group">
        <label>Name</label>
        <input type="text" name="name" value="${escHtml(source?.name || '')}" placeholder="My Source" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Data Type</label>
          <select name="dataType" id="form-dataType">
            <option value="logs" ${dataType === 'logs' ? 'selected' : ''}>Logs</option>
            <option value="metrics" ${dataType === 'metrics' ? 'selected' : ''}>Metrics</option>
            <option value="traces" ${dataType === 'traces' ? 'selected' : ''}>Traces</option>
          </select>
        </div>
        <div class="form-group">
          <label>Sub Type</label>
          <select name="subType" id="form-subType">
            ${SUB_TYPES[dataType].map(st =>
              `<option value="${st.value}" ${source?.subType === st.value ? 'selected' : ''}>${st.label}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Format</label>
        <select name="format" id="form-format">
          ${FORMATS[dataType].map(f =>
            `<option value="${f.value}" ${source?.format === f.value ? 'selected' : ''}>${f.label}</option>`
          ).join('')}
        </select>
      </div>

      <div class="cfg-tabs">
        <button type="button" class="cfg-tab ${activeTab === 'http' ? 'active' : ''}" data-ctab="http">HTTP Endpoint</button>
        <button type="button" class="cfg-tab ${activeTab === 'file' ? 'active' : ''}" data-ctab="file">Local File</button>
      </div>

      <div id="ctab-http" class="cfg-tab-panel ${activeTab !== 'http' ? 'hidden' : ''}">
        <div class="form-group">
          <label>Endpoints</label>
          <div id="endpoints-list">
            ${(source?.endpointUrls || [{ url: '', label: 'Primary', enabled: true }]).map((ep, i) =>
              '<div class="endpoint-row" data-idx="' + i + '">' +
              '<input type="text" class="ep-label" value="' + escHtml(ep.label || 'Endpoint') + '" placeholder="Label">' +
              '<input type="url" class="ep-url" value="' + escHtml(ep.url || '') + '" placeholder="https://...sumologic.com/.../TOKEN">' +
              '<label class="toggle toggle-sm"><input type="checkbox" class="ep-enabled" ' + (ep.enabled !== false ? 'checked' : '') + '><span class="toggle-slider"></span></label>' +
              '<button type="button" class="btn-remove-ep" onclick="removeEndpoint(this)">&times;</button>' +
              '</div>'
            ).join('')}
          </div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="addEndpoint()">+ Add Endpoint</button>
        </div>
        <div class="form-group">
          <label>Source Category</label>
          <input type="text" name="sourceCategory" value="${escHtml(source?.metadata?.sourceCategory || '')}" placeholder="prod/web/apache">
        </div>
        <div class="form-group">
          <label>Source Host</label>
          <input type="text" name="sourceHost" value="${escHtml(source?.metadata?.sourceHost || '')}" placeholder="web-01.example.com">
        </div>
      </div>

      <div id="ctab-file" class="cfg-tab-panel ${activeTab !== 'file' ? 'hidden' : ''}">
        <div class="form-group">
          <label>File Path</label>
          <input type="text" name="filePath" id="form-filePath" value="${escHtml(source?.filePath || '')}" placeholder="/tmp/telemetry.log">
          <small style="color:var(--text-muted);font-size:11px;margin-top:4px;display:block;">Rotation: 10MB max · 2 files · auto-cleanup after 1 day</small>
          <small style="color:var(--text-muted);font-size:11px;margin-top:4px;display:block;">Must be writable by current user (e.g., /tmp/telemetry.log or ~/telemetry.log)</small>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Interval (seconds)</label>
          <input type="number" name="intervalSeconds" value="${source?.intervalSeconds || 10}" min="1" max="3600">
        </div>
        <div class="form-group">
          <label>Volume (records/request)</label>
          <input type="number" name="volumePerInterval" value="${source?.volumePerInterval || 50}" min="1" max="10000">
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Create'}</button>
      </div>
    </form>
  `;
}

function setupFormListeners() {
  const dataTypeSelect = document.getElementById('form-dataType');
  const subTypeSelect = document.getElementById('form-subType');
  const formatSelect = document.getElementById('form-format');

  dataTypeSelect.addEventListener('change', () => {
    const dt = dataTypeSelect.value;
    subTypeSelect.innerHTML = SUB_TYPES[dt].map(st =>
      `<option value="${st.value}">${st.label}</option>`
    ).join('');
    formatSelect.innerHTML = FORMATS[dt].map(f =>
      `<option value="${f.value}">${f.label}</option>`
    ).join('');
  });

  document.querySelectorAll('.cfg-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.cfg-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.ctab;
      document.querySelectorAll('.cfg-tab-panel').forEach(p => p.classList.add('hidden'));
      document.getElementById(`ctab-${tab}`).classList.remove('hidden');
    });
  });

  document.getElementById('source-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const id = form.dataset.id || null;
    const endpointUrls = [];
    document.querySelectorAll('.endpoint-row').forEach(row => {
      endpointUrls.push({
        label: row.querySelector('.ep-label').value || 'Endpoint',
        url: row.querySelector('.ep-url').value,
        enabled: row.querySelector('.ep-enabled').checked
      });
    });
    const formData = {
      name: form.name.value,
      dataType: form.dataType.value,
      subType: form.subType.value,
      format: form.format.value,
      filePath: form.filePath?.value || '',
      endpointUrls,
      intervalSeconds: parseInt(form.intervalSeconds.value),
      volumePerInterval: parseInt(form.volumePerInterval.value),
      metadata: {
        sourceCategory: form.sourceCategory?.value || '',
        sourceHost: form.sourceHost?.value || ''
      }
    };
    saveSource(formData, id);
  });
}

function addEndpoint() {
  var list = document.getElementById('endpoints-list');
  var idx = list.children.length;
  var row = document.createElement('div');
  row.className = 'endpoint-row';
  row.dataset.idx = idx;
  row.innerHTML = '<input type="text" class="ep-label" value="Endpoint ' + (idx + 1) + '" placeholder="Label">' +
    '<input type="url" class="ep-url" value="" placeholder="https://...sumologic.com/.../TOKEN" required>' +
    '<label class="toggle toggle-sm"><input type="checkbox" class="ep-enabled" checked><span class="toggle-slider"></span></label>' +
    '<button type="button" class="btn-remove-ep" onclick="removeEndpoint(this)">&times;</button>';
  list.appendChild(row);
}

function removeEndpoint(btn) {
  var row = btn.closest('.endpoint-row');
  var list = document.getElementById('endpoints-list');
  if (list.children.length > 1) {
    row.remove();
  }
}

function openModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function timeAgo(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showTestSend() {
  document.getElementById('modal-content').innerHTML = `
    <h2>Test Send</h2>
    <p style="color:var(--text-muted); font-size:13px; margin-bottom:16px;">Send custom data to a Sumo Logic HTTP Source and inspect the full request/response.</p>
    <form id="test-send-form">
      <div class="form-group">
        <label>Endpoint URL</label>
        <input type="url" name="endpointUrl" placeholder="https://endpoint.collection.sumologic.com/receiver/v1/http/TOKEN" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Content-Type</label>
          <select name="contentType">
            <option value="text/plain">text/plain</option>
            <option value="application/json">application/json</option>
            <option value="application/vnd.sumologic.prometheus">prometheus</option>
          </select>
        </div>
        <div class="form-group">
          <label>X-Sumo-Category</label>
          <input type="text" name="sumoCategory" placeholder="optional">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>X-Sumo-Host</label>
          <input type="text" name="sumoHost" placeholder="optional">
        </div>
        <div class="form-group">
          <label>X-Sumo-Name</label>
          <input type="text" name="sumoName" placeholder="optional">
        </div>
      </div>
      <div class="form-group">
        <label>Request Body</label>
        <textarea name="body" rows="8" placeholder='Enter your log/metric/trace data here...\nOne line per log, or a JSON object' required></textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Send Request</button>
      </div>
    </form>
    <div id="test-send-result"></div>
  `;
  openModal();

  document.getElementById('test-send-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const resultDiv = document.getElementById('test-send-result');
    resultDiv.innerHTML = '<p style="color:var(--text-muted); margin-top:16px;">Sending...</p>';

    const headers = {};
    if (form.sumoCategory.value) headers['X-Sumo-Category'] = form.sumoCategory.value;
    if (form.sumoHost.value) headers['X-Sumo-Host'] = form.sumoHost.value;
    if (form.sumoName.value) headers['X-Sumo-Name'] = form.sumoName.value;

    try {
      const res = await fetch(API + '/sources/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpointUrl: form.endpointUrl.value,
          contentType: form.contentType.value,
          body: form.body.value,
          headers
        })
      });
      const data = await res.json();
      renderTestResult(data);
    } catch (err) {
      resultDiv.innerHTML = '<p style="color:var(--danger); margin-top:16px;">Failed to send: ' + escHtml(err.message) + '</p>';
    }
  });
}

function renderTestResult(data) {
  var resultDiv = document.getElementById('test-send-result');
  var statusColor = data.success ? 'var(--success)' : 'var(--danger)';
  var statusIcon = data.success ? 'OK' : 'FAIL';

  var html = '<div class="test-result">';
  html += '<div class="test-result-header">';
  html += '<span class="test-result-status" style="color:' + statusColor + '">' + statusIcon + ' ' + data.response.status + ' ' + escHtml(data.response.statusText) + '</span>';
  html += '<span style="color:var(--text-muted); font-size:12px;">' + data.duration_ms + 'ms</span>';
  html += '</div>';

  html += '<div class="test-result-section"><h4>Request</h4><div class="test-result-block">';
  html += '<div class="test-result-line"><span class="test-label">Method:</span> ' + data.request.method + '</div>';
  html += '<div class="test-result-line"><span class="test-label">URL:</span> ' + escHtml(data.request.url) + '</div>';
  html += '<div class="test-result-line"><span class="test-label">Headers:</span></div>';
  html += '<pre class="test-result-pre">' + escHtml(JSON.stringify(data.request.headers, null, 2)) + '</pre>';
  html += '<div class="test-result-line"><span class="test-label">Body:</span></div>';
  html += '<pre class="test-result-pre">' + escHtml(data.request.body) + '</pre>';
  html += '</div></div>';

  html += '<div class="test-result-section"><h4>Response</h4><div class="test-result-block">';
  html += '<div class="test-result-line"><span class="test-label">Status:</span> <span style="color:' + statusColor + '">' + data.response.status + ' ' + escHtml(data.response.statusText) + '</span></div>';
  html += '<div class="test-result-line"><span class="test-label">Headers:</span></div>';
  html += '<pre class="test-result-pre">' + escHtml(JSON.stringify(data.response.headers, null, 2)) + '</pre>';
  html += '<div class="test-result-line"><span class="test-label">Body:</span></div>';
  html += '<pre class="test-result-pre">' + escHtml(data.response.body) + '</pre>';
  html += '</div></div>';

  html += '</div>';
  resultDiv.innerHTML = html;
}

// Event listeners
document.addEventListener('click', (e) => {
  if (!e.target.closest('.kebab-menu-container')) {
    document.querySelectorAll('.kebab-menu').forEach(m => m.classList.remove('active'));
  }
});

document.getElementById('btn-add-source').addEventListener('click', showAddForm);
document.getElementById('btn-test-send').addEventListener('click', showTestSend);
document.getElementById('btn-start-all').addEventListener('click', async () => {
  const res = await fetch(`${API}/sources/start-all`, { method: 'POST' });
  const data = await res.json();
  if (data.sources) {
    state.sources = data.sources;
    render();
  } else {
    await fetchSources();
  }
});
document.getElementById('btn-stop-all').addEventListener('click', async () => {
  const res = await fetch(`${API}/sources/stop-all`, { method: 'POST' });
  const data = await res.json();
  if (data.sources) {
    state.sources = data.sources;
    render();
  } else {
    await fetchSources();
  }
});
document.querySelector('.modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

document.querySelectorAll('.btn-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filter = btn.dataset.filter;
    render();
  });
});

// Initial load + polling
fetchSources();
fetchStats();
setInterval(fetchSources, 5000);
setInterval(fetchStats, 5000);
