/**
 * useTTS — ElevenLabs text-to-speech hook for MockJ
 * Calls the `elevenlabs-tts` edge function and plays the returned audio.
 * Manages global playback state so only one message plays at a time.
 *
 * FIX v2: 
 *  1. globalInFlight dedup set is now ALWAYS cleared — no more permanent locks
 *  2. cleanupAudio() helper used consistently on ended/error/preempt — no orphaned state
 *  3. globalSetState is refreshed to the latest setState ref before play() so state
 *     updates are never lost after the first playback cycle
 */

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { getTTSHealthStatus, markTTSHealthReady } from '@/hooks/useTTSHealthCheck';
import { notifyAutoSpeakDone } from '@/hooks/useNotifications';
import { Analytics } from '@/lib/analytics';

type TTSState = 'idle' | 'loading' | 'playing';

// ── Browser-voice fallback state ─────────────────────────────────────────────
let _browserFallbackActive = false;

/** Returns true when browser speechSynthesis is being used as a TTS fallback */
export function isBrowserFallbackActive(): boolean { return _browserFallbackActive; }

/**
 * Silent fallback: speak `text` via window.speechSynthesis.
 * Picks the best English voice available, respects globalVolume.
 * Fires `mockj:tts-fallback` (active: true/false) and `mockj:tts-complete` on finish.
 */
async function _speakWithBrowser(text: string): Promise<void> {
  return new Promise(resolve => {
    if (!window.speechSynthesis) {
      // No browser TTS available — fire complete so loop doesn't stall
      window.dispatchEvent(new CustomEvent('mockj:tts-complete', { detail: { text } }));
      resolve();
      return;
    }

    const doSpeak = () => {
      const utterance = new SpeechSynthesisUtterance(text.slice(0, 600));
      // Prefer a natural-sounding English voice; fall back to whatever is first
      const voices = window.speechSynthesis.getVoices();
      const enVoice =
        voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('natural')) ||
        voices.find(v => v.lang.startsWith('en-US')) ||
        voices.find(v => v.lang.startsWith('en')) ||
        voices[0];
      if (enVoice) utterance.voice = enVoice;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = globalVolume;
      _browserFallbackActive = true;
      window.dispatchEvent(new CustomEvent('mockj:tts-fallback', { detail: { active: true } }));
      // Signal the voice panel that speaking has started (for UI state)
      window.dispatchEvent(new CustomEvent('mockj:tts-started', { detail: { messageId: 'browser-fallback' } }));
      const finish = () => {
        _browserFallbackActive = false;
        window.dispatchEvent(new CustomEvent('mockj:tts-fallback', { detail: { active: false } }));
        window.dispatchEvent(new CustomEvent('mockj:tts-complete', { detail: { text } }));
        resolve();
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.cancel(); // clear any stale queue
      window.speechSynthesis.speak(utterance);
    };

    // Browsers may not have loaded voices yet on first call — wait for them
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      doSpeak();
    } else {
      // Wait for voiceschanged event, then speak (fires once voices are ready)
      const onVoicesReady = () => {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesReady);
        doSpeak();
      };
      window.speechSynthesis.addEventListener('voiceschanged', onVoicesReady);
      // Safety timeout — if voices never fire, speak anyway with default voice
      setTimeout(() => {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesReady);
        doSpeak();
      }, 500);
    }
  });
}

// Global singleton so only one audio plays at a time
let globalAudio: HTMLAudioElement | null = null;
let globalSetState: ((s: TTSState) => void) | null = null;
let globalPlayingId: string | null = null;
let globalPlaybackRate: number = 1;
// In-flight dedup — prevent concurrent identical TTS requests
const globalInFlight = new Set<string>();
let globalVolume: number = (() => {
  try { const v = parseFloat(localStorage.getItem('mockj_tts_volume') ?? '1'); return isNaN(v) ? 1 : Math.max(0, Math.min(1, v)); } catch { return 1; }
})();

/** Stop any currently playing TTS audio immediately (barge-in support) */
export function stopAllTTS(): void {
  stopGlobal();
  window.dispatchEvent(new CustomEvent('mockj:tts-stopped'));
}

/** Returns true if TTS is currently playing */
export function isTTSPlaying(): boolean { return globalAudio !== null && !globalAudio.paused; }

export function getTTSVolume(): number { return globalVolume; }
export function setTTSVolume(v: number): void {
  globalVolume = Math.max(0, Math.min(1, v));
  try { localStorage.setItem('mockj_tts_volume', String(globalVolume)); } catch { /* ignore */ }
  if (globalAudio) globalAudio.volume = globalVolume;
  window.dispatchEvent(new CustomEvent('mockj:tts-volume-change', { detail: { volume: globalVolume } }));
}

function stopGlobal() {
  if (globalAudio) {
    globalAudio.pause();
    globalAudio.src = '';
    globalAudio = null;
  }
  if (globalSetState) {
    globalSetState('idle');
    globalSetState = null;
  }
  globalPlayingId = null;
}

export function useTTS(messageId: string) {
  const [state, setState] = useState<TTSState>('idle');
  const [playbackRate, setPlaybackRateState] = useState<number>(globalPlaybackRate);
  const objectUrlRef = useRef<string | null>(null);

  const isPlaying = state === 'playing';
  const isLoading = state === 'loading';

  const speak = useCallback(async (text: string) => {
    // Track TTS usage in analytics
    Analytics.featureUsed('tts');

    // Dedup: if this exact text is already in-flight AND audio is already playing, skip
    // But allow re-speak of same text if nothing is currently playing (e.g. retry)
    const textKey = text.slice(0, 120);
    if (globalInFlight.has(textKey) && globalAudio !== null) {
      console.log('[useTTS] Dedup: skipping duplicate in-flight request');
      return;
    }

    // If already playing this message — stop it (toggle off)
    if (globalPlayingId === messageId) {
      stopGlobal();
      setState('idle');
      return;
    }

    // Stop whatever else is playing
    stopGlobal();

    setState('loading');
    // Update globalSetState to THIS render's setState so it's always fresh
    globalSetState = setState;
    globalPlayingId = messageId;
    globalInFlight.add(textKey);

    // Revoke previous object URL for this message
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    try {
      // Use raw fetch to guarantee we receive the binary ArrayBuffer intact.
      // supabase.functions.invoke can mis-parse audio/mpeg responses as JSON/text.
      const { data: { session } } = await supabase.auth.getSession();
      const funcUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      };

      const res = await fetch(funcUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text }),
      });

      // CRITICAL: always release dedup lock once fetch resolves — success OR error
      globalInFlight.delete(textKey);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`[${res.status}] ${errText.slice(0, 200)}`);
      }

      // Auto-recover health badge: if the last probe marked TTS as unavailable
      // but this real request just succeeded, broadcast 'ready' immediately so
      // the badge flips green without requiring a manual recheck.
      if (getTTSHealthStatus() === 'unavailable') {
        markTTSHealthReady();
      }

      const arrayBuffer = await res.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;

      // If another message took over while we were loading — abort cleanly
      if (globalPlayingId !== messageId) {
        URL.revokeObjectURL(url);
        if (objectUrlRef.current === url) objectUrlRef.current = null;
        globalPlayingId = null;
        globalSetState = null;
        setState('idle');
        return;
      }

      const audio = new Audio(url);
      audio.playbackRate = globalPlaybackRate;
      audio.volume = globalVolume;
      globalAudio = audio;
      // Refresh globalSetState to this render's setState — ensures state updates
      // are never orphaned after first playback cycle completes
      globalSetState = setState;

      // Capture text for notification before async closure issues
      const spokenText = text;
      const cleanupAudio = (fireComplete: boolean) => {
        // Guard: only clean up if we are still "the" active audio
        if (objectUrlRef.current === url) {
          URL.revokeObjectURL(url);
          objectUrlRef.current = null;
        }
        if (globalAudio === audio) globalAudio = null;
        if (globalPlayingId === messageId) globalPlayingId = null;
        globalSetState = null;
        setState('idle');
        if (fireComplete) {
          // Fire subtle browser notification when audio finishes
          notifyAutoSpeakDone(spokenText);
          // Signal conversation loop: mic can re-activate now
          window.dispatchEvent(new CustomEvent('mockj:tts-complete', { detail: { text: spokenText } }));
        }
      };

      audio.onended = () => cleanupAudio(true);
      audio.onerror = () => {
        cleanupAudio(true); // still fire tts-complete so the voice loop can continue
        toast.error('Audio playback failed');
      };

      setState('playing');
      // Signal conversation loop: TTS is now playing (mic should show 'speaking' phase)
      window.dispatchEvent(new CustomEvent('mockj:tts-started', { detail: { messageId } }));
      await audio.play();

    } catch (err: unknown) {
      // Ensure dedup lock is ALWAYS released — even on unexpected throws
      globalInFlight.delete(textKey);
      globalPlayingId = null;
      globalSetState = null;
      setState('idle');
      const msg = err instanceof Error ? err.message : 'TTS failed';
      console.error('[useTTS] Error:', msg);
      // Surface ElevenLabs rate-limit errors with a specific, actionable message
      const isRateLimit =
        msg.includes('429') ||
        msg.includes('concurrent_limit') ||
        msg.includes('rate_limit') ||
        msg.includes('Too many concurrent');
      const isAuthError = msg.includes('401') || msg.includes('Unauthorized') || msg.includes('invalid_api_key');
      const isQuotaError = msg.includes('quota_exceeded') || msg.includes('quota exhausted') || msg.includes('402');

      // ── Browser-voice fallback for ANY TTS failure ────────────────────────
      // If ElevenLabs fails for any reason (bad key, quota, network, etc.),
      // silently fall back to window.speechSynthesis so voice never goes silent.
      if (window.speechSynthesis) {
        if (isAuthError) {
          toast.warning('🔑 ElevenLabs key invalid — using browser voice', { duration: 6000 });
        } else if (isQuotaError) {
          toast.warning('🎙 Voice credits exhausted — using browser voice', { duration: 6000 });
        } else {
          // Silent fallback for other errors — don't spam the user
          console.warn('[useTTS] Falling back to browser voice due to error:', msg.slice(0, 80));
        }
        // Dispatch with hasFallback=true so VoiceChatPanel sets speaking state correctly
        window.dispatchEvent(new CustomEvent('mockj:tts-error', { detail: { isRateLimit: false, isAuthError, isQuotaError, text, hasFallback: true } }));
        // Speak with browser voice — fires tts-complete internally when done
        _speakWithBrowser(text);
        return;
      }

      if (isRateLimit) {
        toast.warning('Voice busy — too many requests, retrying in a moment…', { duration: 4000 });
      } else if (isQuotaError) {
        toast.error('🎙 Voice credits exhausted — top up at elevenlabs.io/subscription', { duration: 8000 });
      } else if (isAuthError) {
        toast.error('🔑 ElevenLabs API key invalid (401) — update ELEVENLABS_API_KEY in Cloud → Secrets', { duration: 10000 });
      } else {
        toast.error(`Voice error: ${msg.slice(0, 120)}`);
      }
      // Dispatch error event so consumers (e.g. VoiceChatPanel) can retry on rate limits / auth failures
      window.dispatchEvent(new CustomEvent('mockj:tts-error', { detail: { isRateLimit, isAuthError, isQuotaError, text, hasFallback: false } }));
      // Always fire tts-complete so the voice loop doesn't get stuck
      window.dispatchEvent(new CustomEvent('mockj:tts-complete', { detail: { text } }));
    }
  }, [messageId]);

  const stop = useCallback(() => {
    stopGlobal();
    setState('idle');
  }, []);

  const setSpeed = useCallback((rate: number) => {
    globalPlaybackRate = rate;
    if (globalAudio) {
      globalAudio.playbackRate = rate;
    }
    setPlaybackRateState(rate);
  }, []);

  return { speak, stop, state, isPlaying, isLoading, playbackRate, setSpeed };
}
