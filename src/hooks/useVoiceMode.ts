/**
 * useVoiceMode.ts
 * Lightweight standalone hook for Web Speech API voice input.
 * Used by simple components that need mic → transcript without
 * the full wakeword/conversation loop in ChatInput.tsx.
 */

import { useRef, useState } from 'react';

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onstart:  (() => void) | null;
  onresult: ((e: SpeechRecognitionResultEvent) => void) | null;
  onerror:  ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend:    (() => void) | null;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: { transcript: string; confidence: number };
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResultEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  return (
    (window as Window & { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ??
    (window as Window & { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition ??
    null
  );
}

export function useVoiceMode(onTranscript: (text: string) => void) {
  const [isListening, setIsListening]   = useState(false);
  const [voiceError,  setVoiceError]    = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  // Accumulate final transcript parts across multiple result events
  const accumulatedRef = useRef('');

  const startVoice = (lang = 'en-US') => {
    setVoiceError(null);
    accumulatedRef.current = '';

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setVoiceError('Voice mode is not supported in this browser. Use Chrome or Edge.');
      return;
    }

    // Stop any existing instance before creating a new one
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang             = lang;
    recognition.continuous       = false;
    // Keep interimResults false — we only want final results to avoid premature sends
    recognition.interimResults   = false;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: SpeechRecognitionResultEvent) => {
      // Collect all FINAL results in this event batch
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        // Only use final results (isFinal = true)
        if (result.isFinal) {
          accumulatedRef.current += result[0].transcript + ' ';
        }
      }
      // Deliver the accumulated final text so far
      const text = accumulatedRef.current.trim();
      if (text) onTranscript(text);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Voice recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setVoiceError('Microphone permission is blocked. Allow mic access in your browser settings.');
      } else if (event.error === 'no-speech') {
        // Don't set an error for no-speech — just stop silently
        console.warn('[useVoiceMode] no-speech detected, stopping');
      } else if (event.error === 'aborted') {
        // Normal stop — no error
      } else {
        setVoiceError(`Voice error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      console.error('[useVoiceMode] Failed to start recognition:', err);
      setVoiceError('Failed to start microphone. Try again.');
      setIsListening(false);
    }
  };

  const stopVoice = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }
    setIsListening(false);
  };

  return { isListening, voiceError, startVoice, stopVoice };
}
