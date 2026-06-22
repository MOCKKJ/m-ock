/**
 * deviceFingerprint.ts
 * Generates a stable device ID from browser signals.
 * Persisted to localStorage so it survives page refreshes.
 * Used for server-side rate limiting — clearing localStorage
 * causes a new fingerprint which still gets its own limit bucket
 * (not a bypass, since the IP layer catches mass resets).
 */

const STORAGE_KEY = 'mockj_device_id';

function buildFingerprint(): string {
  const nav = window.navigator;
  const screen = window.screen;

  const signals = [
    nav.userAgent,
    nav.language,
    nav.languages?.join(',') ?? '',
    String(nav.hardwareConcurrency ?? ''),
    String(nav.deviceMemory ?? ''),
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    String(screen.pixelDepth),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    Intl.DateTimeFormat().resolvedOptions().locale ?? '',
    nav.platform ?? '',
    String(window.devicePixelRatio ?? '1'),
  ].join('|');

  // Simple, fast hash (djb2)
  let hash = 5381;
  for (let i = 0; i < signals.length; i++) {
    hash = ((hash << 5) + hash) ^ signals.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }

  return hash.toString(16).padStart(8, '0');
}

let _deviceId: string | null = null;

export function getDeviceId(): string {
  if (_deviceId) return _deviceId;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && /^[a-f0-9]{8,}$/.test(stored)) {
      _deviceId = stored;
      return _deviceId;
    }
  } catch { /* unavailable */ }

  // Generate new fingerprint + random salt for uniqueness
  const fp = buildFingerprint();
  const salt = Math.random().toString(16).slice(2, 8);
  _deviceId = `${fp}${salt}`;

  try {
    localStorage.setItem(STORAGE_KEY, _deviceId);
  } catch { /* quota exceeded */ }

  return _deviceId;
}
