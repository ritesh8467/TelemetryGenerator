import { appendFileSync, statSync, renameSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 2; // active + 1 rotated
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 1 day

function ensureDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function cleanStaleFiles(filePath) {
  const now = Date.now();
  const paths = [filePath, `${filePath}.1`];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const { mtimeMs } = statSync(p);
      if (now - mtimeMs > MAX_AGE_MS) {
        unlinkSync(p);
      }
    } catch {}
  }
}

function rotate(filePath) {
  try {
    const stats = statSync(filePath);
    if (stats.size < MAX_FILE_SIZE) return;
  } catch {
    return;
  }

  const rotated = `${filePath}.1`;
  if (existsSync(rotated)) {
    unlinkSync(rotated);
  }
  renameSync(filePath, rotated);
}

export function formatBody(records, dataType, format) {
  if (dataType === 'traces') {
    return JSON.stringify(records) + '\n';
  }

  if (dataType === 'metrics') {
    switch (format) {
      case 'carbon2':
        return records.map(m => {
          const tags = Object.entries(m.tags).map(([k, v]) => `${k}=${v}`).join(' ');
          return `metric=${m.name} ${tags}  ${m.value} ${m.timestamp}`;
        }).join('\n') + '\n';

      case 'prometheus':
        return records.map(m => {
          const labels = Object.entries(m.tags).map(([k, v]) => `${k}="${v}"`).join(',');
          return `${m.name.replace(/\./g, '_')}{${labels}} ${m.value} ${m.timestamp * 1000}`;
        }).join('\n') + '\n';

      case 'graphite':
        return records.map(m => {
          const host = m.tags.host || 'unknown';
          const path = `${host}.${m.name}`;
          return `${path} ${m.value} ${m.timestamp}`;
        }).join('\n') + '\n';

      default:
        return records.map(m => {
          const tags = Object.entries(m.tags).map(([k, v]) => `${k}=${v}`).join(' ');
          return `metric=${m.name} ${tags}  ${m.value} ${m.timestamp}`;
        }).join('\n') + '\n';
    }
  }

  // logs
  return records.join('\n') + '\n';
}

export async function send(records, filePath, dataType, format) {
  try {
    ensureDir(filePath);
    cleanStaleFiles(filePath);
    rotate(filePath);

    const body = formatBody(records, dataType, format);
    appendFileSync(filePath, body);
    const bytes = Buffer.byteLength(body, 'utf-8');

    return { ok: true, status: 200, body: '', bytes };
  } catch (err) {
    let errorMsg = err.message;
    if (err.code === 'EACCES') {
      errorMsg = `Permission denied: ${filePath}. Use a writable path like /tmp/telemetry.log`;
    } else if (err.code === 'ENOENT') {
      errorMsg = `Directory not found: ${dirname(filePath)}. Create parent directory or use /tmp/`;
    }
    return { ok: false, status: 0, body: errorMsg, bytes: 0 };
  }
}
