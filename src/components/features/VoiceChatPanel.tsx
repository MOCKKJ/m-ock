
/**
 * VoiceChatPanel — Push-to-talk voice chat for MockJ
 * Uses useVoiceMode hook (Web Speech API) for STT + ElevenLabs TTS for responses
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, X, Volume2, VolumeX, Loader2, Settings2, Download, RefreshCw, Activity, Edit3 } from 'lucide-react';
import { useTTS, isBrowserFallbackActive } from '@/hooks/useTTS';
import { getTTSHealthStatus, recheckTTSHealth, TTSHealthStatus } from '@/hooks/useTTSHealthCheck';
import { useVoiceMode } from '@/hooks/useVoiceMode';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Analytics } from '@/lib/analytics';
import { getCustomWakeword, setCustomWakeword, DEFAULT_WAKEWORD } from '@/hooks/useWakeword';

interface VoiceChatPanelProps {
  onClose: () => void;
  onSendMessage: (text: string) => Promise<string | void>;
  lastAIResponse?: string;
}

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'retrying';

const WAVE_COUNT = 7;

function makeVoiceMsgId() { return `voice-chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function detectBrowserLanguage(): string {
  try {
    const nav = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
    const prefix = nav.split('-')[0].toLowerCase();
    const MAP: Record<string, string> = {
      en: 'en-US', es: 'es-ES', pt: 'pt-BR',
      fr: 'fr-FR', ht: 'ht',   ar: 'ar-SA',
      zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', hi: 'hi-IN',
    };
    return MAP[prefix] ?? 'en-US';
  } catch { return 'en-US'; }
}

const LANGUAGES = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'es-ES', label: 'Spanish' },
  { code: 'pt-BR', label: 'Portuguese' },
  { code: 'fr-FR', label: 'French' },
  { code: 'ht',    label: 'Haitian Creole' },
  { code: 'ar-SA', label: 'Arabic' },
  { code: 'zh-CN', label: 'Chinese' },
  { code: 'ja-JP', label: 'Japanese' },
  { code: 'ko-KR', label: 'Korean' },
  { code: 'hi-IN', label: 'Hindi' },
];

export default function VoiceChatPanel({ onClose, onSendMessage }: VoiceChatPanelProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [continuousMode, setContinuousMode] = useState(false);
  const [history, setHistory] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [selectedLang, setSelectedLang] = useState(() => detectBrowserLanguage());
  const autoDetectedLang = detectBrowserLanguage();
  const [showSettings, setShowSettings] = useState(false);
  const [ttsRetry, setTtsRetry] = useState<{ type: 'auth' | 'quota'; text: string } | null>(null);
  const [ttsHealth, setTtsHealth] = useState<TTSHealthStatus>(() => getTTSHealthStatus());
  const [ttsFallback, setTtsFallback] = useState(() => isBrowserFallbackActive());
  const [bargeInSensitivity, setBargeInSensitivity] = useState(0.5);
  const [bargeInActive, setBargeInActive] = useState(false);
  // Custom wakeword
  const [customWakeword, setCustomWakewordState] = useState(() => getCustomWakeword());
  const [wakewordDraft, setWakewordDraft] = useState(() => getCustomWakeword());
  const [wakewordEditing, setWakewordEditing] = useState(false);

  const bargeInCtxRef   = useRef<AudioContext | null>(null);
  const bargeInAnalyser = useRef<AnalyserNode | null>(null);
  const bargeInStream   = useRef<MediaStream | null>(null);
  const bargeInFrameRef = useRef<number | null>(null);
  const bargeInRunning  = useRef(false);
  const bargeInSensRef  = useRef(0.5);

  const exportSession = () => {
    if (history.length === 0) return;
    const lines = ['MockJ Voice Session Export', `Date: ${new Date().toLocaleString()}`, `Exchanges: ${history.length}`, '', '---'];
    history.forEach((h, i) => { lines.push(`[${i + 1}] ${h.role === 'user' ? 'You' : 'MockJ'}:`); lines.push(h.text); lines.push(''); });
    lines.push('--- End of session ---');
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `mockj-voice-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const historyContainerRef = useRef<HTMLDivElement>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);

  const processingRef = useRef(false);
  const continuousModeRef = useRef(false);
  const retryCountRef = useRef(0);
  const pendingRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSpeakTextRef = useRef('');
  const voiceMsgIdRef = useRef(makeVoiceMsgId());
  // Use a stable ID for the TTS hook — we reuse the same hook instance across speaks.
  // The dedup key inside useTTS is the text content, not the messageId, so this is safe.
  const STABLE_TTS_ID = 'voice-chat-panel';
  const { speak, stop: stopTTS, isPlaying, state: ttsState } = useTTS(STABLE_TTS_ID);

  useEffect(() => { bargeInSensRef.current = bargeInSensitivity; }, [bargeInSensitivity]);

  const voiceModeTranscriptRef = useRef('');
  const { isListening: vmListening, voiceError: vmError, startVoice: vmStart, stopVoice: vmStop } =
    useVoiceMode((text) => {
      voiceModeTranscriptRef.current = text;
      setTranscript(text);
      setInterimTranscript(text);
    });

  const hasSpeechAPI = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const stopBargeInMonitor = useCallback(() => {
    bargeInRunning.current = false;
    setBargeInActive(false);
    if (bargeInFrameRef.current) { cancelAnimationFrame(bargeInFrameRef.current); bargeInFrameRef.current = null; }
    if (bargeInAnalyser.current) { try { bargeInAnalyser.current.disconnect(); } catch { /* ignore */ } bargeInAnalyser.current = null; }
    if (bargeInCtxRef.current) { bargeInCtxRef.current.close().catch(() => {}); bargeInCtxRef.current = null; }
    if (bargeInStream.current) { bargeInStream.current.getTracks().forEach(t => t.stop()); bargeInStream.current = null; }
  }, []);

  const startBargeInMonitor = useCallback(async () => {
    if (bargeInRunning.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      bargeInStream.current = stream;
      const ctx = new AudioContext();
      bargeInCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      bargeInAnalyser.current = analyser;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      bargeInRunning.current = true;
      setBargeInActive(true);
      const check = () => {
        if (!bargeInRunning.current) return;
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) { const v = (dataArray[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / dataArray.length);
        const threshold = 0.12 - bargeInSensRef.current * 0.11;
        if (rms > threshold) {
          stopBargeInMonitor(); stopTTS();
          setTimeout(() => startListeningRef.current(), 150); return;
        }
        bargeInFrameRef.current = requestAnimationFrame(check);
      };
      bargeInFrameRef.current = requestAnimationFrame(check);
    } catch (err) {
      console.warn('[VoiceChat] Barge-in monitor unavailable:', err);
      bargeInRunning.current = false; setBargeInActive(false);
    }
  }, [stopBargeInMonitor, stopTTS]);

  useEffect(() => {
    if (voiceState === 'speaking' && bargeInSensitivity > 0) startBargeInMonitor();
    else stopBargeInMonitor();
  }, [voiceState, bargeInSensitivity, startBargeInMonitor, stopBargeInMonitor]);

  useEffect(() => {
    const handler = (e: Event) => { const { status } = (e as CustomEvent<{ status: TTSHealthStatus }>).detail; setTtsHealth(status); };
    window.addEventListener('mockj:tts-health', handler);
    return () => window.removeEventListener('mockj:tts-health', handler);
  }, []);

  useEffect(() => { const cached = getTTSHealthStatus(); if (cached === 'unavailable') recheckTTSHealth(); }, []);

  useEffect(() => {
    const handler = (e: Event) => { const { active } = (e as CustomEvent<{ active: boolean }>).detail; setTtsFallback(active); };
    window.addEventListener('mockj:tts-fallback', handler);
    return () => window.removeEventListener('mockj:tts-fallback', handler);
  }, []);

  useEffect(() => { continuousModeRef.current = continuousMode; }, [continuousMode]);

  const voiceStateRef = useRef<VoiceState>('idle');
  const autoSpeakRef  = useRef(true);
  useEffect(() => { voiceStateRef.current = voiceState; }, [voiceState]);
  useEffect(() => { autoSpeakRef.current = autoSpeak; }, [autoSpeak]);

  useEffect(() => {
    const handler = () => { if (voiceStateRef.current === 'idle' && hasSpeechAPI && autoSpeakRef.current) startListeningRef.current(); };
    window.addEventListener('mockj:wakeword-activate', handler);
    return () => window.removeEventListener('mockj:wakeword-activate', handler);
  }, [hasSpeechAPI]);

  // Auto-scroll history to latest AI message when MockJ starts speaking
  // Also fire a haptic pulse on mobile so users feel the response start
  useEffect(() => {
    if (voiceState === 'speaking') {
      if (historyEndRef.current) {
        historyEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      // Subtle haptic pulse — confirms TTS started without needing to watch the screen
      if ('vibrate' in navigator) {
        try { navigator.vibrate(50); } catch { /* ignore — some browsers block this */ }
      }
    }
  }, [voiceState]);

  useEffect(() => {
    if (ttsState === 'playing' && voiceState === 'speaking') {
      // TTS confirmed playing — UI already reflects speaking state
    }
    if (ttsState === 'idle' && voiceState === 'speaking') {
      setVoiceState('idle'); retryCountRef.current = 0;
      if (continuousModeRef.current) setTimeout(() => startListeningRef.current(), 600);
    }
  }, [ttsState, voiceState]);

  useEffect(() => {
    const handler = () => {
      if (voiceState === 'speaking') {
        setVoiceState('idle'); retryCountRef.current = 0;
        if (continuousModeRef.current) setTimeout(() => startListeningRef.current(), 600);
      }
    };
    window.addEventListener('mockj:tts-complete', handler);
    return () => window.removeEventListener('mockj:tts-complete', handler);
  }, [voiceState]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { isRateLimit, isAuthError, isQuotaError, text, hasFallback } = (e as CustomEvent<{ isRateLimit: boolean; isAuthError?: boolean; isQuotaError?: boolean; text: string; hasFallback?: boolean }>).detail;
      if (hasFallback) { setVoiceState('speaking'); processingRef.current = false; return; }
      if ((isAuthError || isQuotaError) && text) { setTtsRetry({ type: isAuthError ? 'auth' : 'quota', text }); setVoiceState('idle'); retryCountRef.current = 0; return; }
      if (voiceState !== 'speaking' && voiceState !== 'retrying') return;
      if (retryCountRef.current >= 1) { setVoiceState('idle'); retryCountRef.current = 0; setTtsRetry(null); if (continuousModeRef.current) setTimeout(() => startListeningRef.current(), 800); return; }
      if (isRateLimit) {
        retryCountRef.current += 1; setVoiceState('retrying');
        if (pendingRetryRef.current) clearTimeout(pendingRetryRef.current);
        pendingRetryRef.current = setTimeout(() => {
          pendingRetryRef.current = null;
          const textToRetry = text || lastSpeakTextRef.current;
          if (textToRetry) { setVoiceState('speaking'); speak(textToRetry); }
          else { setVoiceState('idle'); retryCountRef.current = 0; }
        }, 2000);
      } else { setVoiceState('idle'); retryCountRef.current = 0; if (continuousModeRef.current) setTimeout(() => startListeningRef.current(), 600); }
    };
    window.addEventListener('mockj:tts-error', handler);
    return () => window.removeEventListener('mockj:tts-error', handler);
  }, [voiceState, speak]);

  const handleTtsRetry = useCallback(() => {
    if (!ttsRetry) return;
    const text = ttsRetry.text;
    setTtsRetry(null); retryCountRef.current = 0; lastSpeakTextRef.current = text;
    setVoiceState('speaking'); speak(text);
  }, [ttsRetry, speak]);

  const stopListening = useCallback(() => { vmStop(); setInterimTranscript(''); }, [vmStop]);
  const startListeningRef = useRef<() => void>(() => {});

  const startListening = useCallback(() => {
    if (!hasSpeechAPI) { setErrorMsg('Voice input is not supported in this browser. Try Chrome or Edge.'); return; }
    if (processingRef.current) return;
    if (isPlaying) stopTTS();
    setErrorMsg(null); setInterimTranscript(''); voiceModeTranscriptRef.current = ''; setTranscript('');
    vmStart(selectedLang); setVoiceState('listening');
    Analytics.featureUsed('voice_input', 'voice_chat');
  }, [hasSpeechAPI, isPlaying, stopTTS, vmStart, selectedLang]);

  useEffect(() => { if (vmError) setErrorMsg(vmError); }, [vmError]);

  const prevVmListeningRef = useRef(false);
  useEffect(() => {
    const wasListening = prevVmListeningRef.current;
    prevVmListeningRef.current = vmListening;
    if (wasListening && !vmListening) {
      const finalText = voiceModeTranscriptRef.current.trim();
      setInterimTranscript('');
      if (finalText && !processingRef.current) handleSendVoiceRef.current(finalText);
      else { setVoiceState('idle'); voiceModeTranscriptRef.current = ''; setTranscript(''); if (continuousModeRef.current) setTimeout(() => startListeningRef.current(), 600); }
    }
  }, [vmListening]);

  const handleSendVoice = useCallback(async (text: string) => {
    if (processingRef.current) return;
    processingRef.current = true; setVoiceState('processing'); voiceModeTranscriptRef.current = ''; setTranscript('');
    setHistory(prev => [...prev, { role: 'user', text }]);
    try {
      const response = await onSendMessage(text);
      if (response && typeof response === 'string') {
        setHistory(prev => [...prev, { role: 'ai', text: response }]);
        if (autoSpeak) {
          const clean = response.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, '').replace(/\[VERIFY\]\{[\s\S]*?\}/g, '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/#{1,6}\s/g, '').replace(/\n{2,}/g, '. ').trim().slice(0, 1000);
          if (clean) {
            retryCountRef.current = 0; lastSpeakTextRef.current = clean; setVoiceState('speaking'); processingRef.current = false; speak(clean);
          }
          else { processingRef.current = false; setVoiceState('idle'); if (continuousModeRef.current) setTimeout(() => startListeningRef.current(), 300); }
        } else { processingRef.current = false; setVoiceState('idle'); if (continuousModeRef.current) setTimeout(() => startListeningRef.current(), 300); }
      } else { processingRef.current = false; setVoiceState('idle'); }
    } catch { processingRef.current = false; toast.error('Failed to get response. Try again.'); setVoiceState('idle'); }
  }, [onSendMessage, autoSpeak, speak]);

  const handleSendVoiceRef = useRef(handleSendVoice);
  useEffect(() => { handleSendVoiceRef.current = handleSendVoice; }, [handleSendVoice]);
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  const handleMicPress = () => {
    if (voiceState === 'listening') { stopListening(); setVoiceState('idle'); if (continuousMode) setContinuousMode(false); }
    else if (voiceState === 'idle') startListening();
  };

  const handleContinuousToggle = () => {
    const next = !continuousMode;
    setContinuousMode(next);
    if (next && voiceState === 'idle') setTimeout(() => startListeningRef.current(), 200);
    else if (!next) { stopListening(); stopTTS(); setVoiceState('idle'); }
  };

  const handleStopSpeaking = () => { stopTTS(); setVoiceState('idle'); };

  useEffect(() => {
    return () => { vmStop(); stopTTS(); stopBargeInMonitor(); if (pendingRetryRef.current) clearTimeout(pendingRetryRef.current); };
  }, [vmStop, stopTTS, stopBargeInMonitor]);

  const detectedLangLabel = LANGUAGES.find(l => l.code === autoDetectedLang)?.label;

  const bargeInLabel = bargeInSensitivity === 0 ? 'Off' : bargeInSensitivity < 0.4 ? 'Low' : bargeInSensitivity < 0.75 ? 'Medium' : 'High';
  const bargeInColor = bargeInSensitivity === 0 ? 'hsl(224 15% 45%)' : bargeInSensitivity < 0.4 ? 'hsl(38 95% 65%)' : bargeInSensitivity < 0.75 ? 'hsl(142 70% 60%)' : 'hsl(191 97% 55%)';
  const bargeInBg    = bargeInSensitivity === 0 ? 'hsl(224 15% 18%)' : bargeInSensitivity < 0.4 ? 'hsl(38 95% 60% / 0.12)' : bargeInSensitivity < 0.75 ? 'hsl(142 70% 55% / 0.12)' : 'hsl(191 97% 55% / 0.12)';
  const bargeInBorder= bargeInSensitivity === 0 ? 'hsl(224 15% 25%)' : bargeInSensitivity < 0.4 ? 'hsl(38 95% 60% / 0.4)' : bargeInSensitivity < 0.75 ? 'hsl(142 70% 55% / 0.4)' : 'hsl(191 97% 55% / 0.4)';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md">
      <div
        className="w-full sm:max-w-md bg-[hsl(224_20%_7%)] border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'hsl(4 90% 58% / 0.12)', border: '1px solid hsl(4 90% 58% / 0.35)' }}>
              <Mic className="w-4 h-4" style={{ color: 'hsl(4 90% 58%)' }} />
            </div>
            <div>
              <div className="flex items-center gap-2 leading-none">
                <h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Voice Chat</h2>
                {ttsHealth === 'checking' && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: 'hsl(38 95% 60% / 0.1)', border: '1px solid hsl(38 95% 60% / 0.35)', color: 'hsl(38 95% 65%)' }}><RefreshCw className="w-2 h-2 animate-spin" />Checking…</span>}
                {ttsHealth === 'ready' && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: 'hsl(142 70% 55% / 0.12)', border: '1px solid hsl(142 70% 55% / 0.35)', color: 'hsl(142 70% 60%)' }}><span className="w-1 h-1 rounded-full bg-[hsl(142_70%_55%)] animate-pulse" />Voice Ready</span>}
                {ttsHealth === 'unavailable' && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold cursor-pointer" style={{ background: 'hsl(0 70% 55% / 0.1)', border: '1px solid hsl(0 70% 55% / 0.35)', color: 'hsl(0 70% 65%)' }} onClick={recheckTTSHealth}><span className="w-1 h-1 rounded-full bg-[hsl(0_70%_55%)]" />Unavailable · retry</span>}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {!hasSpeechAPI ? 'Voice not supported' : continuousMode ? '🟢 Live mode active' : `Say "${customWakeword}" or tap mic`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button onClick={exportSession} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-[hsl(142_70%_55%)] border border-border hover:border-[hsl(142_70%_55%_/_0.4)] transition-all" title="Export session">
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={() => setShowSettings(v => !v)} className={cn('w-8 h-8 rounded-lg flex items-center justify-center border transition-all', showSettings ? 'bg-[hsl(142_70%_55%_/_0.1)] border-[hsl(142_70%_55%_/_0.4)] text-[hsl(142_70%_55%)]' : 'text-muted-foreground hover:text-foreground border-border hover:border-[hsl(4_90%_58%_/_0.4)]')}>
              <Settings2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground border border-border hover:border-[hsl(4_90%_58%_/_0.4)] transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="px-5 py-4 border-b border-border bg-[hsl(224_15%_9%)] space-y-5 overflow-y-auto" style={{ maxHeight: '65vh' }}>

            {/* ── Custom Wakeword ─────────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-foreground">Wake Phrase</p>
                  <p className="text-[10px] text-muted-foreground">The phrase MockJ listens for (default: "hey mock")</p>
                </div>
                <button
                  onClick={() => { setWakewordEditing(v => !v); setWakewordDraft(customWakeword); }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border transition-all"
                  style={{ background: wakewordEditing ? 'hsl(142 70% 55% / 0.12)' : 'transparent', borderColor: wakewordEditing ? 'hsl(142 70% 55% / 0.4)' : 'hsl(224 15% 25%)', color: wakewordEditing ? 'hsl(142 70% 60%)' : 'hsl(224 15% 50%)' }}
                >
                  <Edit3 className="w-3 h-3" />
                </button>
              </div>
              {wakewordEditing ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={wakewordDraft}
                    onChange={e => setWakewordDraft(e.target.value)}
                    placeholder={DEFAULT_WAKEWORD}
                    maxLength={40}
                    className="w-full bg-[hsl(224_15%_12%)] border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-[hsl(142_70%_55%_/_0.5)] transition-colors"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const saved = wakewordDraft.trim() || DEFAULT_WAKEWORD;
                        setCustomWakeword(saved); setCustomWakewordState(saved); setWakewordEditing(false);
                        toast.success(`Wake phrase set to "${saved}"`);
                      }
                      if (e.key === 'Escape') setWakewordEditing(false);
                    }}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={() => { const saved = wakewordDraft.trim() || DEFAULT_WAKEWORD; setCustomWakeword(saved); setCustomWakewordState(saved); setWakewordEditing(false); toast.success(`Wake phrase set to "${saved}"`); }} className="flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-all" style={{ background: 'hsl(142 70% 55% / 0.15)', border: '1px solid hsl(142 70% 55% / 0.4)', color: 'hsl(142 70% 60%)' }}>Save</button>
                    <button onClick={() => { setCustomWakeword(DEFAULT_WAKEWORD); setCustomWakewordState(DEFAULT_WAKEWORD); setWakewordDraft(DEFAULT_WAKEWORD); setWakewordEditing(false); toast.success('Reset to default'); }} className="flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-all" style={{ background: 'rgba(100,120,200,0.08)', border: '1px solid rgba(100,120,200,0.2)', color: 'rgba(160,180,220,0.6)' }}>Reset</button>
                  </div>
                  <p className="text-[9px] text-muted-foreground/50">Press Enter to save · Esc to cancel</p>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer" style={{ background: 'hsl(142 70% 55% / 0.06)', border: '1px solid hsl(142 70% 55% / 0.2)' }} onClick={() => { setWakewordEditing(true); setWakewordDraft(customWakeword); }}>
                  <span className="text-base">🎙</span>
                  <span className="text-sm font-bold flex-1" style={{ color: 'hsl(142 70% 60%)' }}>"{customWakeword}"</span>
                  <span className="text-[9px] text-muted-foreground/50">tap to edit</span>
                </div>
              )}
            </div>

            {/* ── Recognition Language ────────────────────────────── */}
            <div className="space-y-2 pt-1 border-t border-border">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Recognition Language</label>
                {selectedLang === autoDetectedLang && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: 'hsl(142 70% 55% / 0.1)', border: '1px solid hsl(142 70% 55% / 0.3)', color: 'hsl(142 70% 60%)' }} title={`Auto-detected: ${typeof navigator !== 'undefined' ? navigator.language : ''}`}>
                    <span className="w-1 h-1 rounded-full bg-[hsl(142_70%_55%)]" />Auto-detected
                  </span>
                )}
              </div>
              <select value={selectedLang} onChange={e => setSelectedLang(e.target.value)} className="w-full bg-[hsl(224_15%_12%)] border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-[hsl(4_90%_58%_/_0.5)] transition-colors">
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}{l.code === autoDetectedLang ? ' ✦ auto' : ''}</option>)}
              </select>
              {detectedLangLabel && selectedLang !== autoDetectedLang && (
                <button onClick={() => setSelectedLang(autoDetectedLang)} className="text-[10px] font-semibold transition-colors" style={{ color: 'hsl(142 70% 55% / 0.7)' }}>↩ Restore auto-detected ({detectedLangLabel})</button>
              )}
            </div>

            {/* ── Auto-Speak toggle ─────────────────────────────────── */}
            <div className="flex items-center justify-between pt-1 border-t border-border">
              <div>
                <p className="text-xs font-semibold text-foreground">Auto-Speak Replies</p>
                <p className="text-[10px] text-muted-foreground">MockJ reads responses aloud</p>
              </div>
              <button onClick={() => setAutoSpeak(v => !v)} className="w-10 h-5 rounded-full transition-all duration-200 relative shrink-0" style={{ background: autoSpeak ? 'hsl(4 90% 58%)' : 'hsl(224 15% 18%)' }}>
                <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200', autoSpeak ? 'left-[22px]' : 'left-0.5')} />
              </button>
            </div>

            {/* ── Barge-In Sensitivity ──────────────────────────────── */}
            <div className="space-y-3 pt-1 border-t border-border">
              <div className="flex items-start gap-2.5">
                <Activity className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: bargeInActive ? 'hsl(191 97% 55%)' : bargeInColor }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground">Barge-In Sensitivity</p>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: bargeInBg, border: `1px solid ${bargeInBorder}`, color: bargeInColor }}>{bargeInLabel}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{bargeInSensitivity === 0 ? 'Off — use mic button to interrupt MockJ' : 'Speak while MockJ talks to interrupt'}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <input type="range" min={0} max={1} step={0.05} value={bargeInSensitivity} onChange={e => setBargeInSensitivity(parseFloat(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: bargeInSensitivity === 0 ? 'hsl(224 15% 18%)' : `linear-gradient(to right, hsl(142 70% 55%) 0%, hsl(191 97% 55%) ${bargeInSensitivity * 100}%, hsl(224 15% 18%) ${bargeInSensitivity * 100}%, hsl(224 15% 18%) 100%)` }} />
                <div className="flex justify-between">
                  {['Off','Low','Med','High'].map(l => <span key={l} className="text-[9px] text-muted-foreground/40">{l}</span>)}
                </div>
              </div>
              {bargeInActive && (
                <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-[10px] font-semibold" style={{ background: 'hsl(191 97% 55% / 0.07)', border: '1px solid hsl(191 97% 55% / 0.3)', color: 'hsl(191 97% 65%)' }}>
                  <span className="flex gap-0.5 items-end">{[0,1,2,3,4].map(i => <span key={i} className="w-0.5 rounded-full animate-bounce" style={{ height: `${5+i*2}px`, background: 'hsl(191 97% 55%)', animationDelay: `${i*80}ms`, display: 'inline-block' }} />)}</span>
                  Monitoring mic — speak to interrupt MockJ
                </div>
              )}
            </div>

            {/* ── Voice API Health ──────────────────────────────────── */}
            <div className="flex items-center justify-between pt-1 border-t border-border">
              <div>
                <p className="text-xs font-semibold text-foreground">Voice API Health</p>
                <p className="text-[10px] text-muted-foreground">{ttsHealth === 'checking' ? 'Probing ElevenLabs…' : ttsHealth === 'ready' ? '✅ ElevenLabs responding' : ttsHealth === 'unavailable' ? '❌ API key invalid or quota empty' : 'Not yet tested'}</p>
              </div>
              <button onClick={recheckTTSHealth} disabled={ttsHealth === 'checking'} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all active:scale-95 disabled:opacity-50 shrink-0" style={{ background: ttsHealth === 'ready' ? 'hsl(142 70% 55% / 0.12)' : ttsHealth === 'unavailable' ? 'hsl(0 70% 55% / 0.12)' : 'hsl(191 97% 55% / 0.1)', border: `1px solid ${ttsHealth === 'ready' ? 'hsl(142 70% 55% / 0.4)' : ttsHealth === 'unavailable' ? 'hsl(0 70% 55% / 0.4)' : 'hsl(191 97% 55% / 0.35)'}`, color: ttsHealth === 'ready' ? 'hsl(142 70% 60%)' : ttsHealth === 'unavailable' ? 'hsl(0 70% 65%)' : 'hsl(191 97% 60%)' }}>
                {ttsHealth === 'checking' ? <><RefreshCw className="w-3 h-3 animate-spin" /> Testing…</> : <><RefreshCw className="w-3 h-3" /> Re-test</>}
              </button>
            </div>
          </div>
        )}

        {/* Conversation history */}
        {history.length > 0 && (
          <div ref={historyContainerRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3 max-h-48">
            {history.map((h, i) => {
              // The latest AI message is highlighted while MockJ is speaking
              const isCurrentlySpeaking =
                voiceState === 'speaking' &&
                h.role === 'ai' &&
                i === history.length - 1;
              return (
                <div key={i} className={cn('flex', h.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed transition-all duration-300',
                      h.role === 'user'
                        ? 'bg-[hsl(265_80%_65%_/_0.15)] border border-[hsl(265_80%_65%_/_0.25)] text-foreground'
                        : 'bg-[hsl(224_15%_14%)] border text-muted-foreground',
                    )}
                    style={h.role === 'ai' ? {
                      borderColor: isCurrentlySpeaking ? 'hsl(191 97% 55% / 0.7)' : 'hsl(224 15% 20%)',
                      boxShadow: isCurrentlySpeaking ? '0 0 16px hsl(191 97% 55% / 0.25)' : 'none',
                      background: isCurrentlySpeaking ? 'hsl(191 97% 55% / 0.07)' : undefined,
                      animation: isCurrentlySpeaking ? 'tts-pulse 1.8s ease-in-out infinite' : 'none',
                    } : {}}
                  >
                    {isCurrentlySpeaking && (
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="flex gap-0.5 items-end">
                          {[0,1,2,3].map(j => (
                            <span
                              key={j}
                              className="w-0.5 rounded-full animate-bounce"
                              style={{
                                height: `${4 + j * 2}px`,
                                background: 'hsl(191 97% 55%)',
                                animationDelay: `${j * 80}ms`,
                                animationDuration: '600ms',
                                display: 'inline-block',
                              }}
                            />
                          ))}
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'hsl(191 97% 60%)' }}>Speaking</span>
                      </div>
                    )}
                    {h.text.slice(0, 200)}{h.text.length > 200 ? '…' : ''}
                  </div>
                </div>
              );
            })}
            <div ref={historyEndRef} />
          </div>
        )}

        {/* Main voice UI */}
        <div className="flex flex-col items-center gap-6 p-8">
          <div className="relative flex items-center justify-center w-32 h-32">
            <div className={cn('absolute inset-0 rounded-full border-2 transition-all duration-500', voiceState === 'listening' ? 'border-[hsl(4_90%_58%)] animate-ping opacity-30' : voiceState === 'speaking' ? 'border-[hsl(191_97%_55%)] animate-ping opacity-30' : voiceState === 'retrying' ? 'border-[hsl(38_95%_60%)] animate-ping opacity-20' : 'border-transparent')} />
            <div className={cn('absolute inset-3 rounded-full border transition-all duration-300', voiceState === 'listening' ? 'border-[hsl(4_90%_58%_/_0.5)] bg-[hsl(4_90%_58%_/_0.08)]' : voiceState === 'speaking' ? 'border-[hsl(191_97%_55%_/_0.5)] bg-[hsl(191_97%_55%_/_0.08)]' : voiceState === 'processing' || voiceState === 'retrying' ? 'border-[hsl(38_95%_60%_/_0.5)] bg-[hsl(38_95%_60%_/_0.08)]' : 'border-border bg-[hsl(224_15%_10%)]')} />
            <button
              onClick={voiceState === 'speaking' ? handleStopSpeaking : handleMicPress}
              disabled={voiceState === 'processing' || voiceState === 'retrying' || !hasSpeechAPI}
              className="relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 disabled:cursor-not-allowed"
              style={{ background: voiceState === 'listening' ? 'linear-gradient(135deg, hsl(4 90% 58%), hsl(20 90% 52%))' : voiceState === 'speaking' ? 'linear-gradient(135deg, hsl(191 97% 55%), hsl(191 97% 40%))' : voiceState === 'retrying' || voiceState === 'processing' ? 'hsl(38 95% 60% / 0.15)' : 'hsl(224 15% 14%)', border: voiceState === 'idle' ? '2px solid hsl(224 15% 22%)' : 'none', boxShadow: voiceState === 'listening' ? '0 0 40px hsl(4 90% 58% / 0.5)' : voiceState === 'speaking' ? '0 0 40px hsl(191 97% 55% / 0.4)' : voiceState === 'retrying' ? '0 0 20px hsl(38 95% 60% / 0.3)' : 'none' }}
            >
              {voiceState === 'processing' || voiceState === 'retrying' ? (
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'hsl(38 95% 60%)' }} />
              ) : voiceState === 'speaking' ? (
                <div className="flex items-end justify-center gap-[3px]">
                  {Array.from({ length: WAVE_COUNT }).map((_, i) => <div key={i} className="w-1 rounded-full bg-[hsl(224_20%_6%)] animate-bounce" style={{ height: `${8 + Math.sin(i * 0.8) * 8 + 4}px`, animationDelay: `${i * 80}ms`, animationDuration: '600ms' }} />)}
                </div>
              ) : voiceState === 'listening' ? (
                <MicOff className="w-8 h-8 text-white" />
              ) : (
                <Mic className="w-8 h-8 text-muted-foreground" />
              )}
            </button>
          </div>

          <div className="text-center space-y-1">
            <p className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              {voiceState === 'idle' ? (continuousMode ? '⏸ Paused — tap to resume' : 'Tap to speak') : voiceState === 'listening' ? '🎙️ Listening…' : voiceState === 'processing' ? '🧠 Thinking…' : voiceState === 'retrying' ? '🔄 Retrying voice…' : bargeInActive ? '🔊 Speaking — say something to interrupt' : '🔊 MockJ is speaking…'}
            </p>
            {voiceState === 'listening' && <p className="text-xs text-muted-foreground">{interimTranscript || transcript || 'Say something…'}</p>}
            {voiceState === 'idle' && transcript && <p className="text-xs text-muted-foreground/60 max-w-[240px] text-center">"{transcript}"</p>}
          </div>

          {ttsFallback && (
            <div className="w-full rounded-xl border px-4 py-3 flex items-center gap-3" style={{ background: 'hsl(38 95% 60% / 0.07)', borderColor: 'hsl(38 95% 60% / 0.35)' }}>
              <span className="text-base shrink-0">🔊</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold" style={{ color: 'hsl(38 95% 65%)' }}>Browser voice active (ElevenLabs unavailable)</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">Fix: update <strong className="text-foreground">ELEVENLABS_API_KEY</strong> in Cloud → Secrets</p>
              </div>
              <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: 'hsl(38 95% 60%)' }} />
            </div>
          )}

          {ttsRetry && !ttsFallback && (
            <div className="w-full rounded-xl border px-4 py-3 flex items-start gap-3" style={{ background: ttsRetry.type === 'auth' ? 'hsl(0 70% 55% / 0.07)' : 'hsl(38 95% 60% / 0.07)', borderColor: ttsRetry.type === 'auth' ? 'hsl(0 70% 55% / 0.35)' : 'hsl(38 95% 60% / 0.35)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold" style={{ color: ttsRetry.type === 'auth' ? 'hsl(0 70% 65%)' : 'hsl(38 95% 65%)' }}>{ttsRetry.type === 'auth' ? '🔑 Voice API key invalid (401)' : '🎙 Voice credits exhausted'}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{ttsRetry.type === 'auth' ? 'Update ELEVENLABS_API_KEY in Cloud → Secrets, then tap Retry.' : 'Top up at elevenlabs.io/subscription, then tap Retry.'}</p>
              </div>
              <button onClick={handleTtsRetry} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95" style={{ background: ttsRetry.type === 'auth' ? 'hsl(0 70% 55% / 0.15)' : 'hsl(38 95% 60% / 0.15)', border: ttsRetry.type === 'auth' ? '1px solid hsl(0 70% 55% / 0.5)' : '1px solid hsl(38 95% 60% / 0.5)', color: ttsRetry.type === 'auth' ? 'hsl(0 70% 65%)' : 'hsl(38 95% 65%)' }}>🔄 Retry Voice</button>
            </div>
          )}

          {errorMsg && (
            <div className="w-full flex items-start gap-2 px-4 py-3 rounded-xl bg-destructive/8 border border-destructive/25">
              <p className="text-xs text-destructive leading-relaxed">{errorMsg}</p>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap justify-center">
            <button onClick={() => setAutoSpeak(v => !v)} className={cn('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all duration-200', autoSpeak ? 'bg-[hsl(4_90%_58%_/_0.1)] border-[hsl(4_90%_58%_/_0.4)] text-[hsl(4_90%_58%)]' : 'border-border text-muted-foreground hover:text-foreground')}>
              {autoSpeak ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              {autoSpeak ? 'Voice ON' : 'Voice OFF'}
            </button>
            <button onClick={handleContinuousToggle} className={cn('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all duration-200', continuousMode ? 'bg-[hsl(142_70%_55%_/_0.1)] border-[hsl(142_70%_55%_/_0.5)] text-[hsl(142_70%_55%)]' : 'border-border text-muted-foreground hover:text-foreground')}>
              <span className={cn('w-1.5 h-1.5 rounded-full', continuousMode ? 'bg-[hsl(142_70%_55%)] animate-pulse' : 'bg-muted-foreground/40')} />
              {continuousMode ? 'Live Mode ON' : 'Live Mode'}
            </button>
            {bargeInSensitivity > 0 && (
              <button onClick={() => setShowSettings(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all duration-200" style={{ background: bargeInActive ? 'hsl(191 97% 55% / 0.1)' : 'transparent', borderColor: bargeInActive ? 'hsl(191 97% 55% / 0.5)' : 'hsl(224 15% 22%)', color: bargeInActive ? 'hsl(191 97% 55%)' : 'hsl(224 15% 50%)' }}>
                <Activity className="w-3.5 h-3.5" />
                {bargeInActive ? 'Listening' : `Barge-In: ${bargeInLabel}`}
              </button>
            )}
          </div>

          {!hasSpeechAPI && (
            <div className="w-full px-4 py-3 rounded-xl bg-[hsl(38_95%_60%_/_0.08)] border border-[hsl(38_95%_60%_/_0.25)] text-center">
              <p className="text-xs text-[hsl(38_95%_60%)] font-semibold">Browser not supported</p>
              <p className="text-[11px] text-muted-foreground mt-1">Voice Chat requires Chrome, Edge, or Safari.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
