/**
 * useWakeword — Always-on "Hey Mock" wakeword detection
 * Runs a continuous background speech recognizer.
 * Fires `mockj:wakeword-detected` custom event when activated.
 */

import { useEffect, useRef, useCallback } from 'react';

const WAKEWORD_KEY = 'mockj_wakeword_enabled';
const SENSITIVITY_KEY = 'mockj_wakeword_sensitivity';
const LANG_KEY = 'mockj_wakeword_lang';
const CUSTOM_PHRASE_KEY = 'mockj_custom_wakeword';

export const DEFAULT_WAKEWORD = 'hey mock';

export function getCustomWakeword(): string {
  try { return localStorage.getItem(CUSTOM_PHRASE_KEY)?.trim().toLowerCase() || DEFAULT_WAKEWORD; } catch { return DEFAULT_WAKEWORD; }
}

export function setCustomWakeword(v: string): void {
  const phrase = v.trim().toLowerCase() || DEFAULT_WAKEWORD;
  try { localStorage.setItem(CUSTOM_PHRASE_KEY, phrase); } catch {}
  window.dispatchEvent(new CustomEvent('mockj:wakeword-phrase-change', { detail: { phrase } }));
}

export type WakewordSensitivity = 'low' | 'medium' | 'high';

export function getWakewordSensitivity(): WakewordSensitivity {
  try { return (localStorage.getItem(SENSITIVITY_KEY) as WakewordSensitivity) || 'medium'; } catch { return 'medium'; }
}

export function setWakewordSensitivity(v: WakewordSensitivity): void {
  try { localStorage.setItem(SENSITIVITY_KEY, v); } catch {}
  window.dispatchEvent(new CustomEvent('mockj:wakeword-sensitivity-change', { detail: { sensitivity: v } }));
}

export function getWakewordLang(): string {
  try { return localStorage.getItem(LANG_KEY) ?? 'en-US'; } catch { return 'en-US'; }
}

export function setWakewordLang(v: string): void {
  try { localStorage.setItem(LANG_KEY, v); } catch {}
  window.dispatchEvent(new CustomEvent('mockj:wakeword-lang-change', { detail: { lang: v } }));
}

export function getWakewordEnabled(): boolean {
  try { return localStorage.getItem(WAKEWORD_KEY) === 'true'; } catch { return false; }
}

export function setWakewordEnabled(v: boolean): void {
  try { localStorage.setItem(WAKEWORD_KEY, String(v)); } catch {}
  window.dispatchEvent(new CustomEvent('mockj:wakeword-change', { detail: { enabled: v } }));
}

// Wakeword phrase sets — ordered from most to least strict
// LOW:    only unambiguous 'hey mock' forms → almost no false positives
// MEDIUM: common STT variations → good balance (default)
// HIGH:   includes bare 'mock' + loose forms → maximum responsiveness

function buildPhraseSets(base: string): { low: string[]; medium: string[]; high: string[] } {
  const b = base.toLowerCase().trim();
  // Strip 'hey ' prefix if present to get the core word(s)
  const core = b.startsWith('hey ') ? b.slice(4) : b;
  const low: string[] = [`${b}`, `${b}.`, `${b}!`];
  const medium: string[] = [
    ...low,
    `hey, ${core}`,
    `hey ${core.slice(0, -1)}`,       // last char dropped (common mishear)
    `a ${core}`,
  ];
  const high: string[] = [
    ...medium,
    core,
    `${core}.`,
    `${core}!`,
    `yo ${core}`,
    `ok ${core}`,
    `okay ${core}`,
    `ay ${core}`,
    `ey ${core}`,
  ];
  return { low, medium, high };
}

function getActivePhrases(): string[] {
  const s = getWakewordSensitivity();
  const sets = buildPhraseSets(getCustomWakeword());
  if (s === 'low') return sets.low;
  if (s === 'high') return sets.high;
  return sets.medium;
}

// Local Web Speech API types for browsers that expose SpeechRecognition.
interface SpeechRecognition extends EventTarget {
  lang: string; interimResults: boolean; continuous: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionEvent extends Event { results: SpeechRecognitionResultList; resultIndex: number; }
interface SpeechRecognitionErrorEvent extends Event { error: string; }
type SpeechRecognitionCtor = new () => SpeechRecognition;
type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

export function useWakeword(
  onDetected: () => void,
  enabled: boolean,
  paused: boolean,   // pass true while mic is already recording to avoid conflict
  lang: string = 'en-US'
) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const clearTimer = () => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const stopRecognition = useCallback(() => {
    clearTimer();
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onresult = null;
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
  }, []);

  // Forward ref so startRecognition can schedule restart without stale closure
  const startRecognitionRef = useRef<() => void>(() => {});

  const startRecognition = useCallback(() => {
    const speechWindow = window as unknown as SpeechRecognitionWindow;
    const SR = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SR || !activeRef.current) return;

    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    recognitionRef.current = rec;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript.toLowerCase().trim();
        if (getActivePhrases().some(p => transcript.includes(p))) {
          // Wakeword matched! Fire and pause wakeword until re-enabled
          window.dispatchEvent(new CustomEvent('mockj:wakeword-detected'));
          onDetectedRef.current();

          // Stop wakeword recognition — it will restart after a 4s cooldown
          stopRecognition();
          if (activeRef.current) {
            restartTimerRef.current = setTimeout(() => {
              startRecognitionRef.current();
            }, 4000);
          }
          return;
        }
      }
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'not-allowed' || e.error === 'permission-denied') {
        // Mic permission denied — disable silently
        activeRef.current = false;
        setWakewordEnabled(false);
        return;
      }
      // Other errors (network, aborted) — restart after brief delay
      if (activeRef.current) {
        restartTimerRef.current = setTimeout(() => {
          startRecognitionRef.current();
        }, 1200);
      }
    };

    rec.onend = () => {
      // Auto-restart when recognition ends naturally
      if (activeRef.current) {
        restartTimerRef.current = setTimeout(() => {
          startRecognitionRef.current();
        }, 400);
      }
    };

    try {
      rec.start();
    } catch {
      // Already started or another error — restart after delay
      restartTimerRef.current = setTimeout(() => {
        startRecognitionRef.current();
      }, 1000);
    }
  }, [stopRecognition, lang]);

  useEffect(() => {
    startRecognitionRef.current = startRecognition;
  }, [startRecognition]);

  useEffect(() => {
    if (enabled && !paused) {
      activeRef.current = true;
      startRecognition();
    } else {
      activeRef.current = false;
      stopRecognition();
    }
    return () => {
      activeRef.current = false;
      stopRecognition();
    };
  }, [enabled, paused, lang, startRecognition, stopRecognition]);
}
