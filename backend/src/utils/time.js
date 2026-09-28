const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getOffsetString(date, timezone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
      hour: 'numeric'
    });
    const parts = fmt.formatToParts(date);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    if (!tzPart) return '+0000';
    // shortOffset gives "GMT+5:30" or "GMT-4" etc
    const raw = tzPart.value.replace('GMT', '');
    if (!raw || raw === '+0' || raw === '0') return '+0000';
    const [h, m] = raw.replace(/^([+-])/, '').split(':');
    const sign = raw.startsWith('-') ? '-' : '+';
    return `${sign}${h.padStart(2, '0')}${(m || '00').padStart(2, '0')}`;
  } catch {
    return '+0000';
  }
}

function getPartsInZone(date, timezone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
    const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
    return parts;
  } catch {
    return null;
  }
}

export function formatISOInZone(date, timezone = 'UTC') {
  const parts = getPartsInZone(date, timezone);
  if (!parts) return date.toISOString();
  const offset = getOffsetString(date, timezone);
  const h = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${h}:${parts.minute}:${parts.second}${offset}`;
}

export function formatApacheTimestamp(date, timezone = 'UTC') {
  const parts = getPartsInZone(date, timezone);
  if (!parts) {
    const s = date.toUTCString().replace(/GMT/, '+0000');
    return s;
  }
  const offset = getOffsetString(date, timezone);
  const month = MONTHS[parseInt(parts.month, 10) - 1];
  const h = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.day}/${month}/${parts.year}:${h}:${parts.minute}:${parts.second} ${offset}`;
}
