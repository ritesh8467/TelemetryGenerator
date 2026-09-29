const API = '/api';
let state = { sources: [], filter: 'all', hasDraft: false, draftChanges: 0, draftSavedAt: null, activeTab: 'observability', settings: { appName: 'Telemetry Generator', timezone: 'UTC', maxVersions: 10, overrideEnabled: false, globalIntervalSeconds: 10, globalVolumePerInterval: 50 } };

const SUB_TYPES = {
  logs: [
    { value: 'apache', label: 'Apache Access Logs' },
    { value: 'nginx', label: 'Nginx Access Logs' },
    { value: 'nginxOtel', label: 'Nginx OTel (access + error)' },
    { value: 'mysqlOtel', label: 'MySQL OTel (error + slow + general)' },
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
    { value: 'nginxOtel', label: 'Nginx OTel Metrics (port 9113)' },
    { value: 'mysqlOtel', label: 'MySQL OTel Metrics (port 9104)' },
    { value: 'custom', label: 'Custom Metrics' }
  ],
  traces: [
    { value: 'httpRequest', label: 'HTTP Request Traces' },
    { value: 'database', label: 'Database Traces' },
    { value: 'microservice', label: 'Microservice Chain' },
    { value: 'error', label: 'Error Traces' },
    { value: 'genai', label: 'GenAI / LLM Traces' },
    { value: 'nginxOtel', label: 'Nginx OTel Traces' },
    { value: 'mysqlOtel', label: 'MySQL OTel Traces' }
  ]
};

const PAGE_SUBTYPES = {
  security: {
    logs: ['csiem', 'cloudtrail', 'pii']
  },
  observability: {
    logs: ['apache', 'nginx', 'appJson', 'syslog', 'k8sPod', 'microservice', 'custom'],
    metrics: ['host', 'application', 'kubernetes', 'custom'],
    traces: ['httpRequest', 'database', 'microservice', 'error', 'genai']
  },
  otel: {
    otelApp: ['nginxOtel', 'mysqlOtel', 'kafkaOtel', 'dockerOtel']
  }
};

function getSourcePage(source) {
  if (source.dataType === 'otelApp') return 'otel';
  for (const [page, types] of Object.entries(PAGE_SUBTYPES)) {
    const subtypes = types[source.dataType] || [];
    if (subtypes.includes(source.subType)) return page;
  }
  return 'observability';
}

function getPageSubTypes(page, dataType) {
  const vals = PAGE_SUBTYPES[page]?.[dataType] || [];
  return (SUB_TYPES[dataType] || []).filter(st => vals.includes(st.value));
}

function getPageDataTypes(page) {
  return Object.keys(PAGE_SUBTYPES[page] || {});
}

const FORMATS = {
  logs: [
    { value: 'text', label: 'Plain Text' },
    { value: 'json', label: 'JSON' },
    { value: 'syslog', label: 'Syslog' }
  ],
  metrics: [
    { value: 'carbon2', label: 'Carbon 2.0' },
    { value: 'prometheus', label: 'Prometheus' },
    { value: 'graphite', label: 'Graphite' },
    { value: 'otlp', label: 'OTLP JSON' }
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
  // Stats endpoint kept for polling compatibility; aggregate UI removed.
}

async function fetchConfigStatus() {
  // Status bar removed — changes are saved immediately. Keep the call to
  // stay compatible with poll loop but do nothing with the response.
}

async function toggleSource(id, e) {
  e.stopPropagation();
  await fetch(`${API}/sources/${id}/toggle`, { method: 'POST' });
  await Promise.all([fetchSources(), fetchConfigStatus()]);
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

async function toggleFileOutput(sourceId, foIndex, e) {
  e.stopPropagation();
  await fetch(`${API}/sources/${sourceId}/toggle-file-output/${foIndex}`, { method: 'POST' });
  await Promise.all([fetchSources(), fetchConfigStatus()]);
}

async function toggleEndpoint(sourceId, epIndex, e) {
  e.stopPropagation();
  await fetch(`${API}/sources/${sourceId}/toggle-endpoint/${epIndex}`, { method: 'POST' });
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

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return (i === 0 ? val : val.toFixed(1)) + ' ' + units[i];
}

function toggleKebabMenu(id, e) {
  e.stopPropagation();
  const menu = document.getElementById(`kebab-menu-${id}`);
  document.querySelectorAll('.kebab-menu').forEach(m => {
    if (m.id !== `kebab-menu-${id}`) {
      m.classList.remove('active');
      m.closest('.source-card')?.classList.remove('menu-open');
    }
  });
  menu.classList.toggle('active');
  menu.closest('.source-card')?.classList.toggle('menu-open', menu.classList.contains('active'));
}

async function resetSourceStats(id, e) {
  e.stopPropagation();
  await fetch(`${API}/sources/${id}/reset-stats`, { method: 'POST' });
  await fetchSources();
}

async function resetAllStats() {
  await fetch(`${API}/sources/reset-all-stats`, { method: 'POST' });
  await fetchSources();
}

async function saveSource(formData, id) {
  const method = id ? 'PUT' : 'POST';
  const url = id ? `${API}/sources/${id}` : `${API}/sources`;
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert('Failed to save: ' + (err.error || res.statusText));
      return;
    }
  } catch (err) {
    alert('Failed to save: ' + err.message);
    return;
  }
  closeModal();
  await fetchSources();
}

function renderAggregateStats() { /* removed */ }

async function renderVersionsTabContent() {
  const wrap = document.getElementById('versions-tab-content');
  if (!wrap) return;
  wrap.innerHTML = '<span style="color:var(--text-muted)">Loading...</span>';

  try {
    const res = await fetch(`${API}/config/versions`);
    const data = await res.json();

    if (!data.versions || data.versions.length === 0) {
      wrap.innerHTML = '<span style="color:var(--text-muted)">No versions yet.</span>';
      return;
    }

    const current = data.currentVersion;
    let selectedVersions = new Set();

    const render = () => {
      wrap.innerHTML = `
        <div class="versions-tab-toolbar">
          <span id="vtab-bulk-info" class="versions-bulk-info" style="display:none"></span>
          <button id="vtab-bulk-delete" class="btn btn-danger btn-sm" style="display:none" onclick="bulkDeleteVersionsTab()">Delete Selected</button>
        </div>
        <table class="versions-table" style="width:100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border); font-weight: 500;">
              <td style="padding: 8px; width: 32px;"><input type="checkbox" id="vtab-select-all" onchange="vtabToggleAll(this, ${current})"></td>
              <td style="padding: 8px;">Version</td>
              <td style="padding: 8px;">Saved</td>
              <td style="padding: 8px;">Sources</td>
              <td style="padding: 8px; text-align: right;">Actions</td>
            </tr>
          </thead>
          <tbody>
          ${data.versions.map(v => {
            const isCurrent = v.version === current;
            const isPinned = !!v.pinned;
            return `
            <tr style="border-bottom: 1px solid var(--border);${isCurrent ? ' background: var(--bg-hover, rgba(var(--accent-rgb,59,130,246),0.06));' : ''}">
              <td style="padding: 8px;">
                ${!isCurrent ? `<input type="checkbox" class="vtab-checkbox" value="${v.version}" onchange="vtabUpdateBulkBar()">` : ''}
              </td>
              <td style="padding: 8px;">
                v${v.version}
                ${isCurrent ? '<span style="margin-left:6px;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:600;background:var(--success);color:#fff;">Current</span>' : ''}
                ${isPinned ? '<span style="margin-left:6px;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:600;background:rgba(234,179,8,0.2);color:#ca8a04;" title="Pinned — never auto-deleted">📌 Pinned</span>' : ''}
              </td>
              <td style="padding: 8px; font-size: 12px; color: var(--text-muted);">${new Date(v.publishedAt).toLocaleString()}</td>
              <td style="padding: 8px;">${v.sourceCount}</td>
              <td style="padding: 8px; text-align: right; white-space: nowrap;">
                <button class="btn btn-sm btn-secondary" onclick="previewVersion(${v.version})">Preview</button>
                <button class="btn btn-sm ${isPinned ? 'btn-warning' : 'btn-secondary'}" onclick="togglePinVersion(${v.version})" title="${isPinned ? 'Unpin' : 'Pin'}">${isPinned ? 'Unpin' : 'Pin'}</button>
                ${isCurrent ? '' : `<button class="btn btn-sm btn-primary" onclick="restoreVersion(${v.version})">Restore</button>`}
              </td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>`;
    };

    render();
  } catch (err) {
    wrap.innerHTML = '<span style="color:var(--danger)">Failed to load versions.</span>';
  }
}

function vtabToggleAll(cb, currentVersion) {
  document.querySelectorAll('.vtab-checkbox').forEach(c => { c.checked = cb.checked; });
  vtabUpdateBulkBar();
}

function vtabUpdateBulkBar() {
  const checked = [...document.querySelectorAll('.vtab-checkbox:checked')];
  const all = [...document.querySelectorAll('.vtab-checkbox')];
  const info = document.getElementById('vtab-bulk-info');
  const btn = document.getElementById('vtab-bulk-delete');
  const sa = document.getElementById('vtab-select-all');
  if (!info || !btn) return;
  if (checked.length > 0) {
    info.textContent = `${checked.length} selected`;
    info.style.display = '';
    btn.style.display = '';
  } else {
    info.style.display = 'none';
    btn.style.display = 'none';
  }
  if (sa) sa.indeterminate = checked.length > 0 && checked.length < all.length;
}

async function bulkDeleteVersionsTab() {
  const checked = [...document.querySelectorAll('.vtab-checkbox:checked')];
  if (checked.length === 0) return;
  const versions = checked.map(c => parseInt(c.value));
  if (!confirm(`Delete ${versions.length} version${versions.length > 1 ? 's' : ''}? This cannot be undone.`)) return;
  const btn = document.getElementById('vtab-bulk-delete');
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
  try {
    await fetch(`${API}/config/versions`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versions })
    });
    await renderVersionsTabContent();
    await fetchConfigStatus();
  } catch (err) {
    alert('Delete failed: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Delete Selected'; }
  }
}

function renderStatusBar() { /* removed — changes save immediately */ }

async function showVersionHistory() {
  document.getElementById('modal-content').innerHTML = `
    <h2>Version History</h2>
    <div id="versions-list" class="version-table"><span style="color:var(--text-muted)">Loading...</span></div>
    <div class="form-actions" id="version-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
    </div>
  `;
  openModal();
  await loadVersionList();
}

async function loadVersionList() {
  const container = document.getElementById('versions-list');
  const actionsBar = document.getElementById('version-actions');
  if (!container) return;
  container.innerHTML = '<span style="color:var(--text-muted)">Loading...</span>';

  try {
    const res = await fetch(`${API}/config/versions`);
    const data = await res.json();

    if (!data.versions || data.versions.length === 0) {
      container.innerHTML = '<span style="color:var(--text-muted)">No published versions yet</span>';
      return;
    }

    const current = data.currentVersion;
    container.innerHTML = `<table class="versions-table" style="width:100%; border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 1px solid var(--border); font-weight: 500;">
          <td style="padding: 8px; width: 32px;"><input type="checkbox" id="ver-select-all" title="Select all deletable" onchange="toggleSelectAllVersions(this, ${current})"></td>
          <td style="padding: 8px;">Version</td>
          <td style="padding: 8px;">Saved</td>
          <td style="padding: 8px;">Sources</td>
          <td style="padding: 8px; text-align: right;">Actions</td>
        </tr>
      </thead>
      <tbody>
      ${data.versions.map(v => {
        const isCurrent = v.version === current;
        const isPinned = !!v.pinned;
        const canDelete = !isCurrent;
        return `
        <tr style="border-bottom: 1px solid var(--border);${isCurrent ? ' background: var(--bg-hover, rgba(var(--accent-rgb,59,130,246),0.06));' : ''}">
          <td style="padding: 8px;">
            ${canDelete ? `<input type="checkbox" class="ver-checkbox" value="${v.version}" onchange="updateVersionBulkBar()">` : ''}
          </td>
          <td style="padding: 8px;">
            v${v.version}
            ${isCurrent ? '<span style="margin-left:6px;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:600;background:var(--success);color:#fff;">Current</span>' : ''}
            ${isPinned ? '<span style="margin-left:6px;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:600;background:rgba(234,179,8,0.2);color:#ca8a04;" title="Pinned — never auto-deleted">📌 Pinned</span>' : ''}
          </td>
          <td style="padding: 8px; font-size: 12px; color: var(--text-muted);">${new Date(v.publishedAt).toLocaleString()}</td>
          <td style="padding: 8px;">${v.sourceCount}</td>
          <td style="padding: 8px; text-align: right; white-space: nowrap;">
            <button class="btn btn-sm btn-secondary" onclick="previewVersion(${v.version})">Preview</button>
            <button class="btn btn-sm ${isPinned ? 'btn-warning' : 'btn-secondary'}" onclick="togglePinVersion(${v.version})" title="${isPinned ? 'Unpin — allow auto-deletion' : 'Pin — keep forever'}">${isPinned ? 'Unpin' : 'Pin'}</button>
            ${isCurrent ? '' : `<button class="btn btn-sm btn-primary" onclick="restoreVersion(${v.version})">Restore</button>`}
          </td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>`;

    if (actionsBar) {
      actionsBar.innerHTML = `
        <span id="ver-bulk-info" style="color:var(--text-muted);font-size:13px;display:none"></span>
        <button id="ver-bulk-delete-btn" class="btn btn-danger" style="display:none" onclick="bulkDeleteVersions()">Delete Selected</button>
        <button class="btn btn-secondary" onclick="closeModal()">Close</button>`;
    }
  } catch (err) {
    container.innerHTML = '<span style="color:var(--danger)">Failed to load versions.</span>';
  }
}

function toggleSelectAllVersions(cb, currentVersion) {
  document.querySelectorAll('.ver-checkbox').forEach(c => { c.checked = cb.checked; });
  updateVersionBulkBar();
}

function updateVersionBulkBar() {
  const checked = [...document.querySelectorAll('.ver-checkbox:checked')];
  const info = document.getElementById('ver-bulk-info');
  const btn = document.getElementById('ver-bulk-delete-btn');
  const selectAll = document.getElementById('ver-select-all');
  const all = [...document.querySelectorAll('.ver-checkbox')];
  if (!info || !btn) return;
  if (checked.length > 0) {
    info.textContent = `${checked.length} version${checked.length > 1 ? 's' : ''} selected`;
    info.style.display = '';
    btn.style.display = '';
  } else {
    info.style.display = 'none';
    btn.style.display = 'none';
  }
  if (selectAll) selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
}

async function bulkDeleteVersions() {
  const checked = [...document.querySelectorAll('.ver-checkbox:checked')];
  if (checked.length === 0) return;
  const versions = checked.map(c => parseInt(c.value));
  if (!confirm(`Delete ${versions.length} version${versions.length > 1 ? 's' : ''}? This cannot be undone.`)) return;
  const btn = document.getElementById('ver-bulk-delete-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
  try {
    const res = await fetch(`${API}/config/versions`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versions })
    });
    const result = await res.json();
    await loadVersionList();
    await fetchConfigStatus();
  } catch (err) {
    alert('Delete failed: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Delete Selected'; }
  }
}

// ── Version diff helpers ──────────────────────────────────────────────────────

const DIFF_FIELDS = [
  ['name',               'Name'],
  ['dataType',           'Data Type'],
  ['subType',            'Sub Type'],
  ['format',             'Format'],
  ['intervalSeconds',    'Interval (s)'],
  ['volumePerInterval',  'Volume'],
  ['endpointUrls',       'Endpoints'],
  ['fileOutputs',        'File Outputs'],
  ['metadata',           'Metadata'],
];

function stripOps(s) {
  const { enabled, httpEnabled, fileEnabled, active, health, draftOnly, stats, ...rest } = s;
  return {
    ...rest,
    endpointUrls: (rest.endpointUrls || []).map(({ enabled: _e, ...ep }) => ep),
    fileOutputs:  (rest.fileOutputs  || []).map(({ enabled: _e, ...fo }) => fo),
  };
}

function fieldLabel(key, val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object') {
    if (Array.isArray(val)) {
      if (val.length === 0) return '(none)';
      if (key === 'endpointUrls') return val.map(ep => ep.label ? `${ep.label}: ${ep.url}` : ep.url).join(', ');
      if (key === 'fileOutputs')  return val.map(fo => fo.label ? `${fo.label}: ${fo.path}` : fo.path).join(', ');
      return JSON.stringify(val);
    }
    return Object.entries(val).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(', ') || '—';
  }
  return String(val);
}

function computeVersionDiff(vSources, curSources) {
  const vMap  = new Map(vSources.map(s => [s.id, stripOps(s)]));
  const cMap  = new Map(curSources.map(s => [s.id, stripOps(s)]));
  const added = [], removed = [], modified = [], unchanged = [];

  for (const [id, cur] of cMap) {
    if (!vMap.has(id)) { added.push(cur); continue; }
    const v = vMap.get(id);
    const changes = [];
    for (const [key] of DIFF_FIELDS) {
      const vv = JSON.stringify(v[key] ?? null);
      const cv = JSON.stringify(cur[key] ?? null);
      if (vv !== cv) changes.push({ key, from: v[key], to: cur[key] });
    }
    if (changes.length) modified.push({ source: cur, changes });
    else unchanged.push(cur);
  }
  for (const [id, v] of vMap) {
    if (!cMap.has(id)) removed.push(v);
  }
  return { added, removed, modified, unchanged };
}

function renderVersionDiff(diff, versionNum, publishedAt) {
  const { added, removed, modified, unchanged } = diff;
  const total = added.length + removed.length + modified.length + unchanged.length;

  const badge = (label, count, color) => count
    ? `<span class="diff-badge" style="background:${color}">${count} ${label}</span>`
    : '';

  let html = `
    <div class="diff-panel">
      <div class="diff-header">
        <span class="diff-title">v${versionNum} <span class="diff-ts">${new Date(publishedAt).toLocaleString()}</span> vs. <em>current</em></span>
        <span class="diff-summary">
          ${badge('added', added.length, 'rgba(34,197,94,0.2)')}
          ${badge('removed', removed.length, 'rgba(239,68,68,0.2)')}
          ${badge('changed', modified.length, 'rgba(234,179,8,0.2)')}
          ${!added.length && !removed.length && !modified.length ? '<span class="diff-badge" style="background:rgba(148,163,184,0.2)">identical</span>' : ''}
        </span>
      </div>`;

  if (added.length) {
    html += `<div class="diff-group diff-added"><div class="diff-group-label">Added since this version (${added.length})</div>`;
    for (const s of added) html += `<div class="diff-row diff-row-added"><span class="diff-source-name">${escHtml(s.name)}</span> <span class="diff-type">${s.dataType}</span></div>`;
    html += `</div>`;
  }
  if (removed.length) {
    html += `<div class="diff-group diff-removed"><div class="diff-group-label">Removed since this version (${removed.length})</div>`;
    for (const s of removed) html += `<div class="diff-row diff-row-removed"><span class="diff-source-name">${escHtml(s.name)}</span> <span class="diff-type">${s.dataType}</span></div>`;
    html += `</div>`;
  }
  if (modified.length) {
    html += `<div class="diff-group diff-modified"><div class="diff-group-label">Modified since this version (${modified.length})</div>`;
    for (const { source, changes } of modified) {
      html += `<details class="diff-source-block"><summary class="diff-row diff-row-modified"><span class="diff-source-name">${escHtml(source.name)}</span> <span class="diff-type">${source.dataType}</span> <span class="diff-change-count">${changes.length} change${changes.length !== 1 ? 's' : ''}</span></summary>
        <table class="diff-fields-table">`;
      for (const { key, from, to } of changes) {
        const label = DIFF_FIELDS.find(([k]) => k === key)?.[1] || key;
        html += `<tr>
          <td class="diff-field-name">${escHtml(label)}</td>
          <td class="diff-field-from">${escHtml(fieldLabel(key, from))}</td>
          <td class="diff-arrow">→</td>
          <td class="diff-field-to">${escHtml(fieldLabel(key, to))}</td>
        </tr>`;
      }
      html += `</table></details>`;
    }
    html += `</div>`;
  }
  if (unchanged.length && (added.length || removed.length || modified.length)) {
    html += `<div class="diff-group"><div class="diff-group-label diff-unchanged-label">${unchanged.length} source${unchanged.length !== 1 ? 's' : ''} unchanged</div></div>`;
  }

  html += `</div>`;
  return html;
}

async function previewVersion(version) {
  const existing = document.getElementById('version-preview');
  if (existing) existing.remove();

  const preview = document.createElement('div');
  preview.id = 'version-preview';
  preview.innerHTML = `<div class="diff-panel" style="justify-content:center;padding:24px;"><span style="color:var(--text-muted)">Loading diff…</span></div>`;
  document.getElementById('modal-content').appendChild(preview);

  try {
    const res = await fetch(`${API}/config/versions/${version}`);
    const data = await res.json();
    const diff = computeVersionDiff(data.sources || [], state.sources);
    preview.innerHTML = renderVersionDiff(diff, data.version, data.publishedAt);
  } catch (err) {
    preview.innerHTML = `<div class="diff-panel"><span style="color:var(--danger)">Failed to load diff: ${escHtml(err.message)}</span></div>`;
  }
}

async function restoreVersion(version) {
  if (!confirm(`Restore to version ${version}? Current state will be saved as a new version first.`)) return;
  try {
    const res = await fetch(`${API}/config/versions/${version}/restore`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      await fetchSources();
      showVersionHistory();
    } else {
      alert('Failed to restore: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Failed to restore: ' + err.message);
  }
}

async function togglePinVersion(version) {
  try {
    const res = await fetch(`${API}/config/versions/${version}/pin`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showVersionHistory();
    } else {
      alert('Failed to pin version: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Failed to pin version: ' + err.message);
  }
}

function renderSourceCard(source) {
  const healthClass = source.health?.status === 'green' ? 'health-green'
    : source.health?.status === 'red' ? 'health-red'
    : source.health?.status === 'mixed' ? 'health-mixed' : '';
  var fileOutputCount = (source.fileOutputs || []).length;
  var epCount = (source.endpointUrls || []).length;
  var modeBadges = '';
  if (fileOutputCount > 0) modeBadges += ' <span class="badge badge-ep">file' + (fileOutputCount > 1 ? ' ×' + fileOutputCount : '') + '</span>';
  if (epCount > 1) modeBadges += ' <span class="badge badge-ep">' + epCount + ' ep</span>';
  var healthHints = source.draftOnly
    ? '<div class="health-draft-hint">Not published — publish to start sending</div>'
    : '';
  var runningStatus = source.draftOnly
    ? '<span class="status-dot status-dot-draft"></span>Draft only'
    : `<label class="source-run-toggle" onclick="event.stopPropagation()" title="${source.active ? 'Click to stop' : 'Click to start'}">
         <input type="checkbox" ${source.active ? 'checked' : ''} onchange="toggleSource('${source.id}', event)">
         <span class="source-run-slider"></span>
         <span class="source-run-label">${source.active ? 'Running' : 'Stopped'}</span>
       </label>`;

  var stoppedClass = (!source.draftOnly && !source.active) ? 'source-card-stopped' : '';
  const isOtelApp = source.dataType === 'otelApp';
  const typeBadge = isOtelApp
    ? '<span class="badge badge-otel">app</span>'
    : `<span class="badge badge-${source.dataType}">${source.dataType}</span>`;
  const metaLine = isOtelApp
    ? `${escHtml(source.subType)} &middot; logs &amp; traces to file &middot; every ${parseInt(source.intervalSeconds) || 0}s &middot; ${parseInt(source.volumePerInterval) || 0} rec/tick`
    : `${escHtml(source.subType)} &middot; ${escHtml(source.format)} &middot; every ${parseInt(source.intervalSeconds) || 0}s &middot; ${parseInt(source.volumePerInterval) || 0} records`;
  return `
  <div class="source-card ${healthClass} ${stoppedClass}" onclick="showEditForm('${source.id}')">
    <div class="source-card-header">
      <span class="source-card-title">${escHtml(source.name)}</span>
      <div class="source-card-actions">
        ${modeBadges}${typeBadge}
        <div class="kebab-menu-container">
          <button class="kebab-menu-btn" onclick="toggleKebabMenu('${source.id}', event)" title="Options">⋯${(source.health?.status === 'red' || source.health?.status === 'mixed') ? '<span class="kebab-error-dot"></span>' : ''}</button>
          <div class="kebab-menu" id="kebab-menu-${source.id}">
            <button class="kebab-item" onclick="showSourceDetail('${source.id}'); event.stopPropagation();">View Details</button>
            <button class="kebab-item" onclick="showErrorLogs('${source.id}'); event.stopPropagation();">View Errors${(source.health?.status === 'red' || source.health?.status === 'mixed') ? ' <span class="kebab-error-badge">!</span>' : ''}</button>
            <button class="kebab-item" onclick="resetSourceStats('${source.id}', event);">Reset Stats</button>
            <button class="kebab-item kebab-delete" onclick="deleteSourceQuick('${source.id}', event)">Delete</button>
          </div>
        </div>
      </div>
    </div>
    <div class="source-card-meta">${metaLine}</div>
    <div class="source-card-stats">
      <span>${runningStatus}</span>
      <span>${formatNumber(source.stats?.messagesSent || 0)} sent</span>
      <span>${source.stats?.errors || 0} errors</span>
      <span>${source.stats?.lastSentAt ? timeAgo(source.stats.lastSentAt) : 'Never sent'}</span>
      ${source.dataType === 'logs' || isOtelApp ? `<span>${formatBytes(source.stats?.bytesSent || 0)}</span>` : ''}
    </div>${healthHints}
    <div class="source-card-footer">
      ${!isOtelApp ? `<div class="export-toggles" onclick="event.stopPropagation()">
        ${(source.endpointUrls || []).length > 0 ? `
        <div class="export-toggle-section-label">HTTP Endpoints</div>
        <div class="ep-toggles-grid">
          ${(source.endpointUrls || []).map((ep, i) => {
            const epHealth = ep.url
              ? (source.health?.endpoints || []).find(h => h.url === ep.url)
              : (source.health?.endpoints || []).find(h => h.label === ep.label);
            const isEnabled = ep.enabled !== false;
            let healthDot = '';
            if (isEnabled) {
              if (epHealth) {
                const cls = epHealth.status === 'green' ? 'green' : 'red';
                const title = epHealth.error ? escHtml(epHealth.error) : (cls === 'red' ? 'No telemetry sent successfully' : '');
                healthDot = '<span class="toggle-health ' + cls + '" title="' + title + '"></span>';
              } else if (source.active) {
                const hs = source.health?.status;
                const cls = (hs === 'red' || hs === 'mixed') ? 'red' : 'pending';
                const title = cls === 'pending' ? 'Waiting for first result…' : 'No telemetry sent successfully';
                if (cls) healthDot = '<span class="toggle-health ' + cls + '" title="' + title + '"></span>';
              }
            }
            const label = escHtml(ep.label || 'EP' + (i + 1));
            const checked = isEnabled ? 'checked' : '';
            const dimmed = !isEnabled ? 'style="opacity:0.45"' : '';
            return '<div class="export-toggle-item"><span class="export-toggle-label ep-name" title="' + escHtml(ep.url || '') + '" ' + dimmed + '>' + label + '</span>' + healthDot + '<label class="toggle toggle-sm"><input type="checkbox" ' + checked + ' onchange="toggleEndpoint(\'' + source.id + '\',' + i + ',event)"><span class="toggle-slider"></span></label></div>';
          }).join('')}
        </div>` : ''}
        ${(source.fileOutputs || []).length > 0 ? `
        ${(source.endpointUrls || []).length > 0 ? '<div class="ep-channel-divider"></div>' : ''}
        <div class="export-toggle-section-label">Local File</div>
        <div class="ep-toggles-grid">
          ${(source.fileOutputs || []).map((fo, i) => {
            const foEnabled = fo.enabled !== false;
            const fh = fo.path
              ? (source.health?.endpoints || []).find(e => e.url === fo.path)
              : (source.health?.endpoints || []).find(e => e.label === (fo.label || 'File'));
            let fhDot = '';
            if (foEnabled) {
              if (!fo.path) {
                fhDot = '<span class="toggle-health red" title="No file path configured"></span>';
              } else if (fh) {
                const cls = fh.status === 'green' ? 'green' : 'red';
                const ftitle = fh.error ? escHtml(fh.error) : (cls === 'red' ? 'No telemetry sent successfully' : '');
                fhDot = '<span class="toggle-health ' + cls + '" title="' + ftitle + '"></span>';
              } else if (source.active) {
                const hs = source.health?.status;
                const cls = (hs === 'red' || hs === 'mixed') ? 'red' : 'pending';
                const ftitle = cls === 'pending' ? 'Waiting for first result…' : 'No telemetry sent successfully';
                if (cls) fhDot = '<span class="toggle-health ' + cls + '" title="' + ftitle + '"></span>';
              }
            }
            const baseName = fo.path ? (fo.path.split('/').pop() || fo.path) : '';
            const displayName = escHtml(fo.label || baseName || ('File ' + (i + 1)));
            const foPath = escHtml(fo.path || 'No path set');
            const dimmed = !foEnabled ? 'style="opacity:0.45"' : '';
            return '<div class="export-toggle-item"><span class="export-toggle-label ep-name" title="' + foPath + '" ' + dimmed + '>' + displayName + '</span>' + fhDot + '<label class="toggle toggle-sm"><input type="checkbox" ' + (foEnabled ? 'checked' : '') + ' onchange="toggleFileOutput(\'' + source.id + '\',' + i + ',event)"><span class="toggle-slider"></span></label></div>';
          }).join('')}
        </div>` : ''}
      </div>` : ''}
    </div>
  </div>`;
}

function render() {
  for (const page of ['observability', 'security', 'otel']) {
    const pageSources = state.sources.filter(s => getSourcePage(s) === page);

    if (page === 'otel') {
      renderOtelGrid(pageSources);
      continue;
    }

    const grid = document.getElementById(`sources-grid-${page}`);
    if (!grid) continue;

    const filtered = state.filter === 'all'
      ? pageSources
      : pageSources.filter(s => s.dataType === state.filter);

    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 60px 0; color: var(--text-muted);">
        <p style="font-size: 18px; margin-bottom: 8px;">No sources configured</p>
        <p>Click "+ Add Source" to get started</p>
      </div>`;
    } else {
      grid.innerHTML = filtered.map(renderSourceCard).join('');
    }
  }
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

    container.innerHTML = [...data.errors].reverse().map(entry => `
      <div class="error-log-entry">
        <div class="error-log-header">
          <span class="error-log-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
          <span class="error-log-type" style="background: ${entry.type === 'HTTP' ? 'rgba(88,166,255,0.2)' : 'rgba(210,153,34,0.2)'}; color: ${entry.type === 'HTTP' ? 'var(--logs)' : 'var(--metrics)'};">${escHtml(entry.type)}</span>
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
        <div class="value">${source.active ? '<span style="color:var(--success)">Running</span>' : 'Stopped'}</div>
        <div class="label">Status</div>
      </div>
    </div>
    <div class="detail-tabs">
      <button class="detail-tab active" data-tab="config">Configuration</button>
      <button class="detail-tab" data-tab="logs">Recent Data</button>
    </div>
    <div class="tab-panel" id="tab-config">
      <table class="config-table">
        <tr><td>Data Type</td><td>${escHtml(source.dataType)}</td></tr>
        <tr><td>Sub Type</td><td>${escHtml(source.subType)}</td></tr>
        <tr><td>Format</td><td>${escHtml(source.format)}</td></tr>
        <tr><td>Interval</td><td>${state.settings.overrideEnabled
          ? `<span style="color:var(--text-muted)">${state.settings.globalIntervalSeconds}s <span class="override-badge">global</span></span>`
          : `${parseInt(source.intervalSeconds) || 0} seconds`}</td></tr>
        <tr><td>Volume</td><td>${state.settings.overrideEnabled
          ? `<span style="color:var(--text-muted)">${state.settings.globalVolumePerInterval} records/request <span class="override-badge">global</span></span>`
          : `${parseInt(source.volumePerInterval) || 0} records/request`}</td></tr>
        <tr><td>Last Sent</td><td>${source.stats?.lastSentAt ? escHtml(source.stats.lastSentAt) : 'Never'}</td></tr>
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

const SUMO_HEADERS = ['Authorization', 'X-Sumo-Category', 'X-Sumo-Host', 'X-Sumo-Name', 'X-Sumo-Fields', 'X-Sumo-Client'];
const LEVEL_DIST_SUBTYPES = new Set(['apache', 'nginx', 'nginxOtel', 'mysqlOtel', 'kafkaOtel', 'dockerOtel', 'appJson', 'syslog', 'k8sPod', 'cloudtrail', 'microservice', 'custom', 'csiem']);

const PII_TYPES = [
  { value: 'financial', label: 'Financial (credit card, bank account, routing)' },
  { value: 'identity', label: 'Identity (SSN, passport, drivers license, DOB)' },
  { value: 'contact', label: 'Contact (email, phone, address, orders)' },
  { value: 'credentials', label: 'Credentials (API keys, session tokens)' },
  { value: 'comprehensive', label: 'Comprehensive (multi-category exports)' }
];

// ── Headers editor popup ──────────────────────────────────────────────────────

let _hdrEditorCtx = null; // { type:'endpoint'|'source', el: DOMElement }

function initHeadersEditorPopup() {
  if (document.getElementById('hdr-editor-overlay')) return;
  const div = document.createElement('div');
  div.id = 'hdr-editor-overlay';
  div.className = 'hdr-editor-overlay';
  div.innerHTML = `
    <div class="hdr-editor-popup" onclick="event.stopPropagation()">
      <div class="hdr-editor-head">
        <span id="hdr-editor-title">Configure Headers</span>
        <button type="button" class="hdr-editor-close" onclick="closeHeadersEditor()">&times;</button>
      </div>
      <div class="hdr-editor-body">
        <datalist id="hdr-key-suggestions">
          ${SUMO_HEADERS.map(h => `<option value="${h}">`).join('')}
        </datalist>
        <div class="hdr-col-labels"><span>Header Key</span><span>Value</span><span></span></div>
        <div id="hdr-editor-rows"></div>
        <button type="button" class="btn btn-secondary" style="margin-top:12px" onclick="addHeaderEditorRow()">+ Add Header</button>
      </div>
      <div class="hdr-editor-foot">
        <span class="hdr-editor-note" id="hdr-editor-note"></span>
        <div style="display:flex;gap:10px">
          <button type="button" class="btn btn-secondary" onclick="closeHeadersEditor()">Cancel</button>
          <button type="button" class="btn btn-primary" onclick="commitHeadersEditor()">Done</button>
        </div>
      </div>
    </div>`;
  div.addEventListener('click', closeHeadersEditor);
  document.body.appendChild(div);
}

function addHeaderEditorRow(h) {
  h = h || { key: '', value: '' };
  const row = document.createElement('div');
  row.className = 'hdr-row';
  const isSumoFields = h.key === 'X-Sumo-Fields';
  row.innerHTML =
    '<input type="text" class="hdr-key-input" list="hdr-key-suggestions" value="' + escHtml(h.key || '') + '" placeholder="Header name" oninput="onHdrKeyChange(this)">' +
    '<div class="hdr-val-cell">' +
      (isSumoFields
        ? '<div class="hdr-fields-builder"></div>'
        : '<input type="text" class="hdr-val-input" value="' + escHtml(h.value || '') + '" placeholder="Value">') +
    '</div>' +
    '<button type="button" class="hdr-row-remove" onclick="this.closest(\'.hdr-row\').remove()">&times;</button>';
  if (isSumoFields) {
    buildFieldsBuilder(row.querySelector('.hdr-fields-builder'), h.value || '');
  }
  document.getElementById('hdr-editor-rows').appendChild(row);
  if (!h.key) row.querySelector('.hdr-key-input').focus();
}

function onHdrKeyChange(input) {
  const row = input.closest('.hdr-row');
  const cell = row.querySelector('.hdr-val-cell');
  const isFields = input.value === 'X-Sumo-Fields';
  const wasFields = !!cell.querySelector('.hdr-fields-builder');
  if (isFields && !wasFields) {
    cell.innerHTML = '<div class="hdr-fields-builder"></div>';
    buildFieldsBuilder(cell.querySelector('.hdr-fields-builder'), '');
  } else if (!isFields && wasFields) {
    cell.innerHTML = '<input type="text" class="hdr-val-input" placeholder="Value">';
  }
}

function buildFieldsBuilder(builderEl, value) {
  builderEl.innerHTML =
    '<div class="hdr-fields-rows"></div>' +
    '<button type="button" class="hdr-add-field" onclick="addHdrFieldRow(this)">+ Add Field</button>';
  const rowsEl = builderEl.querySelector('.hdr-fields-rows');
  if (value) {
    value.split(',').forEach(pair => {
      const idx = pair.indexOf('=');
      const k = idx >= 0 ? pair.slice(0, idx).trim() : pair.trim();
      const v = idx >= 0 ? pair.slice(idx + 1).trim() : '';
      if (k || v) appendFieldRow(rowsEl, k, v);
    });
  }
  if (rowsEl.children.length === 0) appendFieldRow(rowsEl, '', '');
}

function appendFieldRow(rowsEl, k, v) {
  const row = document.createElement('div');
  row.className = 'hdr-field-row';
  row.innerHTML =
    '<input type="text" class="hdr-field-key" value="' + escHtml(k || '') + '" placeholder="field">' +
    '<span class="hdr-field-eq">=</span>' +
    '<input type="text" class="hdr-field-val" value="' + escHtml(v || '') + '" placeholder="value">' +
    '<button type="button" class="hdr-field-remove" onclick="this.closest(\'.hdr-field-row\').remove()">&times;</button>';
  rowsEl.appendChild(row);
}

function addHdrFieldRow(btn) {
  const rowsEl = btn.previousElementSibling;
  appendFieldRow(rowsEl, '', '');
  rowsEl.lastElementChild.querySelector('.hdr-field-key').focus();
}

function openHeadersEditor(ctx, title, note) {
  initHeadersEditorPopup();
  _hdrEditorCtx = ctx;
  document.getElementById('hdr-editor-title').textContent = title;
  document.getElementById('hdr-editor-note').textContent = note || '';
  const rowsEl = document.getElementById('hdr-editor-rows');
  rowsEl.innerHTML = '';
  const headers = JSON.parse(ctx.el.dataset.headers || '[]');
  headers.forEach(h => addHeaderEditorRow(h));
  document.getElementById('hdr-editor-overlay').classList.add('open');
}

function openEndpointHeadersEditor(btn) {
  const row = btn.closest('.endpoint-row');
  const label = row.querySelector('.ep-label')?.value || 'Endpoint';
  openHeadersEditor(
    { type: 'endpoint', el: row },
    'Headers — ' + label,
    'These headers are sent only for this endpoint.'
  );
}

function openSourceHeadersEditor() {
  const el = document.getElementById('source-headers-holder');
  openHeadersEditor(
    { type: 'source', el },
    'Source Headers',
    'Applied to all endpoints. Endpoint headers override these on the same key.'
  );
}

function closeHeadersEditor() {
  const overlay = document.getElementById('hdr-editor-overlay');
  if (overlay) overlay.classList.remove('open');
  _hdrEditorCtx = null;
}

function commitHeadersEditor() {
  if (!_hdrEditorCtx) return;
  const rows = document.querySelectorAll('#hdr-editor-rows .hdr-row');
  const headers = [];
  rows.forEach(row => {
    const key = row.querySelector('.hdr-key-input').value.trim();
    if (!key) return;
    const builder = row.querySelector('.hdr-fields-builder');
    let value;
    if (builder) {
      const pairs = [];
      builder.querySelectorAll('.hdr-field-row').forEach(fr => {
        const k = fr.querySelector('.hdr-field-key').value.trim();
        const v = fr.querySelector('.hdr-field-val').value.trim();
        if (k) pairs.push(v ? k + '=' + v : k);
      });
      value = pairs.join(',');
    } else {
      value = row.querySelector('.hdr-val-input')?.value || '';
    }
    headers.push({ key, value });
  });
  const ctx = _hdrEditorCtx;
  ctx.el.dataset.headers = JSON.stringify(headers);
  if (ctx.type === 'endpoint') {
    const btn = ctx.el.querySelector('.btn-ep-headers');
    if (btn) {
      btn.textContent = headers.length > 0 ? 'Headers (' + headers.length + ')' : 'Headers';
      btn.classList.toggle('has-headers', headers.length > 0);
    }
  } else {
    updateSourceHeadersBadge(headers);
  }
  closeHeadersEditor();
}

function updateSourceHeadersBadge(headers) {
  const btn = document.getElementById('source-headers-btn');
  if (!btn) return;
  btn.textContent = headers.length > 0 ? 'Headers (' + headers.length + ')' : 'Configure Headers';
  btn.classList.toggle('has-headers', headers.length > 0);
}

// ── Endpoint row (simplified — headers stored in data-headers attr) ───────────

function renderEndpointRow(ep, i) {
  const headers = ep.headers || [];
  const headersJson = escHtml(JSON.stringify(headers));
  const hasHeaders = headers.length > 0;
  return '<div class="endpoint-row" data-idx="' + i + '" data-headers="' + headersJson + '">' +
    '<input type="text" class="ep-label" value="' + escHtml(ep.label || 'Endpoint') + '" placeholder="Label">' +
    '<input type="url" class="ep-url" value="' + escHtml(ep.url || '') + '" placeholder="https://...sumologic.com/.../TOKEN">' +
    '<label class="toggle toggle-sm"><input type="checkbox" class="ep-enabled" ' + (ep.enabled !== false ? 'checked' : '') + '><span class="toggle-slider"></span></label>' +
    '<button type="button" class="btn-ep-headers' + (hasHeaders ? ' has-headers' : '') + '" onclick="openEndpointHeadersEditor(this)">' +
    (hasHeaders ? 'Headers (' + headers.length + ')' : 'Headers') + '</button>' +
    '<button type="button" class="btn-remove-ep" onclick="removeEndpoint(this)">&times;</button>' +
    '</div>';
}

function renderLevelDistSection(source) {
  const dataType = source?.dataType || 'logs';
  const subType = source?.subType || '';
  if (dataType !== 'logs') return '<div id="level-dist-section" class="hidden"></div>';

  if (subType === 'pii') {
    const selected = source?.piiTypes || PII_TYPES.map(pt => pt.value);
    return `<div id="level-dist-section" class="form-group">
      <label>PII Types to Include <small style="font-weight:400;color:var(--text-muted)">(uncheck to exclude)</small></label>
      <div class="level-dist-grid" style="grid-template-columns:1fr 1fr">
        ${PII_TYPES.map(pt => `
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:4px 0;font-size:13px">
            <input type="checkbox" name="pii_type_${pt.value}" ${selected.includes(pt.value) ? 'checked' : ''}>
            ${pt.label}
          </label>`).join('')}
      </div>
    </div>`;
  }

  if (subType === 'csiem') {
    const dist = source?.severityDistribution || { low: 20, medium: 40, high: 30, critical: 10 };
    return `<div id="level-dist-section" class="form-group">
      <label>Severity Distribution <small style="font-weight:400;color:var(--text-muted)">(relative weights)</small></label>
      <div class="level-dist-grid">
        <div class="level-dist-row"><span class="level-badge level-low">LOW</span><input type="number" class="level-dist-input" name="sev_low" value="${dist.low ?? 20}" min="0" max="100"></div>
        <div class="level-dist-row"><span class="level-badge level-medium">MEDIUM</span><input type="number" class="level-dist-input" name="sev_medium" value="${dist.medium ?? 40}" min="0" max="100"></div>
        <div class="level-dist-row"><span class="level-badge level-high">HIGH</span><input type="number" class="level-dist-input" name="sev_high" value="${dist.high ?? 30}" min="0" max="100"></div>
        <div class="level-dist-row"><span class="level-badge level-critical">CRITICAL</span><input type="number" class="level-dist-input" name="sev_critical" value="${dist.critical ?? 10}" min="0" max="100"></div>
      </div>
    </div>`;
  }

  if (!LEVEL_DIST_SUBTYPES.has(subType)) return '<div id="level-dist-section" class="hidden"></div>';

  const dist = source?.levelDistribution || { info: 60, warn: 15, error: 10, debug: 15 };
  return `<div id="level-dist-section" class="form-group">
    <label>Level Distribution <small style="font-weight:400;color:var(--text-muted)">(relative weights)</small></label>
    <div class="level-dist-grid">
      <div class="level-dist-row"><span class="level-badge level-info">INFO</span><input type="number" class="level-dist-input" name="lvl_info" value="${dist.info ?? 60}" min="0" max="100"></div>
      <div class="level-dist-row"><span class="level-badge level-warn">WARN</span><input type="number" class="level-dist-input" name="lvl_warn" value="${dist.warn ?? 15}" min="0" max="100"></div>
      <div class="level-dist-row"><span class="level-badge level-error">ERROR</span><input type="number" class="level-dist-input" name="lvl_error" value="${dist.error ?? 10}" min="0" max="100"></div>
      <div class="level-dist-row"><span class="level-badge level-debug">DEBUG</span><input type="number" class="level-dist-input" name="lvl_debug" value="${dist.debug ?? 15}" min="0" max="100"></div>
    </div>
  </div>`;
}

function buildInitialSourceHeaders(source) {
  const headers = [];
  const added = new Set();
  // Seed from metadata for backward compat — show X-Sumo-Category/Host at top
  if (source?.metadata?.sourceCategory) {
    headers.push({ key: 'X-Sumo-Category', value: source.metadata.sourceCategory });
    added.add('X-Sumo-Category');
  }
  if (source?.metadata?.sourceHost) {
    headers.push({ key: 'X-Sumo-Host', value: source.metadata.sourceHost });
    added.add('X-Sumo-Host');
  }
  // Merge explicit source.headers — explicit wins on same key
  for (const h of (source?.headers || [])) {
    if (added.has(h.key)) {
      const idx = headers.findIndex(x => x.key === h.key);
      if (idx >= 0) headers[idx] = h;
    } else {
      headers.push(h);
      added.add(h.key);
    }
  }
  return headers;
}

function showAddForm(page) {
  document.getElementById('modal-content').innerHTML = renderForm(null, page || null);
  openModal();
  setupFormListeners(page || null);
}

function showEditForm(id) {
  const source = state.sources.find(s => s.id === id);
  if (!source) return;
  if (source.dataType === 'otelApp') {
    showOtelAppEditModal(source);
    return;
  }
  document.getElementById('modal-content').innerHTML = renderForm(source, null);
  openModal();
  setupFormListeners(null);
}

function renderForm(source, page) {
  const isEdit = !!source;
  const pageDTs = page ? getPageDataTypes(page) : ['logs', 'metrics', 'traces'];
  const dataType = source?.dataType || pageDTs[0] || 'logs';
  const httpEnabled = source?.httpEnabled !== false;
  const fileEnabled = !!source?.fileEnabled;
  const activeTab = fileEnabled && !httpEnabled ? 'file' : 'http';
  const initialSourceHeaders = buildInitialSourceHeaders(source);
  const subTypes = page ? getPageSubTypes(page, dataType) : SUB_TYPES[dataType];

  const dtLabels = { logs: 'Logs', metrics: 'Metrics', traces: 'Traces' };

  return `
    <h2>${isEdit ? 'Edit Source' : 'Add New Source'}</h2>
    <form id="source-form" data-id="${source?.id || ''}" data-page="${page || ''}">
      <div class="form-group">
        <label>Name</label>
        <input type="text" name="name" value="${escHtml(source?.name || '')}" placeholder="My Source" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Data Type</label>
          <select name="dataType" id="form-dataType">
            ${pageDTs.map(dt =>
              `<option value="${dt}" ${dataType === dt ? 'selected' : ''}>${dtLabels[dt]}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Sub Type</label>
          <select name="subType" id="form-subType">
            ${subTypes.map(st =>
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
            ${(source?.endpointUrls || [{ url: '', label: 'Primary', enabled: true, headers: [] }]).map((ep, i) =>
              renderEndpointRow(ep, i)
            ).join('')}
          </div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="addEndpoint()">+ Add Endpoint</button>
        </div>
        <div class="form-group">
          <div class="source-headers-bar">
            <div>
              <div class="source-headers-label">Source-Level Headers</div>
              <div class="source-headers-hint">Applied to all endpoints. Use X-Sumo-Category / X-Sumo-Host here. Per-endpoint headers override on same key.</div>
            </div>
            <button type="button" id="source-headers-btn"
              class="btn-ep-headers${initialSourceHeaders.length > 0 ? ' has-headers' : ''}"
              onclick="openSourceHeadersEditor()">
              ${initialSourceHeaders.length > 0 ? 'Headers (' + initialSourceHeaders.length + ')' : 'Configure Headers'}
            </button>
          </div>
          <div id="source-headers-holder" data-headers="${escHtml(JSON.stringify(initialSourceHeaders))}"></div>
        </div>
      </div>

      <div id="ctab-file" class="cfg-tab-panel ${activeTab !== 'file' ? 'hidden' : ''}">
        <div class="form-group">
          <label>File Outputs</label>
          <div id="file-outputs-list">
            ${((source?.fileOutputs || []).length > 0 ? source.fileOutputs : [{ path: '', label: 'File', enabled: true }]).map((fo, i) =>
              '<div class="endpoint-row" data-idx="' + i + '">' +
              '<input type="text" class="fo-label" value="' + escHtml(fo.label || 'File') + '" placeholder="Label" style="max-width:90px">' +
              '<input type="text" class="fo-path" value="' + escHtml(fo.path || '') + '" placeholder="/tmp/telemetry.log">' +
              '<label class="toggle toggle-sm"><input type="checkbox" class="fo-enabled" ' + (fo.enabled !== false ? 'checked' : '') + '><span class="toggle-slider"></span></label>' +
              '<button type="button" class="btn-remove-ep" onclick="removeFileOutput(this)">&times;</button>' +
              '</div>'
            ).join('')}
          </div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="addFileOutput()">+ Add File</button>
          <small style="color:var(--text-muted);font-size:11px;margin-top:6px;display:block;">Rotation: 10MB max · 2 files · auto-cleanup after 1 day · path must be writable</small>
        </div>
      </div>

      ${state.settings.overrideEnabled ? `
      <div class="form-override-notice">
        <span class="form-override-icon">⚙</span>
        Global override is enforced — interval and volume are controlled by Settings and cannot be edited per source.
        <span class="form-override-values">Effective: ${state.settings.globalIntervalSeconds}s interval · ${state.settings.globalVolumePerInterval} records/request</span>
      </div>
      <div class="form-row form-row-disabled">
        <div class="form-group">
          <label>Interval (seconds)</label>
          <input type="number" name="intervalSeconds" value="${source?.intervalSeconds || 10}" min="1" max="3600" disabled readonly>
        </div>
        <div class="form-group">
          <label>Volume (records/request)</label>
          <input type="number" name="volumePerInterval" value="${source?.volumePerInterval || 50}" min="1" max="10000" disabled readonly>
        </div>
      </div>` : `
      <div class="form-row">
        <div class="form-group">
          <label>Interval (seconds)</label>
          <input type="number" name="intervalSeconds" value="${source?.intervalSeconds || 10}" min="1" max="3600">
        </div>
        <div class="form-group">
          <label>Volume (records/request)</label>
          <input type="number" name="volumePerInterval" value="${source?.volumePerInterval || 50}" min="1" max="10000">
        </div>
      </div>`}
      ${renderLevelDistSection(source)}
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Add Source'}</button>
      </div>
    </form>
  `;
}

function setupFormListeners(page) {
  const dataTypeSelect = document.getElementById('form-dataType');
  const subTypeSelect = document.getElementById('form-subType');
  const formatSelect = document.getElementById('form-format');

  function updateLevelDistSection() {
    const dt = dataTypeSelect.value;
    const st = subTypeSelect.value;
    const section = document.getElementById('level-dist-section');
    if (!section) return;
    if (dt !== 'logs') {
      section.className = 'hidden';
      section.innerHTML = '';
      return;
    }
    if (st === 'pii') {
      section.className = 'form-group';
      section.innerHTML = '<label>PII Types to Include <small style="font-weight:400;color:var(--text-muted)">(uncheck to exclude)</small></label>' +
        '<div class="level-dist-grid" style="grid-template-columns:1fr 1fr">' +
        PII_TYPES.map(pt =>
          '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:4px 0;font-size:13px">' +
          '<input type="checkbox" name="pii_type_' + pt.value + '" checked>' + pt.label + '</label>'
        ).join('') + '</div>';
      return;
    }
    if (st === 'csiem') {
      section.className = 'form-group';
      section.innerHTML = '<label>Severity Distribution <small style="font-weight:400;color:var(--text-muted)">(relative weights)</small></label>' +
        '<div class="level-dist-grid">' +
        '<div class="level-dist-row"><span class="level-badge level-low">LOW</span><input type="number" class="level-dist-input" name="sev_low" value="20" min="0" max="100"></div>' +
        '<div class="level-dist-row"><span class="level-badge level-medium">MEDIUM</span><input type="number" class="level-dist-input" name="sev_medium" value="40" min="0" max="100"></div>' +
        '<div class="level-dist-row"><span class="level-badge level-high">HIGH</span><input type="number" class="level-dist-input" name="sev_high" value="30" min="0" max="100"></div>' +
        '<div class="level-dist-row"><span class="level-badge level-critical">CRITICAL</span><input type="number" class="level-dist-input" name="sev_critical" value="10" min="0" max="100"></div>' +
        '</div>';
      return;
    }
    if (!LEVEL_DIST_SUBTYPES.has(st)) {
      section.className = 'hidden';
      section.innerHTML = '';
      return;
    }
    section.className = 'form-group';
    section.innerHTML = '<label>Level Distribution <small style="font-weight:400;color:var(--text-muted)">(relative weights)</small></label>' +
      '<div class="level-dist-grid">' +
      '<div class="level-dist-row"><span class="level-badge level-info">INFO</span><input type="number" class="level-dist-input" name="lvl_info" value="60" min="0" max="100"></div>' +
      '<div class="level-dist-row"><span class="level-badge level-warn">WARN</span><input type="number" class="level-dist-input" name="lvl_warn" value="15" min="0" max="100"></div>' +
      '<div class="level-dist-row"><span class="level-badge level-error">ERROR</span><input type="number" class="level-dist-input" name="lvl_error" value="10" min="0" max="100"></div>' +
      '<div class="level-dist-row"><span class="level-badge level-debug">DEBUG</span><input type="number" class="level-dist-input" name="lvl_debug" value="15" min="0" max="100"></div>' +
      '</div>';
  }

  dataTypeSelect.addEventListener('change', () => {
    const dt = dataTypeSelect.value;
    const sts = page ? getPageSubTypes(page, dt) : SUB_TYPES[dt];
    subTypeSelect.innerHTML = sts.map(st =>
      `<option value="${st.value}">${st.label}</option>`
    ).join('');
    formatSelect.innerHTML = FORMATS[dt].map(f =>
      `<option value="${f.value}">${f.label}</option>`
    ).join('');
    updateLevelDistSection();
  });

  subTypeSelect.addEventListener('change', updateLevelDistSection);

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
    document.querySelectorAll('#endpoints-list .endpoint-row').forEach(row => {
      const headers = JSON.parse(row.dataset.headers || '[]');
      endpointUrls.push({
        label: row.querySelector('.ep-label').value || 'Endpoint',
        url: row.querySelector('.ep-url').value,
        enabled: row.querySelector('.ep-enabled').checked,
        headers
      });
    });
    const sourceHeaders = JSON.parse(document.getElementById('source-headers-holder')?.dataset.headers || '[]');
    const fileOutputs = [];
    document.querySelectorAll('#file-outputs-list .endpoint-row').forEach(row => {
      fileOutputs.push({
        label: row.querySelector('.fo-label').value || 'File',
        path: row.querySelector('.fo-path').value,
        enabled: row.querySelector('.fo-enabled').checked
      });
    });
    const subType = form.elements['subType'].value;
    const dataType = form.elements['dataType'].value;
    let levelDistribution = null;
    let severityDistribution = null;
    let piiTypes = null;
    if (dataType === 'logs') {
      if (subType === 'csiem') {
        severityDistribution = {
          low: parseInt(form.elements['sev_low']?.value) || 0,
          medium: parseInt(form.elements['sev_medium']?.value) || 0,
          high: parseInt(form.elements['sev_high']?.value) || 0,
          critical: parseInt(form.elements['sev_critical']?.value) || 0
        };
      } else if (subType === 'pii') {
        piiTypes = PII_TYPES
          .filter(pt => form.elements[`pii_type_${pt.value}`]?.checked)
          .map(pt => pt.value);
        if (piiTypes.length === 0) piiTypes = PII_TYPES.map(pt => pt.value);
      } else if (LEVEL_DIST_SUBTYPES.has(subType)) {
        levelDistribution = {
          info: parseInt(form.elements['lvl_info']?.value) || 0,
          warn: parseInt(form.elements['lvl_warn']?.value) || 0,
          error: parseInt(form.elements['lvl_error']?.value) || 0,
          debug: parseInt(form.elements['lvl_debug']?.value) || 0
        };
      }
    }
    const formData = {
      name: form.elements['name'].value,
      dataType,
      subType,
      format: form.elements['format'].value,
      fileOutputs,
      filePath: fileOutputs[0]?.path || '',
      endpointUrls,
      intervalSeconds: parseInt(form.intervalSeconds.value),
      volumePerInterval: parseInt(form.volumePerInterval.value),
      metadata: {
        sourceCategory: sourceHeaders.find(h => h.key === 'X-Sumo-Category')?.value || '',
        sourceHost: sourceHeaders.find(h => h.key === 'X-Sumo-Host')?.value || ''
      },
      ...(levelDistribution ? { levelDistribution } : {}),
      ...(severityDistribution ? { severityDistribution } : {}),
      ...(piiTypes ? { piiTypes } : {}),
      headers: sourceHeaders
    };
    saveSource(formData, id);
  });
}

function addEndpoint() {
  var list = document.getElementById('endpoints-list');
  var idx = list.children.length;
  var ep = { label: 'Endpoint ' + (idx + 1), url: '', enabled: true, headers: [] };
  var wrapper = document.createElement('div');
  wrapper.innerHTML = renderEndpointRow(ep, idx);
  list.appendChild(wrapper.firstElementChild);
}

function removeEndpoint(btn) {
  var row = btn.closest('.endpoint-row');
  var list = document.getElementById('endpoints-list');
  if (list.children.length > 1) {
    row.remove();
  }
}


function addFileOutput() {
  var list = document.getElementById('file-outputs-list');
  var idx = list.children.length;
  var row = document.createElement('div');
  row.className = 'endpoint-row';
  row.dataset.idx = idx;
  row.innerHTML = '<input type="text" class="fo-label" value="File ' + (idx + 1) + '" placeholder="Label" style="max-width:90px">' +
    '<input type="text" class="fo-path" value="" placeholder="/tmp/telemetry.log">' +
    '<label class="toggle toggle-sm"><input type="checkbox" class="fo-enabled" checked><span class="toggle-slider"></span></label>' +
    '<button type="button" class="btn-remove-ep" onclick="removeFileOutput(this)">&times;</button>';
  list.appendChild(row);
}

function removeFileOutput(btn) {
  var row = btn.closest('.endpoint-row');
  var list = document.getElementById('file-outputs-list');
  if (list.children.length > 1) {
    row.remove();
  }
}

function openModal() {
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
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

// ─── Settings & tab navigation ────────────────────────────────────────────────

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland'
];

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.sidebar-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tab);
  });
  document.querySelectorAll('.app-tab').forEach(el => {
    el.classList.toggle('hidden', el.id !== `tab-${tab}`);
  });
  if (tab === 'settings') renderSettingsPage();
  if (tab === 'versions') renderVersionsTabContent();
  pushUrlState();
}

async function fetchSettings() {
  try {
    const res = await fetch(`${API}/settings`);
    state.settings = await res.json();
    applySettingsToUI();
  } catch (err) {
    console.error('Failed to fetch settings:', err);
  }
}

async function saveSettings(updates) {
  try {
    const res = await fetch(`${API}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || res.statusText);
    }
    state.settings = await res.json();
    applySettingsToUI();
    return true;
  } catch (err) {
    alert('Failed to save settings: ' + err.message);
    return false;
  }
}

function applySettingsToUI() {
  const name = state.settings.appName || 'Telemetry Generator';
  document.title = name;
  const sidebarName = document.getElementById('sidebar-app-name');
  if (sidebarName) sidebarName.textContent = name;
}

function renderSettingsPage() {
  const s = state.settings;
  const tzOptions = TIMEZONES.map(tz =>
    `<option value="${tz}"${tz === s.timezone ? ' selected' : ''}>${tz}</option>`
  ).join('');

  const overrideOn = !!s.overrideEnabled;

  document.getElementById('settings-content').innerHTML = `
    <div class="settings-page">
      <div class="settings-section">
        <div class="settings-section-title">Application</div>
        <div class="settings-row">
          <label class="settings-label" for="setting-appname">Application Name</label>
          <span class="settings-description">Displayed in the page title and sidebar.</span>
          <input id="setting-appname" class="settings-input" type="text" value="${escHtml(s.appName || '')}" placeholder="Telemetry Generator" maxlength="80">
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">Timezone</div>
        <div class="settings-row">
          <label class="settings-label" for="setting-timezone">Timezone</label>
          <span class="settings-description">Applied to timestamps in generated telemetry logs.</span>
          <select id="setting-timezone" class="settings-input">${tzOptions}</select>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">Version History</div>
        <div class="settings-row">
          <label class="settings-label" for="setting-maxversions">Versions to Keep</label>
          <span class="settings-description">Number of published snapshots retained. Oldest versions are deleted automatically on publish. (1–100)</span>
          <input id="setting-maxversions" class="settings-input" type="number" min="1" max="100" value="${s.maxVersions || 10}">
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">
          Global Override
          <label class="settings-toggle-label" title="When enabled, all sources use the interval and volume set below instead of their own values.">
            <input type="checkbox" id="setting-override-enabled" ${overrideOn ? 'checked' : ''}>
            <span class="settings-toggle-track"><span class="settings-toggle-thumb"></span></span>
          </label>
        </div>
        <span class="settings-description" style="margin-bottom:12px;display:block;">When enabled, all sources ignore their own interval and volume and use the values below.</span>
        <div class="settings-row settings-override-fields${overrideOn ? '' : ' settings-override-disabled'}">
          <label class="settings-label" for="setting-global-interval">Interval (seconds)</label>
          <span class="settings-description">How often every source generates and sends data. (1–86400)</span>
          <input id="setting-global-interval" class="settings-input" type="number" min="1" max="86400" value="${s.globalIntervalSeconds || 10}" ${overrideOn ? '' : 'disabled'}>
        </div>
        <div class="settings-row settings-override-fields${overrideOn ? '' : ' settings-override-disabled'}">
          <label class="settings-label" for="setting-global-volume">Volume per Interval</label>
          <span class="settings-description">Number of records every source generates per tick. (1–10000)</span>
          <input id="setting-global-volume" class="settings-input" type="number" min="1" max="10000" value="${s.globalVolumePerInterval || 50}" ${overrideOn ? '' : 'disabled'}>
        </div>
      </div>
      <div class="settings-save-row">
        <button class="btn btn-primary" id="btn-save-settings">Save Settings</button>
        <span class="settings-saved-indicator" id="settings-saved-indicator">Saved</span>
      </div>
    </div>
  `;

  // Toggle enables/disables the override input fields immediately
  document.getElementById('setting-override-enabled').addEventListener('change', (e) => {
    const on = e.target.checked;
    document.querySelectorAll('.settings-override-fields').forEach(el => {
      el.classList.toggle('settings-override-disabled', !on);
    });
    document.getElementById('setting-global-interval').disabled = !on;
    document.getElementById('setting-global-volume').disabled = !on;
  });

  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const appName = document.getElementById('setting-appname').value.trim();
    const timezone = document.getElementById('setting-timezone').value;
    const maxVersions = parseInt(document.getElementById('setting-maxversions').value, 10);
    const overrideEnabled = document.getElementById('setting-override-enabled').checked;
    const globalIntervalSeconds = parseInt(document.getElementById('setting-global-interval').value, 10);
    const globalVolumePerInterval = parseInt(document.getElementById('setting-global-volume').value, 10);
    const ok = await saveSettings({ appName, timezone, maxVersions, overrideEnabled, globalIntervalSeconds, globalVolumePerInterval });
    if (ok) {
      const ind = document.getElementById('settings-saved-indicator');
      if (ind) {
        ind.classList.add('visible');
        setTimeout(() => ind.classList.remove('visible'), 2000);
      }
    }
  });
}

// ── OTel app edit modal (tabbed: Settings | OTel Collector Config) ────────────

function showOtelAppEditModal(source) {
  const info = OTEL_APP_SUBTYPES.find(o => o.value === source.subType) || OTEL_APP_SUBTYPES[0];

  const pathRows = (info.signals || []).map(sig => {
    const pathText = escHtml(sig.filePath || sig.displayPath || '');
    const note = (!sig.filePath && !sig.displayPath) ? '<span class="otel-info-note">always live (metricsServer)</span>' : '';
    return `<div class="otel-path-row">
      <span class="badge badge-${sig.dataType}">${sig.dataType}</span>
      ${sig.label ? `<span class="otel-path-label">${escHtml(sig.label)}</span>` : ''}
      <code class="otel-path-value">${pathText}</code>
      ${note}
    </div>`;
  }).join('');

  document.getElementById('modal-content').innerHTML = `
    <h2>${escHtml(info.label)} — OTel App</h2>
    <div class="modal-tabs">
      <button class="modal-tab active" onclick="switchModalTab('otel-settings', this)">Settings</button>
      <button class="modal-tab" onclick="switchModalTab('otel-collector-cfg', this)">OTel Collector Config</button>
    </div>

    <div id="modal-tab-otel-settings" class="modal-tab-content">
      <form id="otel-edit-form">
        <div class="form-group">
          <label>Name</label>
          <input type="text" name="name" value="${escHtml(source.name)}" required>
        </div>
        ${state.settings.overrideEnabled ? `
        <div class="form-override-notice">
          <span class="form-override-icon">⚙</span>
          Global override is enforced — interval and volume are controlled by Settings.
          <span class="form-override-values">Effective: ${state.settings.globalIntervalSeconds}s interval · ${state.settings.globalVolumePerInterval} records/tick</span>
        </div>
        <div class="form-row form-row-disabled">
          <div class="form-group">
            <label>Interval (seconds)</label>
            <input type="number" name="intervalSeconds" value="${source.intervalSeconds || 10}" min="1" max="3600" disabled readonly>
          </div>
          <div class="form-group">
            <label>Volume (records / tick)</label>
            <input type="number" name="volumePerInterval" value="${source.volumePerInterval || 50}" min="1" max="10000" disabled readonly>
          </div>
        </div>` : `
        <div class="form-row">
          <div class="form-group">
            <label>Interval (seconds)</label>
            <input type="number" name="intervalSeconds" value="${source.intervalSeconds || 10}" min="1" max="3600">
          </div>
          <div class="form-group">
            <label>Volume (records / tick)</label>
            <input type="number" name="volumePerInterval" value="${source.volumePerInterval || 50}" min="1" max="10000">
          </div>
        </div>`}
        <div class="otel-section">
          <div class="otel-section-header">
            <span class="otel-section-title">Output paths</span>
            <span class="otel-section-desc">Fixed standard paths — logs and traces written to file; metrics served on Prometheus port.</span>
          </div>
          <div class="otel-path-rows">${pathRows}</div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button type="button" class="btn btn-danger" onclick="deleteSourceQuick('${source.id}', event)">Delete</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </div>

    <div id="modal-tab-otel-collector-cfg" class="modal-tab-content hidden">
      ${renderOtelConfigTab(info, source)}
    </div>`;

  openModal();

  document.getElementById('otel-edit-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const updates = {
      name: form.elements['name'].value.trim(),
      intervalSeconds: parseInt(form.elements['intervalSeconds'].value) || 10,
      volumePerInterval: parseInt(form.elements['volumePerInterval'].value) || 50
    };
    try {
      const resp = await fetch(`${API}/sources/${source.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...source, ...updates })
      });
      if (!resp.ok) throw new Error(await resp.text());
      closeModal();
      await fetchSources();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }
  });
}

function switchModalTab(tabId, btn) {
  btn.closest('.modal-tabs').querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const panel = btn.closest('.modal-content-wrapper, #modal-content');
  panel.querySelectorAll('.modal-tab-content').forEach(c => c.classList.add('hidden'));
  document.getElementById(`modal-tab-${tabId}`)?.classList.remove('hidden');
}

async function copyOtelConfig(subType, btn) {
  const info = OTEL_APP_SUBTYPES.find(o => o.value === subType);
  if (!info) return;
  const pre = document.getElementById('otel-cfg-pre');
  const configType = pre?.dataset.configType || 'self';
  const config = (configType === 'managed' && info.sumoConfigManaged) ? info.sumoConfigManaged : info.sumoConfig;
  if (!config) return;
  try {
    await navigator.clipboard.writeText(config);
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  } catch (_) {
    alert('Copy failed — select the text manually.');
  }
}

function renderOtelConfigTab(info, source) {
  const hasManaged = !!info.sumoConfigManaged;
  const defaultType = hasManaged ? 'managed' : 'self';
  const defaultConfig = hasManaged ? info.sumoConfigManaged : info.sumoConfig;

  const toggleHtml = hasManaged ? `
    <div class="config-type-toggle">
      <button class="config-type-btn${defaultType === 'self' ? ' active' : ''}" onclick="switchOtelConfigType('self', this, '${source.subType}')">Self-Managed</button>
      <button class="config-type-btn${defaultType === 'managed' ? ' active' : ''}" onclick="switchOtelConfigType('managed', this, '${source.subType}')">Remotely Managed</button>
    </div>` : '';

  const introHtml = hasManaged
    ? `<p class="otel-config-intro" id="otel-cfg-intro">Remotely managed — exporter is <code>sumologic</code>, routing handled by the Sumo Logic extension.</p>`
    : `<p class="otel-config-intro">Apply this to your Sumo Logic OTel Collector to ingest all ${escHtml(info.label)} telemetry.</p>`;

  const correlationHtml = info.correlationNotes ? renderCorrelationNotes(info.correlationNotes) : '';

  return `${toggleHtml}
    <div class="otel-config-toolbar">
      ${introHtml}
      <button class="btn btn-secondary btn-sm" onclick="copyOtelConfig('${source.subType}', this)">Copy YAML</button>
    </div>
    <div class="otel-collector-config">
      <div class="otel-config-label">otel-collector-config.yaml</div>
      <pre class="otel-config-pre" id="otel-cfg-pre" data-config-type="${defaultType}">${escHtml(defaultConfig || '')}</pre>
    </div>
    ${correlationHtml}`;
}

function renderCorrelationNotes(notes) {
  const rows = notes.map(n => {
    const cls = n.status === 'full' ? 'corr-full' : n.status === 'partial' ? 'corr-partial' : 'corr-none';
    const icon = n.status === 'full' ? '✓' : n.status === 'partial' ? '~' : '✗';
    return `<tr>
      <td><span class="corr-icon ${cls}">${icon}</span> ${escHtml(n.pair)}</td>
      <td class="corr-note">${escHtml(n.note)}</td>
    </tr>`;
  }).join('');
  return `<div class="correlation-section">
    <div class="correlation-title">Signal Correlation</div>
    <table class="correlation-table">
      <thead><tr><th>Signal Pair</th><th>How Correlated</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function switchOtelConfigType(type, btn, subType) {
  const info = OTEL_APP_SUBTYPES.find(o => o.value === subType);
  if (!info) return;
  const config = type === 'managed' ? info.sumoConfigManaged : info.sumoConfig;
  const pre = document.getElementById('otel-cfg-pre');
  if (pre) { pre.textContent = config || ''; pre.dataset.configType = type; }
  btn.closest('.config-type-toggle').querySelectorAll('.config-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const intro = document.getElementById('otel-cfg-intro');
  if (intro) {
    intro.innerHTML = type === 'managed'
      ? `Remotely managed — exporter is <code>sumologic</code>, routing handled by the Sumo Logic extension.`
      : `Apply this to your Sumo Logic OTel Collector to ingest all ${escHtml(info.label)} telemetry.`;
  }
}

// ── OTel multi-signal form ────────────────────────────────────────────────────

const OTEL_APP_SUBTYPES = [
  {
    value: 'nginxOtel',
    label: 'Nginx',
    metricsPort: 9113,
    signals: [
      { dataType: 'logs',    filePath: '/tmp/otel/nginx/access.log',   label: 'Access log' },
      { dataType: 'logs',    filePath: '/tmp/otel/nginx/error.log',    label: 'Error log' },
      { dataType: 'traces',  filePath: '/tmp/otel/nginx-traces.json', label: 'Traces' },
      { dataType: 'metrics', filePath: null, displayPath: 'http://localhost:9113/nginx_status', label: 'nginx stub_status' }
    ],
    sumoConfig: `# Sumo Logic OTel Collector config for Nginx
# Replace SUMOLOGIC_INSTALLATION_TOKEN with your token
# Docs: https://help.sumologic.com/docs/send-data/opentelemetry-collector/

extensions:
  sumologic:
    installation_token: \${SUMOLOGIC_INSTALLATION_TOKEN}

receivers:
  filelog/nginx_access:
    include: [/tmp/otel/nginx/access.log]
    operators:
      - type: regex_parser
        regex: '^(?P<remote_addr>\\S+) \\S+ (?P<user>\\S+) \\[(?P<time_local>[^\\]]+)\\] "(?P<method>\\S+) (?P<path>\\S+) (?P<protocol>[^"]+)" (?P<status>\\d+) (?P<bytes_sent>\\d+)'
        timestamp:
          parse_from: attributes.time_local
          layout: '02/Jan/2006:15:04:05 -0700'
        severity:
          parse_from: attributes.status
          mapping:
            error2: 5xx
            error: 4xx
            warn: 3xx
    resource:
      service.name: nginx
      _sourceCategory: prod/nginx/access

  filelog/nginx_error:
    include: [/tmp/otel/nginx/error.log]
    resource:
      service.name: nginx
      _sourceCategory: prod/nginx/error

  nginx:
    endpoint: http://localhost:9113/nginx_status
    collection_interval: 10s

  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

exporters:
  otlphttp/sumologic:
    endpoint: https://open-collectors.sumologic.com/otlp
    headers:
      Authorization: Bearer \${SUMOLOGIC_INSTALLATION_TOKEN}

service:
  extensions: [sumologic]
  pipelines:
    logs/access:
      receivers: [filelog/nginx_access]
      exporters: [otlphttp/sumologic]
    logs/error:
      receivers: [filelog/nginx_error]
      exporters: [otlphttp/sumologic]
    metrics:
      receivers: [nginx]
      exporters: [otlphttp/sumologic]
    traces:
      receivers: [otlp]
      exporters: [otlphttp/sumologic]`
  },
  {
    value: 'mysqlOtel',
    label: 'MySQL',
    metricsPort: 9104,
    signals: [
      { dataType: 'logs',    filePath: '/tmp/otel/mysql/error.log',    label: 'Error log' },
      { dataType: 'traces',  filePath: '/tmp/otel/mysql-traces.json', label: 'Traces' },
      { dataType: 'metrics', filePath: null, displayPath: 'http://localhost:9104/metrics', label: 'Prometheus scrape' }
    ],
    sumoConfig: `# Sumo Logic OTel Collector config for MySQL
# Replace SUMOLOGIC_INSTALLATION_TOKEN with your token
# Docs: https://help.sumologic.com/docs/send-data/opentelemetry-collector/

extensions:
  sumologic:
    installation_token: \${SUMOLOGIC_INSTALLATION_TOKEN}

receivers:
  filelog/mysql_error:
    include: [/tmp/otel/mysql/error.log]
    operators:
      - type: regex_parser
        regex: '^(?P<timestamp>\\d{4}-\\d{2}-\\d{2}T[\\d:.]+Z) (?P<thread>\\d+) \\[(?P<level>[^\\]]+)\\] (?P<message>.*)'
        timestamp:
          parse_from: attributes.timestamp
          layout: '2006-01-02T15:04:05.999999Z'
        severity:
          parse_from: attributes.level
          mapping:
            error: ERROR
            warn: Warning
            info: Note
    resource:
      service.name: mysql
      _sourceCategory: prod/mysql/error

  filelog/mysql_slow:
    include: [/tmp/otel/mysql/slow.log]
    resource:
      service.name: mysql
      _sourceCategory: prod/mysql/slowquery

  prometheus/mysql:
    config:
      scrape_configs:
        - job_name: mysqld-exporter
          static_configs:
            - targets: ['localhost:9104']

  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

exporters:
  otlphttp/sumologic:
    endpoint: https://open-collectors.sumologic.com/otlp
    headers:
      Authorization: Bearer \${SUMOLOGIC_INSTALLATION_TOKEN}

service:
  extensions: [sumologic]
  pipelines:
    logs/error:
      receivers: [filelog/mysql_error]
      exporters: [otlphttp/sumologic]
    logs/slow:
      receivers: [filelog/mysql_slow]
      exporters: [otlphttp/sumologic]
    metrics:
      receivers: [prometheus/mysql]
      exporters: [otlphttp/sumologic]
    traces:
      receivers: [otlp]
      exporters: [otlphttp/sumologic]`
  },
  {
    value: 'kafkaOtel',
    label: 'Kafka',
    metricsPort: 9092,
    signals: [
      { dataType: 'logs',    filePath: '/tmp/otel/kafka/server.log',     label: 'Server log' },
      { dataType: 'logs',    filePath: '/tmp/otel/kafka/controller.log', label: 'Controller log' },
      { dataType: 'traces',  filePath: '/tmp/otel/kafka-traces.json',    label: 'Traces' },
      { dataType: 'metrics', filePath: null, displayPath: 'localhost:9092', label: 'Kafka broker (wire protocol)' }
    ],
    sumoConfig: `# Sumo Logic OTel Collector config for Kafka
# Replace SUMOLOGIC_INSTALLATION_TOKEN with your token
# Docs: https://help.sumologic.com/docs/send-data/opentelemetry-collector/

extensions:
  sumologic:
    installation_token: \${SUMOLOGIC_INSTALLATION_TOKEN}

receivers:
  filelog/kafka_server:
    include: [/tmp/otel/kafka/server.log]
    operators:
      - type: regex_parser
        regex: '^\\[(?P<timestamp>\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2},\\d{3})\\] (?P<level>\\w+) (?P<message>.*)'
        timestamp:
          parse_from: attributes.timestamp
          layout: '2006-01-02 15:04:05,000'
        severity:
          parse_from: attributes.level
          mapping:
            error: ERROR
            warn: WARN
            info: INFO
            debug: DEBUG
    resource:
      service.name: kafka
      _sourceCategory: prod/kafka/server

  filelog/kafka_controller:
    include: [/tmp/otel/kafka/controller.log]
    operators:
      - type: regex_parser
        regex: '^\\[(?P<timestamp>\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2},\\d{3})\\] (?P<level>\\w+) (?P<message>.*)'
        timestamp:
          parse_from: attributes.timestamp
          layout: '2006-01-02 15:04:05,000'
        severity:
          parse_from: attributes.level
          mapping:
            error: ERROR
            warn: WARN
            info: INFO
            debug: DEBUG
    resource:
      service.name: kafka
      _sourceCategory: prod/kafka/controller

  kafkametrics:
    brokers: [localhost:9092]
    protocol_version: 2.0.0
    scrapers:
      - brokers
      - topics
      - consumers

  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

exporters:
  otlphttp/sumologic:
    endpoint: https://open-collectors.sumologic.com/otlp
    headers:
      Authorization: Bearer \${SUMOLOGIC_INSTALLATION_TOKEN}

service:
  extensions: [sumologic]
  pipelines:
    logs/server:
      receivers: [filelog/kafka_server]
      exporters: [otlphttp/sumologic]
    logs/controller:
      receivers: [filelog/kafka_controller]
      exporters: [otlphttp/sumologic]
    metrics:
      receivers: [kafkametrics]
      exporters: [otlphttp/sumologic]
    traces:
      receivers: [otlp]
      exporters: [otlphttp/sumologic]`,
    sumoConfigManaged: `# Sumo Logic OTel Collector — Remotely Managed — Kafka
# Install: https://help.sumologic.com/docs/send-data/opentelemetry-collector/install-collector/
# Token is provided during installation; no endpoint URL needed here.

extensions:
  sumologic:
    installation_token: \${env:SUMOLOGIC_INSTALLATION_TOKEN}
    collector_name: kafka-otel-demo

receivers:
  filelog/kafka_server:
    include: [/tmp/otel/kafka/server.log]
    start_at: beginning
    operators:
      - type: regex_parser
        regex: '^\\[(?P<timestamp>\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2},\\d{3})\\] (?P<level>\\w+) (?P<message>.*)'
        timestamp:
          parse_from: attributes.timestamp
          layout: '2006-01-02 15:04:05,000'
        severity:
          parse_from: attributes.level
          mapping:
            error: ERROR
            warn: WARN
            info: INFO
            debug: DEBUG

  filelog/kafka_controller:
    include: [/tmp/otel/kafka/controller.log]
    start_at: beginning
    operators:
      - type: regex_parser
        regex: '^\\[(?P<timestamp>\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2},\\d{3})\\] (?P<level>\\w+) (?P<message>.*)'
        timestamp:
          parse_from: attributes.timestamp
          layout: '2006-01-02 15:04:05,000'
        severity:
          parse_from: attributes.level
          mapping:
            error: ERROR
            warn: WARN
            info: INFO
            debug: DEBUG

  kafkametrics:
    brokers: [localhost:9092]
    protocol_version: 2.0.0
    scrapers:
      - brokers
      - topics
      - consumers

  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

processors:
  resource/kafka:
    attributes:
      - action: upsert
        key: service.name
        value: kafka
      - action: upsert
        key: deployment.environment
        value: production

  resourcedetection/system:
    detectors: [system, env]
    timeout: 5s
    override: false

  batch:
    timeout: 5s
    send_batch_size: 1000

exporters:
  sumologic:

service:
  extensions: [sumologic]
  pipelines:
    logs/kafka_server:
      receivers: [filelog/kafka_server]
      processors: [resource/kafka, resourcedetection/system, batch]
      exporters: [sumologic]
    logs/kafka_controller:
      receivers: [filelog/kafka_controller]
      processors: [resource/kafka, resourcedetection/system, batch]
      exporters: [sumologic]
    metrics/kafka:
      receivers: [kafkametrics]
      processors: [resource/kafka, resourcedetection/system, batch]
      exporters: [sumologic]
    traces/kafka:
      receivers: [otlp]
      processors: [resource/kafka, resourcedetection/system, batch]
      exporters: [sumologic]`,
    correlationNotes: [
      { pair: 'Logs ↔ Metrics',  status: 'full',    note: 'service.name=kafka + host.name (via resourcedetection) links broker logs to kafkametrics broker/topic/consumer data' },
      { pair: 'Logs ↔ Traces',   status: 'partial', note: 'service.name matches; broker logs lack trace_id — only OTel-instrumented client spans carry trace context' },
      { pair: 'Metrics ↔ Traces', status: 'full',   note: 'service.name=kafka + host.name bridges broker metrics to producer/consumer spans' },
    ]
  },
  {
    value: 'dockerOtel',
    label: 'Docker',
    metricsPort: 2375,
    signals: [
      { dataType: 'logs',    filePath: '/tmp/otel/docker/daemon.log',  label: 'Daemon log' },
      { dataType: 'traces',  filePath: '/tmp/otel/docker-traces.json', label: 'Traces' },
      { dataType: 'metrics', filePath: null, displayPath: 'http://localhost:2375', label: 'Docker API (docker_stats)' }
    ],
    sumoConfig: `# Sumo Logic OTel Collector config for Docker
# Replace SUMOLOGIC_INSTALLATION_TOKEN with your token
# Docs: https://help.sumologic.com/docs/send-data/opentelemetry-collector/

extensions:
  sumologic:
    installation_token: \${SUMOLOGIC_INSTALLATION_TOKEN}

receivers:
  filelog/docker_daemon:
    include: [/tmp/otel/docker/daemon.log]
    operators:
      - type: json_parser
        timestamp:
          parse_from: attributes.time
          layout: '2006-01-02T15:04:05.999999999Z'
        severity:
          parse_from: attributes.level
          mapping:
            error: error
            warn: warning
            info: info
            debug: debug
    resource:
      service.name: docker
      _sourceCategory: prod/docker/daemon

  docker_stats:
    endpoint: http://localhost:2375
    collection_interval: 20s
    api_version: 1.24
    timeout: 20s

  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

exporters:
  otlphttp/sumologic:
    endpoint: https://open-collectors.sumologic.com/otlp
    headers:
      Authorization: Bearer \${SUMOLOGIC_INSTALLATION_TOKEN}

service:
  extensions: [sumologic]
  pipelines:
    logs/daemon:
      receivers: [filelog/docker_daemon]
      exporters: [otlphttp/sumologic]
    metrics:
      receivers: [docker_stats]
      exporters: [otlphttp/sumologic]
    traces:
      receivers: [otlp]
      exporters: [otlphttp/sumologic]`,
    sumoConfigManaged: `# Sumo Logic OTel Collector — Remotely Managed — Docker
# Install: https://help.sumologic.com/docs/send-data/opentelemetry-collector/install-collector/
# Token is provided during installation; no endpoint URL needed here.

extensions:
  sumologic:
    installation_token: \${env:SUMOLOGIC_INSTALLATION_TOKEN}
    collector_name: docker-otel-demo

receivers:
  filelog/docker_daemon:
    include: [/tmp/otel/docker/daemon.log]
    start_at: beginning
    operators:
      - type: json_parser
        timestamp:
          parse_from: attributes.time
          layout: '2006-01-02T15:04:05.999999999Z'
        severity:
          parse_from: attributes.level
          mapping:
            error: error
            warn: warning
            info: info
            debug: debug
      - type: move
        from: attributes.msg
        to: body

  docker_stats:
    endpoint: http://localhost:2375
    collection_interval: 20s
    api_version: 1.24
    timeout: 20s

  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

processors:
  resource/docker:
    attributes:
      - action: upsert
        key: service.name
        value: docker
      - action: upsert
        key: deployment.environment
        value: production

  resourcedetection/system:
    detectors: [system, env, docker]
    timeout: 5s
    override: false

  batch:
    timeout: 5s
    send_batch_size: 1000

exporters:
  sumologic:

service:
  extensions: [sumologic]
  pipelines:
    logs/docker:
      receivers: [filelog/docker_daemon]
      processors: [resource/docker, resourcedetection/system, batch]
      exporters: [sumologic]
    metrics/docker:
      receivers: [docker_stats]
      processors: [resource/docker, resourcedetection/system, batch]
      exporters: [sumologic]
    traces/docker:
      receivers: [otlp]
      processors: [resource/docker, resourcedetection/system, batch]
      exporters: [sumologic]`,
    correlationNotes: [
      { pair: 'Logs ↔ Metrics',   status: 'full',    note: 'service.name=docker + container.name (from docker_stats labels) bridges daemon logs to container metrics' },
      { pair: 'Logs ↔ Traces',    status: 'partial', note: 'service.name matches; daemon logs lack trace_id — only Docker SDK-instrumented calls carry trace context' },
      { pair: 'Metrics ↔ Traces', status: 'full',    note: 'service.name=docker + container.name links docker_stats container metrics to Docker API operation spans' },
    ]
  }
];

function showOtelAddForm() {
  const existingSubTypes = new Set(state.sources.filter(s => s.dataType === 'otelApp').map(s => s.subType));
  const available = OTEL_APP_SUBTYPES.filter(o => !existingSubTypes.has(o.value));
  if (available.length === 0) {
    alert('All app types have already been added. Delete an existing app to add it again.');
    return;
  }
  document.getElementById('modal-content').innerHTML = renderOtelAddForm(available[0].value, available);
  openModal();
  setupOtelFormListeners();
}

function renderOtelAddForm(subType, availableTypes) {
  const types = availableTypes || OTEL_APP_SUBTYPES;
  const info = types.find(o => o.value === subType) || types[0];

  const pathRows = (info.signals || []).map((sig, idx) => {
    const pathText = escHtml(sig.filePath || sig.displayPath || '');
    const note = (!sig.filePath && !sig.displayPath) ? ' <span class="otel-info-note">(always live — metricsServer)</span>' : '';
    return `<div class="otel-path-row" id="otel-path-sig-${idx}">
      <span class="badge badge-${sig.dataType}">${sig.dataType}</span>
      ${sig.label ? `<span class="otel-path-label">${escHtml(sig.label)}</span>` : ''}
      <code class="otel-path-value">${pathText}</code>${note}
    </div>`;
  }).join('');

  return `
    <h2>Add OTel App</h2>
    <form id="otel-source-form">
      <div class="form-row">
        <div class="form-group">
          <label>App Type</label>
          <select name="subType" id="otel-subType">
            ${types.map(o =>
              `<option value="${o.value}" ${o.value === subType ? 'selected' : ''}>${o.label}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Name</label>
          <input type="text" name="name" value="${escHtml(info.label)}" placeholder="My App" required>
        </div>
      </div>

      <div class="otel-section">
        <div class="otel-section-header">
          <span class="otel-section-title">Output paths</span>
          <span class="otel-section-desc">Logs and traces written to file. Metrics exposed as Prometheus scrape endpoint.</span>
        </div>
        <div class="otel-path-rows" id="otel-path-rows">
          ${pathRows}
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Interval (seconds)</label>
          <input type="number" name="intervalSeconds" value="10" min="1" max="3600">
        </div>
        <div class="form-group">
          <label>Volume (records / tick)</label>
          <input type="number" name="volumePerInterval" value="50" min="1" max="10000">
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary" id="otel-form-submit">Add App</button>
      </div>
    </form>`;
}

function setupOtelFormListeners() {
  const subTypeSelect = document.getElementById('otel-subType');

  subTypeSelect?.addEventListener('change', () => {
    const info = OTEL_APP_SUBTYPES.find(o => o.value === subTypeSelect.value) || OTEL_APP_SUBTYPES[0];
    const nameInput = document.querySelector('#otel-source-form [name="name"]');
    if (nameInput && !nameInput.dataset.userEdited) nameInput.value = info.label;
    const pathRowsEl = document.getElementById('otel-path-rows');
    if (pathRowsEl) {
      pathRowsEl.innerHTML = (info.signals || []).map((sig, idx) => {
        const pathText = escHtml(sig.filePath || sig.displayPath || '');
        const note = (!sig.filePath && !sig.displayPath) ? ' <span class="otel-info-note">(always live — metricsServer)</span>' : '';
        return `<div class="otel-path-row" id="otel-path-sig-${idx}">
          <span class="badge badge-${sig.dataType}">${sig.dataType}</span>
          ${sig.label ? `<span class="otel-path-label">${escHtml(sig.label)}</span>` : ''}
          <code class="otel-path-value">${pathText}</code>${note}
        </div>`;
      }).join('');
    }
  });

  document.querySelector('#otel-source-form [name="name"]')?.addEventListener('input', function() {
    this.dataset.userEdited = '1';
  });

  document.getElementById('otel-source-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.elements['name'].value.trim();
    const subType = form.elements['subType'].value;
    const info = OTEL_APP_SUBTYPES.find(o => o.value === subType) || OTEL_APP_SUBTYPES[0];
    const intervalSeconds = parseInt(form.elements['intervalSeconds'].value) || 10;
    const volumePerInterval = parseInt(form.elements['volumePerInterval'].value) || 50;

    // One source for the whole app — worker handles multi-signal output internally
    const source = {
      name,
      dataType: 'otelApp',
      subType,
      format: 'multi',
      enabled: false,
      httpEnabled: false,
      fileEnabled: false,
      endpointUrls: [],
      fileOutputs: [],
      filePath: '',
      intervalSeconds,
      volumePerInterval,
      metadata: {},
      headers: []
    };

    const btn = document.getElementById('otel-form-submit');
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
    try {
      await fetch(`${API}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(source)
      });
      closeModal();
      await fetchSources();
    } catch (err) {
      alert('Failed to create source: ' + err.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Add App'; }
    }
  });
}

// ── OTel grouped grid ─────────────────────────────────────────────────────────

function renderOtelGrid(sources) {
  const grid = document.getElementById('sources-grid-otel');
  if (!grid) return;

  if (sources.length === 0) {
    grid.innerHTML = `<div style="text-align:center;padding:60px 0;color:var(--text-muted)">
      <p style="font-size:18px;margin-bottom:8px">No OTel sources configured</p>
      <p>Click <strong>+ Add App</strong> to simulate a Nginx, MySQL, Kafka, or Docker app writing telemetry to standard locations.</p>
    </div>`;
    return;
  }

  // Group by subType
  const groups = {};
  for (const s of sources) {
    (groups[s.subType] = groups[s.subType] || []).push(s);
  }

  const ALL_SIGNALS = ['logs', 'metrics', 'traces'];
  let html = '';

  for (const [subType, groupSources] of Object.entries(groups)) {
    // otelApp sources cover all signals — show them regardless of filter
    const filtered = groupSources;
    if (filtered.length === 0) continue;

    const info = OTEL_APP_SUBTYPES.find(o => o.value === subType);
    // All three signals are present for otelApp: logs+traces via worker, metrics via metricsServer.js
    const pills = ALL_SIGNALS.map(sig =>
      `<span class="otel-sig-pill otel-sig-pill-active">${sig}</span>`
    ).join('');

    html += `<div class="otel-source-group">
      <div class="otel-group-header">
        <span class="otel-group-name">${escHtml(info?.label || subType)}</span>
        <span class="otel-group-signals">${pills}</span>
      </div>
      <div class="otel-group-cards">${filtered.map(renderSourceCard).join('')}</div>
    </div>`;
  }

  grid.innerHTML = html || `<div style="text-align:center;padding:40px 0;color:var(--text-muted)">No sources match the "${escHtml(state.filter)}" filter.</div>`;
}


// ── Tab-scoped start / stop helpers ──────────────────────────────────────────

async function startAllForPage(page) {
  const ids = state.sources.filter(s => getSourcePage(s) === page).map(s => s.id);
  await fetch(`${API}/sources/start-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids })
  });
  await Promise.all([fetchSources(), fetchConfigStatus()]);
}

async function stopAllForPage(page) {
  const ids = state.sources.filter(s => getSourcePage(s) === page).map(s => s.id);
  await fetch(`${API}/sources/stop-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids })
  });
  await Promise.all([fetchSources(), fetchConfigStatus()]);
}

// ─── Event listeners ──────────────────────────────────────────────────────────

document.addEventListener('click', (e) => {
  if (!e.target.closest('.kebab-menu-container')) {
    document.querySelectorAll('.kebab-menu').forEach(m => {
      m.classList.remove('active');
      m.closest('.source-card')?.classList.remove('menu-open');
    });
  }
});

// Per-page add / start / stop (tab-scoped)
document.getElementById('btn-add-source-observability')?.addEventListener('click', () => showAddForm('observability'));
document.getElementById('btn-add-source-security')?.addEventListener('click', () => showAddForm('security'));
document.getElementById('btn-add-source-otel')?.addEventListener('click', showOtelAddForm);

document.getElementById('btn-start-all')?.addEventListener('click', () => startAllForPage('observability'));
document.getElementById('btn-stop-all')?.addEventListener('click', () => stopAllForPage('observability'));
document.getElementById('btn-start-all-security')?.addEventListener('click', () => startAllForPage('security'));
document.getElementById('btn-stop-all-security')?.addEventListener('click', () => stopAllForPage('security'));
document.getElementById('btn-start-all-otel')?.addEventListener('click', () => startAllForPage('otel'));
document.getElementById('btn-stop-all-otel')?.addEventListener('click', () => stopAllForPage('otel'));

// Observability-only buttons
document.getElementById('btn-test-send').addEventListener('click', showTestSend);
// Versions now in sidebar tab — no btn-versions
document.getElementById('btn-reset-all-stats').addEventListener('click', resetAllStats);

document.querySelector('.modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// Filter buttons — sync active state across all pages when clicked
document.querySelectorAll('.btn-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    state.filter = btn.dataset.filter;
    // Sync all filter buttons that match this filter value to active
    document.querySelectorAll('.btn-filter').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === state.filter);
    });
    render();
  });
});

// ── URL state persistence ─────────────────────────────────────────────────────

const VALID_TABS    = new Set(['observability', 'security', 'otel', 'versions', 'settings']);
const VALID_FILTERS = new Set(['all', 'logs', 'metrics', 'traces']);

function pushUrlState() {
  const params = new URLSearchParams();
  params.set('tab', state.activeTab);
  if (state.filter !== 'all') params.set('filter', state.filter);
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

function readUrlState() {
  const params = new URLSearchParams(location.search);
  const tab    = params.get('tab');
  const filter = params.get('filter');
  if (tab    && VALID_TABS.has(tab))       state.activeTab = tab;
  if (filter && VALID_FILTERS.has(filter)) state.filter    = filter;
}

// Sidebar toggle
document.getElementById('sidebar-toggle').addEventListener('click', () => {
  document.getElementById('app-sidebar').classList.toggle('collapsed');
});

// Sidebar nav
document.querySelectorAll('.sidebar-nav-item').forEach(item => {
  item.addEventListener('click', () => switchTab(item.dataset.tab));
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab(item.dataset.tab); }
  });
});

// Filter buttons push URL state after updating filter
document.querySelectorAll('.btn-filter').forEach(btn => {
  btn.addEventListener('click', pushUrlState);
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────

readUrlState();
switchTab(state.activeTab);
document.querySelectorAll('.btn-filter').forEach(b => {
  b.classList.toggle('active', b.dataset.filter === state.filter);
});

fetchSettings();
fetchSources();
fetchStats();
fetchConfigStatus();
setInterval(fetchSources, 5000);
setInterval(fetchStats, 5000);
setInterval(fetchConfigStatus, 5000);
