/**
 * useTTSHealthCheck — Silent background health probe for ElevenLabs TTS.
 *
 * On login, fires a single 1-word request to the elevenlabs-tts edge function
 * after a 3-second delay (to avoid blocking the login flow). Caches the result
 * at module level so all consumers share one check per session.
 *
 * Result is broadcast via `mockj:tts-health` CustomEvent and readable via
 * the exported `getTTSHealthStatus()` accessor.
 */

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export type TTSHealthStatus = 'unknown' | 'checking' | 'ready' | 'unavailable';

// ── Module-level singleton ────────────────────────────────────────────────────
let _cachedStatus: TTSHealthStatus = 'unknown';
let _checkedUserId: string | null = null;
let _lastUserId: string | null = null;  // saved so recheckTTSHealth() can re-run
let _inProgress = false;

/** Read the last known health status without subscribing to updates. */
export function getTTSHealthStatus(): TTSHealthStatus {
  return _cachedStatus;
}

function _broadcast(status: TTSHealthStatus) {
  _cachedStatus = status;
  window.dispatchEvent(
    new CustomEvent('mockj:tts-health', { detail: { status } })
  );
}

async function _runCheck(userId: string) {
  if (_inProgress || _checkedUserId === userId) return;
  _inProgress = true;
  _lastUserId = userId;
  _broadcast('checking');  // signal UI to show spinner immediately

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const funcUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;

    const res = await fetch(funcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${
          session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY
        }`,
      },
      // Single short word — minimal latency, minimal credit usage
      body: JSON.stringify({ text: 'hey' }),
    });

    if (res.ok) {
      // Drain the body so the connection closes cleanly — we won't play it
      await res.arrayBuffer();
      console.log('[TTS health check] ✅ Voice Ready');
      _checkedUserId = userId;  // only lock after a successful/final result
      _broadcast('ready');
    } else {
      const errText = await res.text().catch(() => String(res.status));
      console.warn('[TTS health check] ❌ Voice Unavailable —', res.status, errText.slice(0, 80));
      _checkedUserId = userId;
      _broadcast('unavailable');
    }
  } catch (err) {
    console.warn('[TTS health check] ❌ Network error —', err);
    _checkedUserId = userId;
    _broadcast('unavailable');
  } finally {
    _inProgress = false;
  }
}

/**
 * Called by useTTS after a successful ElevenLabs response — instantly clears
 * an 'unavailable' badge and broadcasts 'ready' without re-running the probe.
 * No-op if the status is already 'ready' or 'checking'.
 */
export function markTTSHealthReady(): void {
  if (_cachedStatus === 'ready') return;
  _checkedUserId = _lastUserId;  // lock so the next panel-open doesn't re-probe unnecessarily
  _broadcast('ready');
}

/**
 * Force a fresh health probe — resets the per-session guard so the check
 * runs again even if it already ran once.  Useful when the panel opens
 * after a previous 'unavailable' result (e.g. the user just fixed their key).
 */
export function recheckTTSHealth(): void {
  const userId = _lastUserId;
  if (!userId) return;  // never ran before — nothing to recheck
  _checkedUserId = null;  // reset guard so _runCheck won't skip
  _runCheck(userId);
}

/**
 * Call once from a top-level component (e.g. Index.tsx) when the user is
 * authenticated. The probe fires automatically after a 3-second delay and
 * only runs once per unique userId per page session.
 */
export function useTTSHealthCheck(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    // Already ran for this user in this session — skip
    if (_checkedUserId === userId) return;

    // 3-second delay: let auth + initial data fetches settle first
    const timer = setTimeout(() => _runCheck(userId), 3000);
    return () => clearTimeout(timer);
  }, [userId]);
}
