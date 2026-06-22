import {
  useState,
  useRef,
  KeyboardEvent,
  useEffect,
  useCallback,
  type DragEvent,
} from 'react';
import {
  Send,
  Image,
  Video,
  MessageSquare,
  Mic,
  MicOff,
  BrainCircuit,
  Volume2,
  VolumeX,
  Radio,
  PhoneCall,
  Paperclip,
  X,
} from 'lucide-react';
import { ChatMode } from '@/types/chat';
import { cn } from '@/lib/utils';
import { Analytics } from '@/lib/analytics';
import { getAutoSpeak, setAutoSpeak } from '@/hooks/useAutoSpeak';
import {
  useWakeword,
  getWakewordEnabled,
  setWakewordEnabled,
  getWakewordSensitivity,
  setWakewordSensitivity,
  WakewordSensitivity,
  getWakewordLang,
  setWakewordLang,
} from '@/hooks/useWakeword';
import { stopAllTTS, isTTSPlaying } from '@/hooks/useTTS';
import { supabase } from '@/lib/supabase';

interface ChatInputProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  onSend: (text: string, imageDataUrl?: string) => void;
  disabled?: boolean;
  pendingPrompt?: string | null;
  onPendingPromptConsumed?: () => void;
  deepReasoning?: boolean;
  onDeepReasoningChange?: (val: boolean) => void;
  onOpenPhotoRecreator?: () => void;
  onOpenVoiceChat?: () => void;
}

const WAKEWORD_LANGUAGES: { code: string; label: string; short: string }[] = [
  { code: 'en-US', label: 'English (US)', short: 'EN' },
  { code: 'es-ES', label: 'Spanish', short: 'ES' },
  { code: 'pt-BR', label: 'Portuguese', short: 'PT' },
  { code: 'fr-FR', label: 'French', short: 'FR' },
  { code: 'ht', label: 'Haitian Creole', short: 'HT' },
  { code: 'ar-SA', label: 'Arabic', short: 'AR' },
  { code: 'zh-CN', label: 'Chinese', short: 'ZH' },
  { code: 'ja-JP', label: 'Japanese', short: 'JA' },
  { code: 'ko-KR', label: 'Korean', short: 'KO' },
  { code: 'hi-IN', label: 'Hindi', short: 'HI' },
];

// Safer Web Speech API shim for TypeScript
type MockJSpeechRecognitionResult = {
  isFinal: boolean;
  0: {
    transcript: string;
    confidence?: number;
  };
};

type MockJSpeechRecognitionEvent = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: MockJSpeechRecognitionResult;
  };
};

type MockJSpeechRecognitionErrorEvent = Event & {
  error: string;
};

type MockJSpeechRecognition = EventTarget & {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onstart: (() => void) | null;
  onresult: ((e: MockJSpeechRecognitionEvent) => void) | null;
  onerror: ((e: MockJSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type MockJSpeechRecognitionConstructor = new () => MockJSpeechRecognition;

type MockJSpeechWindow = Window & {
  SpeechRecognition?: MockJSpeechRecognitionConstructor;
  webkitSpeechRecognition?: MockJSpeechRecognitionConstructor;
};

type ConvPhase = 'idle' | 'greeting' | 'listening' | 'processing' | 'speaking';

const isMobile =
  typeof window !== 'undefined' &&
  window.matchMedia('(pointer: coarse)').matches;

const MODE_CONFIG = {
  chat: {
    icon: MessageSquare,
    placeholder: 'Yo, ask me anything — I got you 🔥  (or say "Hey Mock")',
    color: 'cyan',
    label: 'Chat',
  },
  image: {
    icon: Image,
    placeholder:
      'Describe an image to generate... e.g. "A cyberpunk city at night, neon rain"',
    color: 'violet',
    label: 'Image',
  },
  video: {
    icon: Video,
    placeholder:
      'Describe a video scene... e.g. "A timelapse of stars over a mountain lake"',
    color: 'cyan',
    label: 'Video',
  },
} as const;

function useWakewordPref() {
  const [wakeword, setWakewordState] = useState(() => getWakewordEnabled());
  const [sensitivity, setSensitivityState] = useState<WakewordSensitivity>(() =>
    getWakewordSensitivity()
  );
  const [wakewordLang, setWakewordLangState] = useState<string>(() =>
    getWakewordLang()
  );

  useEffect(() => {
    const handleEnabled = (e: Event) => {
      setWakewordState(
        (e as CustomEvent<{ enabled: boolean }>).detail.enabled
      );
    };

    const handleSensitivity = (e: Event) => {
      setSensitivityState(
        (e as CustomEvent<{ sensitivity: WakewordSensitivity }>).detail
          .sensitivity
      );
    };

    const handleLang = (e: Event) => {
      setWakewordLangState((e as CustomEvent<{ lang: string }>).detail.lang);
    };

    window.addEventListener('mockj:wakeword-change', handleEnabled);
    window.addEventListener(
      'mockj:wakeword-sensitivity-change',
      handleSensitivity
    );
    window.addEventListener('mockj:wakeword-lang-change', handleLang);

    return () => {
      window.removeEventListener('mockj:wakeword-change', handleEnabled);
      window.removeEventListener(
        'mockj:wakeword-sensitivity-change',
        handleSensitivity
      );
      window.removeEventListener('mockj:wakeword-lang-change', handleLang);
    };
  }, []);

  const toggle = useCallback(() => {
    setWakewordEnabled(!wakeword);
  }, [wakeword]);

  const cycleSensitivity = useCallback(() => {
    const order: WakewordSensitivity[] = ['low', 'medium', 'high'];
    const next = order[(order.indexOf(sensitivity) + 1) % order.length];
    setWakewordSensitivity(next);
  }, [sensitivity]);

  const changeLang = useCallback((lang: string) => {
    setWakewordLang(lang);
  }, []);

  return {
    wakeword,
    toggle,
    sensitivity,
    cycleSensitivity,
    wakewordLang,
    changeLang,
  };
}

function useAutoSpeakPref() {
  const [autoSpeak, setAutoSpeakState] = useState(() => getAutoSpeak());

  useEffect(() => {
    const handler = (e: Event) => {
      setAutoSpeakState(
        (e as CustomEvent<{ enabled: boolean }>).detail.enabled
      );
    };

    window.addEventListener('mockj:autospeak-change', handler);
    return () => window.removeEventListener('mockj:autospeak-change', handler);
  }, []);

  const toggle = useCallback(() => {
    setAutoSpeak(!autoSpeak);
  }, [autoSpeak]);

  return { autoSpeak, toggle };
}

export default function ChatInput({
  mode,
  onModeChange,
  onSend,
  disabled,
  pendingPrompt,
  onPendingPromptConsumed,
  deepReasoning = false,
  onDeepReasoningChange,
  onOpenVoiceChat,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [attachedImage, setAttachedImage] = useState<{
    dataUrl: string;
    name: string;
  } | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [convPhase, setConvPhase] = useState<ConvPhase>('idle');
  const [hasVoiceSupport, setHasVoiceSupport] = useState(false);
  const [kbOffset, setKbOffset] = useState(0);
  const [wakeTestFlash, setWakeTestFlash] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<MockJSpeechRecognition | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const finalTranscriptRef = useRef('');
  const autoRestartAfterTTSRef = useRef(false);
  const voiceRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { autoSpeak, toggle: toggleAutoSpeak } = useAutoSpeakPref();
  const {
    wakeword,
    toggle: toggleWakeword,
    sensitivity,
    cycleSensitivity,
    wakewordLang,
    changeLang,
  } = useWakewordPref();

  const isContinuous = autoSpeak || wakeword;
  const config = MODE_CONFIG[mode];

  useEffect(() => {
    setHasVoiceSupport(
      typeof window !== 'undefined' &&
        !!((window as unknown as MockJSpeechWindow).SpeechRecognition ||
          (window as unknown as MockJSpeechWindow).webkitSpeechRecognition)
    );
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !isMobile) return;

    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbOffset(kb);
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  const autoResize = useCallback(() => {
    if (!textareaRef.current) return;

    textareaRef.current.style.height = 'auto';
    const maxH = isMobile ? 120 : 160;
    textareaRef.current.style.height =
      Math.min(textareaRef.current.scrollHeight, maxH) + 'px';
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    setImageError(null);

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      setImageError('Only PNG, JPG, and WEBP images are supported.');
      return;
    }

    const compress = (src: string) => {
      const img = document.createElement('img');

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 1024;
        const scale = Math.min(MAX_DIM / img.width, MAX_DIM / img.height, 1);

        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setImageError('Could not process this image.');
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        setAttachedImage({
          dataUrl: canvas.toDataURL('image/jpeg', 0.82),
          name: file.name,
        });
      };

      img.onerror = () => {
        setImageError('Could not load this image.');
      };

      img.src = src;
    };

    const reader = new FileReader();

    reader.onload = e => {
      const src = e.target?.result;
      if (typeof src === 'string') compress(src);
    };

    reader.onerror = () => {
      setImageError('Could not read this image.');
    };

    reader.readAsDataURL(file);
  }, []);

  const handleFileDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const startRecording = useCallback(() => {
    if (!hasVoiceSupport || isRecording || disabled) return;

    if (isTTSPlaying()) {
      stopAllTTS();
    }

    const speechWindow = window as unknown as MockJSpeechWindow;
    const SR = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (!SR) {
      console.error('SpeechRecognition is not supported in this browser.');
      setConvPhase('idle');
      setIsRecording(false);
      return;
    }

    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }

    const recognition = new SR();

    recognition.lang = wakewordLang || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = isContinuous;
    recognition.maxAlternatives = 1;

    recognitionRef.current = recognition;
    finalTranscriptRef.current = '';
    setInterimText('');

    recognition.onstart = () => {
      setIsRecording(true);
      setConvPhase('listening');
    };

    recognition.onresult = (e: MockJSpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const transcript = result?.[0]?.transcript ?? '';

        if (result.isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript.trim()) {
        finalTranscriptRef.current = `${finalTranscriptRef.current} ${finalTranscript}`.trim();

        setValue(prev =>
          prev
            ? `${prev} ${finalTranscript}`.trim()
            : finalTranscript.trim()
        );

        setInterimText('');
        setTimeout(autoResize, 0);
      } else {
        setInterimText(interimTranscript.trim());
      }
    };

    recognition.onerror = (e: MockJSpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', e.error);

      setIsRecording(false);
      setInterimText('');
      setConvPhase('idle');
      finalTranscriptRef.current = '';

      if (e.error === 'not-allowed') {
        alert('Microphone is blocked. Allow microphone access in your browser settings.');
      } else if (e.error === 'no-speech') {
        console.warn('No speech detected.');
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
      setInterimText('');

      const captured = finalTranscriptRef.current.trim();

      if (captured) {
        autoRestartAfterTTSRef.current = isContinuous;
        setConvPhase('processing');

        onSend(captured);

        setValue('');
        setInterimText('');
        finalTranscriptRef.current = '';

        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
        }

        // Recovery fallback: if TTS never fires mockj:tts-complete,
        // unlock the mic so voice mode does not get stuck on processing.
        if (voiceRecoveryTimerRef.current) {
          clearTimeout(voiceRecoveryTimerRef.current);
        }

        voiceRecoveryTimerRef.current = setTimeout(() => {
          voiceRecoveryTimerRef.current = null;

          if (!isTTSPlaying()) {
            setConvPhase('idle');

            if (isContinuous && !disabled) {
              autoRestartAfterTTSRef.current = false;
              startRecording();
            }
          }
        }, autoSpeak ? 12000 : 1200);

        return;
      }

      setConvPhase('idle');
    };

    try {
      recognition.start();
      Analytics.featureUsed('voice_input', 'chat');
    } catch (err) {
      console.error('Speech recognition failed to start:', err);
      setIsRecording(false);
      setInterimText('');
      setConvPhase('idle');
      finalTranscriptRef.current = '';
    }
  }, [
    hasVoiceSupport,
    isRecording,
    disabled,
    wakewordLang,
    autoResize,
    onSend,
    isContinuous,
  ]);

  useEffect(() => {
    const onTTSComplete = () => {
      if (voiceRecoveryTimerRef.current) {
        clearTimeout(voiceRecoveryTimerRef.current);
        voiceRecoveryTimerRef.current = null;
      }

      setConvPhase('idle');

      if (autoRestartAfterTTSRef.current && isContinuous && !disabled) {
        autoRestartAfterTTSRef.current = false;

        setTimeout(() => {
          startRecording();
        }, 600);
      } else {
        autoRestartAfterTTSRef.current = false;
      }
    };

    window.addEventListener('mockj:tts-complete', onTTSComplete);
    return () => window.removeEventListener('mockj:tts-complete', onTTSComplete);
  }, [isContinuous, disabled, startRecording]);

  useEffect(() => {
    const onStarted = () => setConvPhase('speaking');

    window.addEventListener('mockj:tts-started', onStarted);
    return () => window.removeEventListener('mockj:tts-started', onStarted);
  }, []);

  const handleMicClick = useCallback(() => {
    if (!hasVoiceSupport) {
      alert('Voice input is not supported in this browser. Try Google Chrome.');
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      setConvPhase('idle');
      return;
    }

    if (isTTSPlaying()) {
      stopAllTTS();
      setTimeout(startRecording, 200);
      return;
    }

    startRecording();
  }, [isRecording, hasVoiceSupport, startRecording]);

  const handleWakewordDetected = useCallback(async () => {
    if (isRecording || convPhase === 'greeting' || disabled) return;

    setConvPhase('greeting');

    if (isTTSPlaying()) stopAllTTS();

    const activateMic = () => {
      setConvPhase('idle');
      startRecording();
    };

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey =
        import.meta.env.VITE_SUPABASE_ANON_KEY ||
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      if (!supabaseUrl || !anonKey) {
        activateMic();
        return;
      }

      const funcUrl = `${supabaseUrl}/functions/v1/elevenlabs-tts`;

      const res = await fetch(funcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey as string,
          Authorization: `Bearer ${session?.access_token ?? anonKey}`,
        },
        body: JSON.stringify({ text: "I'm listening." }),
      });

      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        audio.volume = 0.9;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          setTimeout(activateMic, 80);
        };

        audio.onerror = () => {
          URL.revokeObjectURL(url);
          activateMic();
        };

        await audio.play();
        return;
      }
    } catch (err) {
      console.warn('Wakeword greeting TTS failed:', err);
    }

    activateMic();
  }, [isRecording, convPhase, disabled, startRecording]);

  useWakeword(
    handleWakewordDetected,
    wakeword,
    isRecording || convPhase === 'greeting',
    wakewordLang
  );

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }

      if (voiceRecoveryTimerRef.current) {
        clearTimeout(voiceRecoveryTimerRef.current);
        voiceRecoveryTimerRef.current = null;
      }

      autoRestartAfterTTSRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!pendingPrompt) return;

    setValue(pendingPrompt);
    onPendingPromptConsumed?.();

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height =
          Math.min(textareaRef.current.scrollHeight, 160) + 'px';
        textareaRef.current.focus();
      }
    }, 50);
  }, [pendingPrompt, onPendingPromptConsumed]);

  // Dispatch typing event while user types (debounced to avoid flood)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingDispatchedRef = useRef(false);

  const handleValueChange = (newValue: string) => {
    setValue(newValue);
    if (newValue.trim() && !isTypingDispatchedRef.current) {
      isTypingDispatchedRef.current = true;
      window.dispatchEvent(new CustomEvent('mockj:user-typing', { detail: { typing: true } }));
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      isTypingDispatchedRef.current = false;
      window.dispatchEvent(new CustomEvent('mockj:user-typing', { detail: { typing: false } }));
    }, 2500);
  };

  const handleSend = () => {
    const trimmed = (value + (interimText ? ` ${interimText}` : '')).trim();

    if (!trimmed && !attachedImage) return;
    if (disabled) return;
    // Stop typing signal on send
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    isTypingDispatchedRef.current = false;
    window.dispatchEvent(new CustomEvent('mockj:user-typing', { detail: { typing: false } }));

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      setInterimText('');
    }

    onSend(trimmed || '(Analyze this image)', attachedImage?.dataUrl);

    setValue('');
    setInterimText('');
    setAttachedImage(null);
    setImageError(null);
    finalTranscriptRef.current = '';
    setConvPhase('idle');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => autoResize();

  const isCyan = config.color === 'cyan';

  const phaseBar: {
    show: boolean;
    color: string;
    label: string;
    bars: number[];
  } = (() => {
    if (convPhase === 'greeting') {
      return {
        show: true,
        color: 'hsl(142 70% 55%)',
        label: 'Hey! Getting ready…',
        bars: [8, 14, 10, 16, 9],
      };
    }

    if (convPhase === 'listening') {
      return {
        show: true,
        color: 'hsl(0 80% 58%)',
        label: '🎙 Listening…',
        bars: [8, 14, 10, 16, 9],
      };
    }

    if (convPhase === 'processing') {
      return {
        show: true,
        color: 'hsl(38 95% 60%)',
        label: 'MockJ is thinking…',
        bars: [6, 10, 8, 12, 7],
      };
    }

    if (convPhase === 'speaking') {
      return {
        show: true,
        color: 'hsl(4 90% 58%)',
        label: 'MockJ is speaking…',
        bars: [8, 16, 12, 18, 10],
      };
    }

    return { show: false, color: '', label: '', bars: [] };
  })();

  return (
    <div
      className="px-2 sm:px-4 pb-4 sm:pb-5 pt-2"
      style={kbOffset > 0 ? { marginBottom: kbOffset } : undefined}
    >
      <div className="flex items-center gap-1 mb-2 sm:mb-3 overflow-x-auto scrollbar-none flex-nowrap">
        {(Object.keys(MODE_CONFIG) as ChatMode[]).map(m => {
          const cfg = MODE_CONFIG[m];
          const Icon = cfg.icon;
          const active = m === mode;

          return (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={cn(
                'flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                active
                  ? m === 'image'
                    ? 'bg-[hsl(265_80%_65%_/_0.15)] border border-[hsl(265_80%_65%_/_0.4)] text-[hsl(265_80%_65%)]'
                    : 'bg-[hsl(191_97%_55%_/_0.15)] border border-[hsl(191_97%_55%_/_0.4)] text-[hsl(191_97%_55%)]'
                  : 'border border-border text-muted-foreground hover:text-foreground hover:border-[hsl(224_15%_24%)]'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{cfg.label}</span>
            </button>
          );
        })}

        {mode === 'chat' && (
          <button
            onClick={() => onDeepReasoningChange?.(!deepReasoning)}
            title={
              deepReasoning
                ? 'Deep Reasoning ON — click to disable'
                : 'Enable Deep Reasoning mode'
            }
            className={cn(
              'ml-auto flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border',
              deepReasoning
                ? 'bg-[hsl(38_95%_60%_/_0.15)] border-[hsl(38_95%_60%_/_0.45)] text-[hsl(38_95%_60%)] shadow-[0_0_10px_hsl(38_95%_60%_/_0.15)]'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-[hsl(224_15%_24%)]'
            )}
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Deep Reasoning</span>
            {deepReasoning && (
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(38_95%_60%)] animate-pulse" />
            )}
          </button>
        )}
      </div>

      <div
        className={cn(
          'relative flex flex-col rounded-2xl border transition-all duration-200 overflow-hidden',
          convPhase === 'greeting'
            ? 'border-[hsl(142_70%_55%_/_0.7)] shadow-[0_0_18px_hsl(142_70%_55%_/_0.2)]'
            : convPhase === 'listening'
              ? 'border-[hsl(0_80%_55%_/_0.6)] shadow-[0_0_18px_hsl(0_80%_55%_/_0.2)]'
              : convPhase === 'processing'
                ? 'border-[hsl(38_95%_60%_/_0.5)] shadow-[0_0_12px_hsl(38_95%_60%_/_0.15)]'
                : convPhase === 'speaking'
                  ? 'border-[hsl(4_90%_58%_/_0.6)] shadow-[0_0_18px_hsl(4_90%_58%_/_0.2)]'
                  : 'border-[hsl(191_97%_55%_/_0.4)] shadow-[0_0_20px_hsl(191_97%_55%_/_0.12),_inset_0_0_0_1px_hsl(191_97%_55%_/_0.06)]'
        )}
        style={{ background: 'rgba(10,10,24,0.95)' }}
        onDragOver={e => e.preventDefault()}
        onDrop={handleFileDrop}
      >
        {attachedImage && (
          <div className="flex items-center gap-2.5 px-3 pt-2.5">
            <div
              className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0"
              style={{
                border: '1px solid hsl(191 97% 55% / 0.5)',
                boxShadow: '0 0 10px hsl(191 97% 55% / 0.2)',
              }}
            >
              <img
                src={attachedImage.dataUrl}
                alt="attachment"
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => {
                  setAttachedImage(null);
                  setImageError(null);
                }}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center bg-black/80"
                style={{ color: 'white' }}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>

            <div className="min-w-0">
              <p
                className="text-[11px] font-semibold truncate"
                style={{ color: 'hsl(191 97% 65%)' }}
              >
                {attachedImage.name}
              </p>
              <p
                className="text-[10px] mt-0.5"
                style={{ color: 'rgba(150,170,220,0.4)' }}
              >
                MockJ will analyze this image
              </p>
            </div>
          </div>
        )}

        {imageError && (
          <p
            className="px-3 pt-2 text-[11px] font-semibold"
            style={{ color: 'hsl(4 90% 60%)' }}
          >
            {imageError}
          </p>
        )}

        {phaseBar.show && (
          <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-0">
            <span
              className="text-[10px] font-semibold animate-pulse"
              style={{ color: phaseBar.color }}
            >
              {phaseBar.label}
            </span>

            <div className="flex items-end gap-0.5 h-4">
              {phaseBar.bars.map((h, i) => (
                <div
                  key={i}
                  className="w-0.5 rounded-full animate-bounce"
                  style={{
                    height: `${h}px`,
                    backgroundColor: phaseBar.color,
                    animationDelay: `${i * 0.08}s`,
                    animationDuration:
                      convPhase === 'speaking' ? '0.45s' : '0.5s',
                  }}
                />
              ))}
            </div>

            {convPhase === 'listening' && interimText && (
              <span
                className="text-[11px] italic ml-1 truncate max-w-[200px]"
                style={{ color: phaseBar.color, opacity: 0.8 }}
              >
                "{interimText}"
              </span>
            )}

            {convPhase === 'speaking' && (
              <button
                onClick={() => {
                  stopAllTTS();
                  startRecording();
                }}
                className="ml-auto text-[10px] px-2 py-0.5 rounded-full border transition-all duration-150 font-semibold hover:opacity-80"
                style={{
                  borderColor: `${phaseBar.color}55`,
                  color: phaseBar.color,
                  background: `${phaseBar.color}15`,
                }}
              >
                ✋ Interrupt
              </button>
            )}
          </div>
        )}

        <div className="flex items-end gap-2 p-3.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach image — MockJ will analyze it"
            className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 relative"
            style={
              attachedImage
                ? {
                    background: 'hsl(191 97% 55% / 0.15)',
                    border: '1px solid hsl(191 97% 55% / 0.55)',
                    color: 'hsl(191 97% 65%)',
                  }
                : {
                    background: 'transparent',
                    border: '1px solid rgba(100,120,200,0.2)',
                    color: 'rgba(150,170,220,0.45)',
                  }
            }
          >
            <Paperclip className="w-3.5 h-3.5" />
            {attachedImage && (
              <span
                className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-black text-white"
                style={{ background: 'hsl(191 97% 45%)' }}
              >
                ✓
              </span>
            )}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
              e.target.value = '';
            }}
          />

          <button
            onClick={handleMicClick}
            disabled={disabled || convPhase === 'greeting' || convPhase === 'processing'}
            aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
            title={
              !hasVoiceSupport
                ? 'Voice input not supported. Try Google Chrome.'
                : convPhase === 'speaking'
                  ? 'Tap to interrupt MockJ and speak'
                  : isRecording
                    ? 'Tap to stop recording'
                    : wakeword
                      ? 'Say "Hey Mock" or tap to speak'
                      : 'Tap to speak your message'
            }
            className={cn(
              'relative flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 disabled:opacity-40',
              convPhase === 'listening'
                ? 'bg-[hsl(0_80%_55%)] text-white shadow-[0_0_16px_hsl(0_80%_55%_/_0.5)] scale-110'
                : convPhase === 'greeting'
                  ? 'bg-[hsl(142_70%_55%_/_0.2)] border border-[hsl(142_70%_55%_/_0.5)] text-[hsl(142_70%_55%)]'
                  : convPhase === 'speaking'
                    ? 'bg-[hsl(4_90%_58%_/_0.12)] border border-[hsl(4_90%_58%_/_0.4)] text-[hsl(4_90%_58%)] hover:bg-[hsl(0_80%_55%)] hover:text-white hover:scale-105'
                    : hasVoiceSupport
                      ? 'bg-[hsl(191_97%_55%_/_0.1)] border border-[hsl(191_97%_55%_/_0.3)] text-[hsl(191_97%_55%)] hover:bg-[hsl(191_97%_55%_/_0.2)] hover:scale-105'
                      : 'bg-[hsl(224_15%_14%)] border border-border text-muted-foreground/40 cursor-not-allowed'
            )}
          >
            {convPhase === 'listening' ? (
              <>
                <MicOff className="w-4 h-4" />
                <span className="absolute inset-0 rounded-xl bg-[hsl(0_80%_55%_/_0.4)] animate-ping" />
              </>
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => handleValueChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={
              convPhase !== 'idle'
                ? ''
                : wakeword
                  ? 'Say "Hey Mock" or type here...'
                  : config.placeholder || 'Text MockJ anything...'
            }
            disabled={disabled}
            rows={2}
            className="input-neon-placeholder flex-1 bg-transparent resize-none outline-none text-sm text-foreground leading-relaxed max-h-40 disabled:opacity-50"
            style={{ minHeight: '48px', color: 'rgba(220,230,255,0.9)' }}
          />

          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-center">
              <button
                onClick={toggleWakeword}
                title={
                  wakeword
                    ? '"Hey Mock" ON — always listening · click to disable'
                    : 'Enable "Hey Mock" — hands-free wake word'
                }
                className={cn(
                  'relative w-8 h-8 rounded-l-lg flex items-center justify-center transition-all duration-200',
                  wakeword
                    ? 'bg-[hsl(142_70%_55%_/_0.15)] border border-[hsl(142_70%_55%_/_0.5)] text-[hsl(142_70%_55%)]'
                    : 'border border-border text-muted-foreground/50 hover:text-muted-foreground hover:border-[hsl(224_15%_24%)]'
                )}
              >
                <Radio className="w-3.5 h-3.5" />
                {wakeword && (
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[hsl(142_70%_55%)] animate-pulse" />
                )}
              </button>

              {wakeword && (
                <button
                  onClick={cycleSensitivity}
                  title={`Sensitivity: ${sensitivity.toUpperCase()} — click to cycle`}
                  className="h-8 px-1.5 border-y border-[hsl(142_70%_55%_/_0.5)] bg-[hsl(142_70%_55%_/_0.1)] flex items-center transition-all hover:bg-[hsl(142_70%_55%_/_0.22)] active:scale-95"
                >
                  <span className="text-[9px] font-black text-[hsl(142_70%_55%)] uppercase tracking-wide leading-none">
                    {sensitivity === 'low'
                      ? 'Lo'
                      : sensitivity === 'high'
                        ? 'Hi'
                        : 'Md'}
                  </span>
                </button>
              )}

              {wakeword && (
                <div className="relative h-8 flex items-center">
                  <select
                    value={wakewordLang}
                    onChange={e => changeLang(e.target.value)}
                    title="Wakeword detection language"
                    className="h-8 pl-1.5 pr-5 text-[9px] font-black uppercase tracking-wide border-y border-[hsl(142_70%_55%_/_0.5)] bg-[hsl(142_70%_55%_/_0.08)] text-[hsl(142_70%_55%)] outline-none cursor-pointer hover:bg-[hsl(142_70%_55%_/_0.18)] transition-colors appearance-none"
                    style={{ minWidth: '34px' }}
                  >
                    {WAKEWORD_LANGUAGES.map(l => (
                      <option
                        key={l.code}
                        value={l.code}
                        className="bg-[hsl(224_20%_8%)] text-foreground text-xs normal-case font-normal tracking-normal"
                      >
                        {l.short}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-0.5 text-[hsl(142_70%_55%)] text-[8px] leading-none">
                    ▾
                  </span>
                </div>
              )}

              {wakeword && (
                <button
                  onClick={() => {
                    if (wakeTestFlash || convPhase === 'greeting' || isRecording) return;

                    setWakeTestFlash(true);
                    setTimeout(() => setWakeTestFlash(false), 800);
                    handleWakewordDetected();

                    console.log('🔥 MockJ: Wake Word Loop Verified — manual trigger');
                  }}
                  disabled={
                    wakeTestFlash ||
                    convPhase === 'greeting' ||
                    convPhase === 'processing' ||
                    isRecording
                  }
                  title="Test Hey Mock — fires the full voice loop as if the wake word was heard"
                  className={cn(
                    'h-8 px-2 rounded-r-lg border border-l-0 flex items-center transition-all duration-200 active:scale-95 disabled:opacity-40',
                    wakeTestFlash
                      ? 'bg-[hsl(142_70%_55%)] border-[hsl(142_70%_55%)] text-[hsl(224_20%_6%)] scale-105'
                      : 'border-[hsl(142_70%_55%_/_0.5)] bg-[hsl(142_70%_55%_/_0.08)] text-[hsl(142_70%_55%)] hover:bg-[hsl(142_70%_55%_/_0.22)]'
                  )}
                >
                  <span className="text-[9px] font-black uppercase tracking-wide leading-none whitespace-nowrap">
                    {wakeTestFlash ? '✓ OK' : 'Test'}
                  </span>
                </button>
              )}
            </div>

            <button
              onClick={toggleAutoSpeak}
              title={
                autoSpeak
                  ? 'Auto-Speak ON — MockJ replies with voice · click to mute'
                  : 'Auto-Speak OFF — click to enable voice replies'
              }
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200',
                autoSpeak
                  ? 'bg-[hsl(4_90%_58%_/_0.15)] border border-[hsl(4_90%_58%_/_0.5)] text-[hsl(4_90%_58%)]'
                  : 'border border-border text-muted-foreground/50 hover:text-muted-foreground hover:border-[hsl(224_15%_24%)]'
              )}
            >
              {autoSpeak ? (
                <Volume2 className="w-3.5 h-3.5" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
            </button>

            {onOpenVoiceChat && (
              <button
                onClick={onOpenVoiceChat}
                title="Open Voice Chat — speak with MockJ hands-free"
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 border border-[hsl(265_80%_65%_/_0.35)] bg-[hsl(265_80%_65%_/_0.08)] text-[hsl(265_80%_65%)] hover:bg-[hsl(265_80%_65%_/_0.2)] hover:scale-105 active:scale-90 shrink-0"
                aria-label="Open voice chat"
              >
                <PhoneCall className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={handleSend}
              disabled={(!value.trim() && !interimText && !attachedImage) || disabled === true}
              className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-90 shrink-0',
                (value.trim() || interimText || attachedImage) && !disabled
                  ? isCyan
                    ? 'bg-[hsl(191_97%_55%)] text-[hsl(224_20%_6%)] hover:bg-[hsl(191_97%_65%)] glow-cyan'
                    : 'bg-[hsl(265_80%_65%)] text-white hover:bg-[hsl(265_80%_72%)] glow-violet'
                  : 'bg-[hsl(224_15%_14%)] text-muted-foreground cursor-not-allowed'
              )}
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-1.5 px-1">
        <p className="text-[10px] text-muted-foreground/35">
          MockJ keeps it real — double-check anything critical ngl 🤙
        </p>

        <div className="flex items-center gap-2">
          {!hasVoiceSupport && (
            <span className="text-[10px] font-semibold text-muted-foreground/50">
              Voice works best in Chrome
            </span>
          )}

          {wakeword && convPhase === 'idle' && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-[hsl(142_70%_55%)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(142_70%_55%)] animate-pulse inline-block" />
              Hey Mock — ready
            </span>
          )}

          {autoSpeak && !wakeword && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-[hsl(4_90%_58%)]">
              <Volume2 className="w-3 h-3" /> Auto-Speak
            </span>
          )}

          {isContinuous && convPhase !== 'idle' && (
            <span
              className="flex items-center gap-1 text-[10px] font-semibold"
              style={{ color: phaseBar.color }}
            >
              {convPhase === 'listening' && '🎙 Listening'}
              {convPhase === 'greeting' && '⚡ Activating'}
              {convPhase === 'processing' && '🧠 Thinking'}
              {convPhase === 'speaking' && '🔊 Speaking'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}