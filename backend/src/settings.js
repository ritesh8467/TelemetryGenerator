import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = join(__dirname, '..', 'data', 'settings.json');

const DEFAULTS = {
  appName: 'Telemetry Generator',
  timezone: 'UTC',
  maxVersions: 10
};

let settings = { ...DEFAULTS };

export function load() {
  mkdirSync(join(__dirname, '..', 'data'), { recursive: true });
  if (existsSync(SETTINGS_PATH)) {
    try {
      const raw = readFileSync(SETTINGS_PATH, 'utf-8');
      const stored = JSON.parse(raw);
      settings = { ...DEFAULTS, ...stored };
    } catch (err) {
      console.warn('Failed to read settings, using defaults:', err.message);
      settings = { ...DEFAULTS };
    }
  } else {
    settings = { ...DEFAULTS };
    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  }
  return settings;
}

export function get() {
  return { ...settings };
}

export function save(updates) {
  const validated = {};
  if (updates.appName !== undefined) {
    const name = String(updates.appName).trim().slice(0, 100);
    validated.appName = name || DEFAULTS.appName;
  }
  if (updates.timezone !== undefined) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: updates.timezone });
      validated.timezone = updates.timezone;
    } catch {
      throw new Error(`Invalid timezone: ${updates.timezone}`);
    }
  }
  if (updates.maxVersions !== undefined) {
    const n = parseInt(updates.maxVersions, 10);
    if (isNaN(n) || n < 1 || n > 100) throw new Error('maxVersions must be between 1 and 100');
    validated.maxVersions = n;
  }
  settings = { ...settings, ...validated };
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  return { ...settings };
}
