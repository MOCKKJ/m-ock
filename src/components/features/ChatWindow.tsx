import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type TouchEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  Loader2,
  RefreshCw,
  Radio,
  Search,
  X,
  ChevronUp,
  ChevronDown as ChevronDownIcon,
  Plus,
  Coins,
  ShoppingCart,
  Zap,
  Sparkles,
  Download,
  Volume2,
  VolumeX,
  Gauge,
} from 'lucide-react';
import {
  loadPersonality,
  savePersonality,
  PERSONALITY_PRESETS,
  PersonalityPreset,
} from './PersonalityPicker';
import { Message, ChatMode } from '@/types/chat';
import ChatMessage from './ChatMessage';
import TypingIndicator from './TypingIndicator';
import WelcomeScreen from './WelcomeScreen';
import ChatInput from './ChatInput';
import NotificationBell from './NotificationBell';
import { getWakewordEnabled, getWakewordSensitivity } from '@/hooks/useWakeword';
import { useAuth } from '@/contexts/AuthContext';
import { useTokenWallet } from '@/hooks/useTokenWallet';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

const SOUND_KEY = 'mockj_sound_enabled';
const SPEED_KEY = 'mockj_stream_speed';

export type StreamSpeed = 'fast' | 'normal' | 'cinematic';

export function loadSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function saveSoundEnabled(v: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, String(v));
  } catch {
    // ignore
  }
}

export function loadStreamSpeed(): StreamSpeed {
  try {
    const v = localStorage.getItem(SPEED_KEY);
    return v === 'fast' || v === 'normal' || v === 'cinematic' ? v : 'normal';
  } catch {
    return 'normal';
  }
}

export function saveStreamSpeed(v: StreamSpeed) {
  try {
    localStorage.setItem(SPEED_KEY, v);
  } catch {
    // ignore
  }
}

function formatMsgTime(timestamp: Date | string | number): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function hslAlpha(hsl: string, alpha: number): string {
  return hsl.replace(')', ` / ${alpha})`);
}

function playTone(opts: {
  freq: number;
  endFreq?: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
  delay?: number;
}) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = opts.type ?? 'sine';

    const startTime = ctx.currentTime + (opts.delay ?? 0);

    oscillator.frequency.setValueAtTime(opts.freq, startTime);

    if (opts.endFreq) {
      oscillator.frequency.exponentialRampToValueAtTime(
        opts.endFreq,
        startTime + opts.duration
      );
    }

    const vol = opts.volume ?? 0.08;

    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(vol, startTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      startTime + opts.duration
    );

    oscillator.start(startTime);
    oscillator.stop(startTime + opts.duration + 0.05);

    oscillator.onended = () => {
      ctx.close().catch(() => {
        // ignore
      });
    };
  } catch {
    // AudioContext not supported or blocked
  }
}

function playSendSound() {
  playTone({
    freq: 620,
    endFreq: 290,
    duration: 0.18,
    type: 'sine',
    volume: 0.06,
  });

  playTone({
    freq: 500,
    endFreq: 210,
    duration: 0.22,
    type: 'triangle',
    volume: 0.04,
    delay: 0.04,
  });
}

function playResponseStartSound() {
  playTone({
    freq: 880,
    endFreq: 1100,
    duration: 0.13,
    type: 'sine',
    volume: 0.07,
  });
}

function playResponseCompleteSound() {
  playTone({
    freq: 523,
    duration: 0.26,
    type: 'sine',
    volume: 0.06,
  });

  playTone({
    freq: 659,
    duration: 0.26,
    type: 'sine',
    volume: 0.05,
    delay: 0.09,
  });

  playTone({
    freq: 784,
    duration: 0.32,
    type: 'sine',
    volume: 0.04,
    delay: 0.18,
  });
}

function exportConversationMarkdown(messages: Message[], title?: string) {
  const ts = new Date().toLocaleString();

  const lines: string[] = [
    '# MockJ Conversation Export',
    '',
    `**Title:** ${title ?? 'MockJ Chat'}`,
    `**Exported:** ${ts}`,
    `**Messages:** ${messages.length}`,
    '',
    '---',
    '',
  ];

  for (const msg of messages) {
    const time = formatMsgTime(msg.timestamp);

    if (msg.type === 'image') {
      lines.push(`### 🖼️ ${msg.role === 'user' ? 'You' : 'MockJ'} — ${time}`);
      lines.push('');

      if (msg.mediaPrompt) {
        lines.push(`> Prompt: ${msg.mediaPrompt}`);
      }

      if (msg.mediaUrl) {
        lines.push(`![Generated Image](${msg.mediaUrl})`);
      }
    } else if (msg.type === 'video') {
      lines.push(`### 🎬 ${msg.role === 'user' ? 'You' : 'MockJ'} — ${time}`);
      lines.push('');
      lines.push(msg.content);
    } else {
      const role = msg.role === 'user' ? '**You**' : '**MockJ**';

      lines.push(`### ${role} — ${time}`);
      lines.push('');
      lines.push(msg.content.replace(/\[VERIFY\]\{[\s\S]*?\}/g, '').trim());
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('*Generated by MockJ — mockj.online*');

  const blob = new Blob([lines.join('\n')], {
    type: 'text/markdown;charset=utf-8',
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = `mockj-chat-${new Date().toISOString().slice(0, 10)}.md`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

function useWakewordStatus() {
  const [active, setActive] = useState(() => getWakewordEnabled());
  const [sensitivity, setSensitivity] = useState(() => getWakewordSensitivity());
  const [phase, setPhase] = useState<'idle' | 'listening' | 'speaking'>(
    'idle'
  );

  useEffect(() => {
    const onEnabled = (e: Event) => {
      setActive((e as CustomEvent<{ enabled: boolean }>).detail.enabled);
    };

    const onSens = (e: Event) => {
      setSensitivity(
        (e as CustomEvent<{ sensitivity: ReturnType<typeof getWakewordSensitivity> }>)
          .detail.sensitivity
      );
    };

    const onStarted = () => setPhase('speaking');
    const onComplete = () => setPhase('idle');

    window.addEventListener('mockj:wakeword-change', onEnabled);
    window.addEventListener('mockj:wakeword-sensitivity-change', onSens);
    window.addEventListener('mockj:tts-started', onStarted);
    window.addEventListener('mockj:tts-complete', onComplete);

    return () => {
      window.removeEventListener('mockj:wakeword-change', onEnabled);
      window.removeEventListener('mockj:wakeword-sensitivity-change', onSens);
      window.removeEventListener('mockj:tts-started', onStarted);
      window.removeEventListener('mockj:tts-complete', onComplete);
    };
  }, []);

  return { active, sensitivity, phase };
}

function getMatchingIds(messages: Message[], query: string): string[] {
  if (!query.trim()) return [];

  const q = query.toLowerCase();

  return messages
    .filter(m => m.content.toLowerCase().includes(q))
    .map(m => m.id);
}

function PersonalityIndicator({
  current,
  onChange,
}: {
  current: PersonalityPreset;
  onChange: (p: PersonalityPreset) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const preset = PERSONALITY_PRESETS.find(p => p.id === current);

  useEffect(() => {
    if (!open) return;

    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);

    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!preset) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Active personality — click to switch"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black transition-all"
        style={{
          background: open
            ? 'hsl(265 80% 65% / 0.18)'
            : 'hsl(265 80% 65% / 0.08)',
          border: '1px solid hsl(265 80% 65% / 0.4)',
          color: 'hsl(265 80% 80%)',
          boxShadow: open ? '0 0 12px hsl(265 80% 65% / 0.25)' : 'none',
        }}
      >
        <span>{preset.emoji}</span>
        <span className="hidden sm:inline">{preset.label}</span>
        <ChevronDownIcon
          className="w-2.5 h-2.5 opacity-60 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-8 w-44 rounded-2xl overflow-hidden z-50 shadow-2xl"
          style={{
            background: 'hsl(224 20% 8%)',
            border: '1px solid hsl(265 80% 65% / 0.3)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}
        >
          {PERSONALITY_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => {
                onChange(p.id as PersonalityPreset);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs transition-all"
              style={{
                borderBottom: '1px solid hsl(224 15% 12%)',
                background:
                  p.id === current
                    ? 'hsl(265 80% 65% / 0.1)'
                    : 'transparent',
                color:
                  p.id === current
                    ? 'hsl(265 80% 80%)'
                    : 'rgba(190,200,230,0.65)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'hsl(265 80% 65% / 0.07)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background =
                  p.id === current
                    ? 'hsl(265 80% 65% / 0.1)'
                    : 'transparent';
              }}
            >
              <span className="text-base">{p.emoji}</span>

              <div className="text-left min-w-0">
                <p className="font-bold leading-none text-[11px]">{p.label}</p>
                <p className="text-[9px] opacity-50 mt-0.5 leading-none">
                  {p.description}
                </p>
              </div>

              {p.id === current && (
                <span className="ml-auto text-[hsl(265_80%_75%)] text-[10px]">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SUGGESTION_BANKS: Record<string, string[]> = {
  code: ['Give me the code', 'Make it production-ready', 'Add error handling'],
  money: [
    'Turn this into a money move',
    'Give me the strategy',
    'Break down the numbers',
  ],
  design: ['Make it more futuristic', 'Add neon glow effects', 'Make it mobile'],
  website: ['Build me the website', 'Add a pricing section', 'Make it more luxury'],
  image: ['Generate that image', 'Make it more realistic', 'Try a different style'],
  general: ['Make it more detailed', 'Give me examples', 'What should I do next?'],
  debug: ['Give me the fix', 'Explain the root cause', 'Show me the clean version'],
  explain: [
    'Break it down simpler',
    'Give me the short version',
    'What does that mean?',
  ],
};

function pickSuggestions(lastResponse: string): string[] {
  const lower = lastResponse.toLowerCase();

  if (
    lower.includes('```') ||
    lower.includes('function') ||
    lower.includes('const ') ||
    lower.includes('import ')
  ) {
    return SUGGESTION_BANKS.code;
  }

  if (
    lower.includes('money') ||
    lower.includes('revenue') ||
    lower.includes('profit') ||
    lower.includes('strategy')
  ) {
    return SUGGESTION_BANKS.money;
  }

  if (
    lower.includes('design') ||
    lower.includes('color') ||
    lower.includes('style') ||
    lower.includes('layout')
  ) {
    return SUGGESTION_BANKS.design;
  }

  if (
    lower.includes('website') ||
    lower.includes('landing page') ||
    lower.includes('html')
  ) {
    return SUGGESTION_BANKS.website;
  }

  if (
    lower.includes('image') ||
    lower.includes('photo') ||
    lower.includes('generate')
  ) {
    return SUGGESTION_BANKS.image;
  }

  if (
    lower.includes('error') ||
    lower.includes('bug') ||
    lower.includes('fix') ||
    lower.includes('broken')
  ) {
    return SUGGESTION_BANKS.debug;
  }

  if (
    lower.includes('means') ||
    lower.includes('basically') ||
    lower.includes('explain') ||
    lower.includes('understand')
  ) {
    return SUGGESTION_BANKS.explain;
  }

  return SUGGESTION_BANKS.general;
}

function FollowUpChips({
  lastResponse,
  onSend,
}: {
  lastResponse: string;
  onSend: (t: string) => void;
}) {
  const chips = useMemo(() => pickSuggestions(lastResponse), [lastResponse]);

  return (
    <div className="flex items-center justify-center gap-2 flex-wrap py-2 px-3">
      {chips.map(chip => (
        <button
          key={chip}
          onClick={() => onSend(chip)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all active:scale-95"
          style={{
            background: 'rgba(100,120,200,0.07)',
            border: '1px solid rgba(100,120,200,0.2)',
            color: 'rgba(190,205,240,0.7)',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget;
            el.style.background = 'hsl(265 80% 65% / 0.14)';
            el.style.borderColor = 'hsl(265 80% 65% / 0.5)';
            el.style.color = 'hsl(265 80% 82%)';
            el.style.boxShadow = '0 0 10px hsl(265 80% 65% / 0.18)';
          }}
          onMouseLeave={e => {
            const el = e.currentTarget;
            el.style.background = 'rgba(100,120,200,0.07)';
            el.style.borderColor = 'rgba(100,120,200,0.2)';
            el.style.color = 'rgba(190,205,240,0.7)';
            el.style.boxShadow = 'none';
          }}
        >
          <Sparkles className="w-3 h-3" />
          {chip}
        </button>
      ))}
    </div>
  );
}

const SPEED_CONFIG: Record<
  StreamSpeed,
  { emoji: string; label: string; color: string }
> = {
  fast: {
    emoji: '⚡',
    label: 'Fast',
    color: 'hsl(38 95% 60%)',
  },
  normal: {
    emoji: '🎯',
    label: 'Normal',
    color: 'hsl(265 80% 65%)',
  },
  cinematic: {
    emoji: '🎬',
    label: 'Cinematic',
    color: 'hsl(191 97% 55%)',
  },
};

interface ChatWindowProps {
  messages: Message[];
  isTyping: boolean;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  onSend: (text: string, imageDataUrl?: string) => void;
  pendingPrompt?: string | null;
  onPendingPromptConsumed?: () => void;
  deepReasoning?: boolean;
  onDeepReasoningChange?: (val: boolean) => void;
  onOpenImageStudio?: () => void;
  onOpenPhotoRecreator?: () => void;
  onOpenVoiceChat?: () => void;
  onRefresh?: () => Promise<void>;
  onNewChat?: () => void;
  onOpenTokens?: () => void;
}

export default function ChatWindow({
  messages,
  isTyping,
  mode,
  onModeChange,
  onSend,
  pendingPrompt,
  onPendingPromptConsumed,
  deepReasoning,
  onDeepReasoningChange,
  onOpenImageStudio,
  onOpenPhotoRecreator,
  onOpenVoiceChat,
  onRefresh,
  onNewChat,
  onOpenTokens,
}: ChatWindowProps) {
  const { user, subscription } = useAuth();
  const { wallet } = useTokenWallet();
  const navigate = useNavigate();

  const [userIsTyping, setUserIsTyping] = useState(false);
  const userTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen to user typing events from ChatInput
  useEffect(() => {
    const handler = (e: Event) => {
      const { typing } = (e as CustomEvent<{ typing: boolean }>).detail;
      setUserIsTyping(typing);
      if (typing) {
        if (userTypingTimerRef.current) clearTimeout(userTypingTimerRef.current);
        userTypingTimerRef.current = setTimeout(() => setUserIsTyping(false), 3000);
      } else {
        if (userTypingTimerRef.current) clearTimeout(userTypingTimerRef.current);
      }
    };
    window.addEventListener('mockj:user-typing', handler);
    return () => window.removeEventListener('mockj:user-typing', handler);
  }, []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<number>(0);
  const touchY = useRef<number>(0);
  const userScrolled = useRef<boolean>(false);
  const speedPickerRef = useRef<HTMLDivElement>(null);
  const soundRef = useRef<boolean>(loadSoundEnabled());
  const prevMsgCountRef = useRef(0);
  const prevStreamingRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [pullDelta, setPullDelta] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => loadSoundEnabled());
  const [streamSpeed, setStreamSpeedState] = useState<StreamSpeed>(() =>
    loadStreamSpeed()
  );
  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const [personality, setPersonalityState] = useState<PersonalityPreset>(() =>
    loadPersonality()
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchCursor, setMatchCursor] = useState(0);

  const PULL_THRESHOLD = 60;
  const SCROLL_TOLERANCE = 80;

  const wakeword = useWakewordStatus();
  const speedCfg = SPEED_CONFIG[streamSpeed];

  const openTokens = useCallback(() => {
    if (onOpenTokens) {
      onOpenTokens();
    } else {
      navigate('/tokens');
    }
  }, [navigate, onOpenTokens]);

  useEffect(() => {
    soundRef.current = soundEnabled;
  }, [soundEnabled]);

  const toggleSound = useCallback(() => {
    const next = !soundEnabled;

    setSoundEnabled(next);
    saveSoundEnabled(next);

    window.dispatchEvent(
      new CustomEvent('mockj:sound-change', {
        detail: { enabled: next },
      })
    );

    import('sonner').then(({ toast }) => {
      toast(next ? '🔊 Sound effects on' : '🔇 Sound effects off', {
        duration: 1500,
      });
    });
  }, [soundEnabled]);

  const handleSpeedChange = useCallback((s: StreamSpeed) => {
    setStreamSpeedState(s);
    saveStreamSpeed(s);
    setShowSpeedPicker(false);

    window.dispatchEvent(
      new CustomEvent('mockj:stream-speed-change', {
        detail: { speed: s },
      })
    );

    const labels: Record<StreamSpeed, string> = {
      fast: '⚡ Fast',
      normal: '🎯 Normal',
      cinematic: '🎬 Cinematic',
    };

    import('sonner').then(({ toast }) => {
      toast(labels[s], { duration: 1200 });
    });
  }, []);

  useEffect(() => {
    if (!showSpeedPicker) return;

    const handler = (e: MouseEvent) => {
      if (
        speedPickerRef.current &&
        !speedPickerRef.current.contains(e.target as Node)
      ) {
        setShowSpeedPicker(false);
      }
    };

    document.addEventListener('mousedown', handler);

    return () => document.removeEventListener('mousedown', handler);
  }, [showSpeedPicker]);

  useEffect(() => {
    const msgCount = messages.length;
    const lastMsg = messages[msgCount - 1];
    const isStreaming = !!(
      lastMsg?.role === 'assistant' && lastMsg?.streaming
    );

    if (msgCount > prevMsgCountRef.current && lastMsg?.role === 'user') {
      if (soundRef.current) playSendSound();
    }

    if (!prevStreamingRef.current && isStreaming) {
      if (soundRef.current) playResponseStartSound();
    }

    if (
      prevStreamingRef.current &&
      !isStreaming &&
      lastMsg?.role === 'assistant' &&
      !lastMsg.streaming
    ) {
      if (soundRef.current) playResponseCompleteSound();
    }

    prevMsgCountRef.current = msgCount;
    prevStreamingRef.current = isStreaming;
  }, [messages]);

  const handlePersonalityChange = useCallback((p: PersonalityPreset) => {
    setPersonalityState(p);
    savePersonality(p);

    window.dispatchEvent(
      new CustomEvent('mockj:personality-change', {
        detail: { preset: p },
      })
    );

    const label = PERSONALITY_PRESETS.find(pr => pr.id === p)?.label ?? p;

    import('sonner').then(({ toast }) => {
      toast.success(`Personality: ${label} 🔥`);
    });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ preset: PersonalityPreset }>).detail;

      if (detail?.preset) {
        setPersonalityState(detail.preset);
      }
    };

    window.addEventListener('mockj:personality-change', handler);

    return () => window.removeEventListener('mockj:personality-change', handler);
  }, []);

  const firstAssistantMsg = useMemo(() => {
    return messages.find(
      m =>
        m.role === 'assistant' &&
        !m.streaming &&
        m.type === 'text' &&
        m.content.length > 10
    );
  }, [messages]);

  const showChips = !!(
    firstAssistantMsg &&
    messages.length >= 2 &&
    messages.length <= 4 &&
    !isTyping
  );

  const matchIds = useMemo(
    () => getMatchingIds(messages, searchQuery),
    [messages, searchQuery]
  );

  const activeMatchId = matchIds[matchCursor] ?? null;

  useEffect(() => {
    setMatchCursor(prev =>
      matchIds.length === 0 ? 0 : Math.min(prev, matchIds.length - 1)
    );
  }, [matchIds.length]);

  useEffect(() => {
    if (!activeMatchId) return;

    const el = messageRefs.current.get(activeMatchId);

    if (el) {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeMatchId]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);

    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 60);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setMatchCursor(0);
  }, []);

  const goNext = useCallback(() => {
    if (matchIds.length === 0) return;

    setMatchCursor(c => (c + 1) % matchIds.length);
  }, [matchIds.length]);

  const goPrev = useCallback(() => {
    if (matchIds.length === 0) return;

    setMatchCursor(c => (c - 1 + matchIds.length) % matchIds.length);
  }, [matchIds.length]);

  const handleSearchKey = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();

        if (e.shiftKey) {
          goPrev();
        } else {
          goNext();
        }
      }

      if (e.key === 'Escape') {
        closeSearch();
      }
    },
    [goPrev, goNext, closeSearch]
  );

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && messages.length > 0) {
        e.preventDefault();

        if (searchOpen) {
          searchInputRef.current?.focus();
        } else {
          openSearch();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchOpen, messages.length, openSearch]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;

    if (!el) return;

    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distFromBottom <= SCROLL_TOLERANCE;

    userScrolled.current = !atBottom;
    setShowScrollBtn(!atBottom);
  }, []);

  useEffect(() => {
    if (!userScrolled.current) {
      bottomRef.current?.scrollIntoView({
        behavior: 'smooth',
      });
    }
  }, [messages, isTyping]);

  useEffect(() => {
    if (messages.length === 0) {
      userScrolled.current = false;
      setShowScrollBtn(false);
      closeSearch();
    }
  }, [messages.length, closeSearch]);

  const scrollToBottom = useCallback(() => {
    userScrolled.current = false;
    setShowScrollBtn(false);

    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    const el = scrollRef.current;

    if (!el || el.scrollTop > 0) return;

    touchStart.current = e.touches[0].clientY;
    touchY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      const el = scrollRef.current;

      if (!el || el.scrollTop > 0 || refreshing) return;

      const dy = e.touches[0].clientY - touchStart.current;

      if (dy < 0) {
        setPullDelta(0);
        return;
      }

      touchY.current = e.touches[0].clientY;

      setPullDelta(Math.min(dy * 0.45, 80));
    },
    [refreshing]
  );

  const handleTouchEnd = useCallback(async () => {
    const delta = touchY.current - touchStart.current;

    setPullDelta(0);

    if (delta < PULL_THRESHOLD || refreshing || !onRefresh) return;

    try {
      navigator.vibrate?.(30);
    } catch {
      // ignore
    }

    setRefreshing(true);

    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, onRefresh]);

  const showPullIndicator = pullDelta > 8 || refreshing;

  const setMessageRef = useCallback(
    (id: string, el: HTMLDivElement | null) => {
      if (el) {
        messageRefs.current.set(id, el);
      } else {
        messageRefs.current.delete(id);
      }
    },
    []
  );

  return (
    <div
      className="flex flex-col h-full overflow-hidden relative"
      style={{ background: 'rgba(10, 10, 22, 0.8)' }}
    >
      <div
        className="flex items-center px-3 py-2.5 shrink-0 gap-2"
        style={{ borderBottom: '1px solid rgba(100,120,255,0.1)' }}
      >
        <div className="flex items-center shrink-0">
          {messages.length > 0 && onNewChat && (
            <button
              onClick={onNewChat}
              title="New chat"
              className="w-7 h-7 rounded-xl flex items-center justify-center border border-border text-muted-foreground hover:text-foreground hover:border-[hsl(265_80%_65%_/_0.4)] transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex-1 flex items-center justify-center gap-2">
          <h2
            className="text-base font-black tracking-wider"
            style={{
              fontFamily: 'Space Grotesk, sans-serif',
              background:
                'linear-gradient(135deg, hsl(170 100% 60%), hsl(191 97% 55%), hsl(265 80% 70%))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            MockJ online
          </h2>

          <span
            className="w-2 h-2 rounded-full animate-pulse shrink-0"
            style={{
              background: 'hsl(142 70% 55%)',
              boxShadow: '0 0 8px hsl(142 70% 55%)',
            }}
          />
        </div>

        <div className="hidden sm:flex items-center shrink-0 mr-1">
          <PersonalityIndicator
            current={personality}
            onChange={handlePersonalityChange}
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={toggleSound}
            title={soundEnabled ? 'Sound on — click to mute' : 'Sound off — click to enable'}
            className="w-7 h-7 flex items-center justify-center rounded-lg border transition-all"
            style={{
              background: soundEnabled
                ? 'hsl(142 70% 55% / 0.08)'
                : 'transparent',
              borderColor: soundEnabled
                ? 'hsl(142 70% 55% / 0.4)'
                : 'rgba(100,120,200,0.15)',
              color: soundEnabled
                ? 'hsl(142 70% 60%)'
                : 'rgba(130,150,200,0.4)',
              boxShadow: soundEnabled
                ? '0 0 8px hsl(142 70% 55% / 0.15)'
                : 'none',
            }}
          >
            {soundEnabled ? (
              <Volume2 className="w-3 h-3" />
            ) : (
              <VolumeX className="w-3 h-3" />
            )}
          </button>

          <div className="relative" ref={speedPickerRef}>
            <button
              onClick={() => setShowSpeedPicker(v => !v)}
              title={`Streaming speed: ${speedCfg.label}`}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border transition-all text-[10px] font-black"
              style={{
                background: showSpeedPicker
                  ? hslAlpha(speedCfg.color, 0.12)
                  : 'transparent',
                borderColor: showSpeedPicker
                  ? hslAlpha(speedCfg.color, 0.5)
                  : 'rgba(100,120,200,0.15)',
                color: showSpeedPicker ? speedCfg.color : 'rgba(130,150,200,0.4)',
              }}
            >
              <Gauge className="w-3 h-3" />
              <span className="hidden md:inline">{speedCfg.emoji}</span>
            </button>

            {showSpeedPicker && (
              <div
                className="absolute right-0 top-9 z-50 rounded-2xl overflow-hidden shadow-2xl"
                style={{
                  background: 'hsl(224 20% 8%)',
                  border: '1px solid hsl(265 80% 65% / 0.3)',
                  width: 170,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
                }}
              >
                <p
                  className="px-3.5 pt-3 pb-1.5 text-[9px] font-black uppercase tracking-wider"
                  style={{ color: 'rgba(150,165,200,0.5)' }}
                >
                  Streaming Speed
                </p>

                {(['fast', 'normal', 'cinematic'] as const).map(id => {
                  const cfg = SPEED_CONFIG[id];

                  return (
                    <button
                      key={id}
                      onClick={() => handleSpeedChange(id)}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 text-xs transition-all"
                      style={{
                        borderBottom: '1px solid hsl(224 15% 12%)',
                        background:
                          streamSpeed === id ? hslAlpha(cfg.color, 0.12) : 'transparent',
                        color:
                          streamSpeed === id ? cfg.color : 'rgba(180,195,230,0.6)',
                      }}
                      onMouseEnter={e => {
                        if (streamSpeed !== id) {
                          e.currentTarget.style.background =
                            'hsl(265 80% 65% / 0.06)';
                        }
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background =
                          streamSpeed === id
                            ? hslAlpha(cfg.color, 0.12)
                            : 'transparent';
                      }}
                    >
                      <span className="text-sm">{cfg.emoji}</span>

                      <div className="text-left flex-1">
                        <p className="font-black text-[11px] leading-none">
                          {cfg.label}
                        </p>
                        <p className="text-[9px] opacity-50 mt-0.5">
                          {id === 'fast'
                            ? 'Instant — no delays'
                            : id === 'normal'
                              ? 'Default rhythm'
                              : 'Word by word'}
                        </p>
                      </div>

                      {streamSpeed === id && (
                        <span className="text-[10px]" style={{ color: cfg.color }}>
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {messages.length > 0 && (
            <button
              onClick={() => {
                exportConversationMarkdown(messages);

                import('sonner').then(({ toast }) => {
                  toast.success('Exported as Markdown ✓');
                });
              }}
              title="Export conversation as Markdown"
              className="w-7 h-7 flex items-center justify-center rounded-lg border transition-all"
              style={{
                background: 'transparent',
                borderColor: 'rgba(100,120,200,0.15)',
                color: 'rgba(130,150,200,0.4)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'hsl(191 97% 55% / 0.5)';
                e.currentTarget.style.color = 'hsl(191 97% 60%)';
                e.currentTarget.style.background = 'hsl(191 97% 55% / 0.07)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(100,120,200,0.15)';
                e.currentTarget.style.color = 'rgba(130,150,200,0.4)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <Download className="w-3 h-3" />
            </button>
          )}

          <div
            className="w-px h-4 shrink-0"
            style={{ background: 'rgba(100,120,200,0.15)' }}
          />

          {!wallet.loading && wallet.balance === 0 && !subscription?.subscribed ? (
            <button
              onClick={openTokens}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black animate-pulse"
              style={{
                background: 'hsl(4 90% 58% / 0.12)',
                border: '1px solid hsl(4 90% 58% / 0.5)',
                color: 'hsl(4 90% 65%)',
                boxShadow: '0 0 10px hsl(4 90% 58% / 0.2)',
              }}
            >
              <ShoppingCart className="w-3 h-3" />
              Buy Tokens
            </button>
          ) : !subscription?.subscribed && !wallet.loading ? (
            <span
              className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold"
              style={{
                background: 'rgba(100,120,200,0.07)',
                border: '1px solid rgba(100,120,200,0.18)',
                color: 'rgba(160,180,220,0.5)',
              }}
            >
              <Coins className="w-3 h-3" />1 token / msg
            </span>
          ) : subscription?.subscribed ? (
            <span
              className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold"
              style={{
                background: 'hsl(265 80% 65% / 0.1)',
                border: '1px solid hsl(265 80% 65% / 0.3)',
                color: 'hsl(265 80% 80%)',
              }}
            >
              <Zap className="w-3 h-3" />
              Unlimited
            </span>
          ) : null}

          <NotificationBell />
        </div>
      </div>

      {!wallet.loading && wallet.balance === 0 && !subscription?.subscribed && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 shrink-0"
          style={{
            background:
              'linear-gradient(90deg, hsl(4 90% 58% / 0.1), hsl(265 80% 65% / 0.08))',
            borderBottom: '1px solid hsl(4 90% 58% / 0.25)',
          }}
        >
          <Coins
            className="w-4 h-4 shrink-0"
            style={{ color: 'hsl(4 90% 60%)' }}
          />

          <span
            className="flex-1 text-xs font-semibold"
            style={{ color: 'hsl(38 95% 72%)' }}
          >
            You're out of tokens — buy more to keep chatting
          </span>

          <button
            onClick={openTokens}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black transition-all"
            style={{
              background:
                'linear-gradient(135deg, hsl(265 80% 55% / 0.8), hsl(4 90% 55% / 0.7))',
              border: '1px solid hsl(265 80% 65% / 0.5)',
              color: 'white',
            }}
          >
            <ShoppingCart className="w-3 h-3" />
            Buy Tokens
          </button>
        </div>
      )}

      <div
        className={cn(
          'overflow-hidden transition-all duration-200 border-b border-border',
          searchOpen ? 'max-h-12 opacity-100' : 'max-h-0 opacity-0 border-b-0'
        )}
      >
        <div className="flex items-center gap-2 px-3 py-2 bg-[hsl(224_15%_11%)]">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setMatchCursor(0);
            }}
            onKeyDown={handleSearchKey}
            placeholder="Search messages…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none min-w-0"
          />

          {searchQuery.trim() && (
            <span
              className={cn(
                'text-[11px] font-semibold shrink-0 tabular-nums',
                matchIds.length > 0
                  ? 'text-[hsl(38_95%_65%)]'
                  : 'text-muted-foreground'
              )}
            >
              {matchIds.length > 0
                ? `${matchCursor + 1} / ${matchIds.length}`
                : 'No results'}
            </span>
          )}

          {matchIds.length > 1 && (
            <>
              <button
                onClick={goPrev}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-[hsl(224_15%_18%)] text-muted-foreground hover:text-foreground transition-colors"
                title="Previous (Shift+Enter)"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={goNext}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-[hsl(224_15%_18%)] text-muted-foreground hover:text-foreground transition-colors"
                title="Next (Enter)"
              >
                <ChevronDownIcon className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <button
            onClick={closeSearch}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[hsl(224_15%_18%)] text-muted-foreground hover:text-foreground transition-colors"
            title="Close (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {wakeword.active && (
        <div
          className={cn(
            'flex items-center justify-center gap-2 px-4 py-1.5 border-b transition-all duration-300',
            wakeword.phase === 'speaking'
              ? 'border-[hsl(4_90%_58%_/_0.35)] bg-[hsl(4_90%_58%_/_0.06)]'
              : 'border-[hsl(142_70%_55%_/_0.25)] bg-[hsl(142_70%_55%_/_0.04)]'
          )}
        >
          <div className="flex items-end gap-[3px] h-3.5">
            {[0.55, 0.75, 0.45, 0.85, 0.6].map((delay, i) => (
              <div
                key={i}
                className="w-0.5 rounded-full"
                style={{
                  height:
                    wakeword.phase === 'speaking' ? `${8 + i * 2}px` : '4px',
                  backgroundColor:
                    wakeword.phase === 'speaking'
                      ? 'hsl(4 90% 58%)'
                      : 'hsl(142 70% 55%)',
                  transition: 'height 0.2s ease',
                  animation: `bounce ${delay + 0.3}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.07}s`,
                }}
              />
            ))}
          </div>

          <Radio
            className="w-3 h-3"
            style={{
              color:
                wakeword.phase === 'speaking'
                  ? 'hsl(4 90% 58%)'
                  : 'hsl(142 70% 55%)',
            }}
          />

          <span
            className="text-[10px] font-semibold"
            style={{
              color:
                wakeword.phase === 'speaking'
                  ? 'hsl(4 90% 58%)'
                  : 'hsl(142 70% 55%)',
            }}
          >
            {wakeword.phase === 'speaking'
              ? 'MockJ speaking…'
              : 'Hey Mock — always listening'}
          </span>

          <span
            className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
            style={{
              background:
                wakeword.phase === 'speaking'
                  ? 'hsl(4 90% 58% / 0.12)'
                  : 'hsl(142 70% 55% / 0.1)',
              color:
                wakeword.phase === 'speaking'
                  ? 'hsl(4 90% 58%)'
                  : 'hsl(142 70% 55%)',
              border: `1px solid ${
                wakeword.phase === 'speaking'
                  ? 'hsl(4 90% 58% / 0.3)'
                  : 'hsl(142 70% 55% / 0.25)'
              }`,
            }}
          >
            {wakeword.sensitivity.toUpperCase()}
          </span>

          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{
              background:
                wakeword.phase === 'speaking'
                  ? 'hsl(4 90% 58%)'
                  : 'hsl(142 70% 55%)',
            }}
          />

          <button
            onClick={openSearch}
            title="Search (Ctrl+F)"
            className="ml-1 w-5 h-5 flex items-center justify-center rounded hover:bg-[hsl(142_70%_55%_/_0.12)] transition-colors"
          >
            <Search
              className="w-3 h-3"
              style={{
                color:
                  wakeword.phase === 'speaking'
                    ? 'hsl(4 90% 58%)'
                    : 'hsl(142 70% 55%)',
              }}
            />
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain relative"
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className={cn(
            'absolute inset-x-0 top-0 flex items-center justify-center transition-all duration-200 pointer-events-none z-10',
            showPullIndicator ? 'opacity-100' : 'opacity-0'
          )}
          style={{
            height: `${Math.max(pullDelta, refreshing ? 40 : 0)}px`,
          }}
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[hsl(224_15%_12%)] border border-border shadow-lg">
            {refreshing ? (
              <Loader2 className="w-3.5 h-3.5 text-[hsl(4_90%_58%)] animate-spin" />
            ) : (
              <RefreshCw
                className="w-3.5 h-3.5 text-[hsl(4_90%_58%)] transition-transform duration-200"
                style={{
                  transform: `rotate(${
                    Math.min(pullDelta / PULL_THRESHOLD, 1) * 180
                  }deg)`,
                }}
              />
            )}

            <span className="text-[10px] font-semibold text-muted-foreground">
              {refreshing
                ? 'Syncing…'
                : pullDelta >= PULL_THRESHOLD
                  ? 'Release to refresh'
                  : 'Pull to refresh'}
            </span>
          </div>
        </div>

        {messages.length === 0 && !isTyping ? (
          <div className="flex items-center justify-center min-h-full">
            <WelcomeScreen
              onSuggestion={t => onSend(t)}
              onOpenImageStudio={onOpenImageStudio}
              userName={user?.username}
            />
          </div>
        ) : (
          <div className="max-w-2xl mx-auto w-full px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-5">
            {messages.map((msg, index) => {
              // Determine read-tick state for user messages:
              // 'read' if AI has already replied after this message
              // 'delivered' if AI is currently typing (isTyping = true) and this is the last user message
              // 'sent' otherwise
              let tickState: 'sent' | 'delivered' | 'read' = 'sent';
              if (msg.role === 'user') {
                const hasAIReplyAfter = messages.slice(index + 1).some(m => m.role === 'assistant');
                if (hasAIReplyAfter) {
                  tickState = 'read';
                } else if (isTyping && index === messages.map((m, i) => m.role === 'user' ? i : -1).filter(i => i >= 0).slice(-1)[0]) {
                  tickState = 'delivered';
                }
              }
              return (
              <div
                key={msg.id}
                ref={el => setMessageRef(msg.id, el)}
                className={cn(
                  'rounded-2xl transition-all duration-200 scroll-mt-24',
                  msg.id === activeMatchId &&
                    'ring-2 ring-[hsl(38_95%_60%_/_0.7)] bg-[hsl(38_95%_60%_/_0.06)]'
                )}
              >
                <ChatMessage
                  message={msg}
                  isLast={index === messages.length - 1}
                  tickState={tickState}
                />
              </div>
            );
            })}

            {isTyping && <TypingIndicator />}

            {/* User typing indicator */}
            {userIsTyping && !isTyping && (
              <div className="flex items-center gap-2 px-4 py-1">
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs"
                  style={{ background: 'rgba(10,18,12,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ color: 'rgba(180,200,190,0.5)', fontStyle: 'italic' }}>typing</span>
                  <span className="flex gap-0.5">
                    {[0,1,2].map(i => (
                      <span key={i} className="w-1 h-1 rounded-full animate-bounce"
                        style={{ background: 'hsl(142 70% 55% / 0.5)', animationDelay: `${i * 150}ms`, display: 'inline-block' }} />
                    ))}
                  </span>
                </div>
              </div>
            )}

            <div ref={bottomRef} className="h-2" />
          </div>
        )}
      </div>

      {!searchOpen && messages.length > 0 && (
        <div className="absolute top-2 right-3 z-20">
          <button
            onClick={openSearch}
            title="Search messages (Ctrl+F)"
            className="w-7 h-7 flex items-center justify-center rounded-full border border-border bg-[hsl(224_15%_12%)] text-muted-foreground hover:text-foreground hover:border-[hsl(4_90%_58%_/_0.4)] hover:bg-[hsl(224_15%_16%)] transition-all duration-150 shadow-md"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showScrollBtn && (
        <div className="absolute bottom-[68px] right-3 z-20 md:bottom-4">
          <button
            onClick={scrollToBottom}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg border transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              background: 'hsl(224 15% 14%)',
              borderColor: 'hsl(4 90% 58% / 0.4)',
              color: 'hsl(4 90% 58%)',
              boxShadow: '0 4px 20px hsl(4 90% 58% / 0.2)',
            }}
          >
            <span>↓</span>
            <span>New messages</span>
          </button>
        </div>
      )}

      {showChips && firstAssistantMsg && (
        <div
          className="shrink-0"
          style={{
            borderTop: '1px solid rgba(100,120,200,0.1)',
            background: 'rgba(6,5,16,0.9)',
          }}
        >
          <div className="max-w-2xl mx-auto">
            <FollowUpChips
              lastResponse={firstAssistantMsg.content}
              onSend={text => onSend(text)}
            />
          </div>
        </div>
      )}

      <div
        className="shrink-0"
        style={{
          borderTop: '1px solid rgba(100,120,255,0.15)',
          background: 'rgba(8,8,18,0.95)',
          boxShadow: '0 -8px 32px rgba(100,120,255,0.05)',
        }}
      >
        <div className="max-w-2xl mx-auto w-full">
          <ChatInput
            mode={mode}
            onModeChange={onModeChange}
            onSend={(text, img) => onSend(text, img)}
            disabled={isTyping}
            pendingPrompt={pendingPrompt}
            onPendingPromptConsumed={onPendingPromptConsumed}
            deepReasoning={deepReasoning}
            onDeepReasoningChange={onDeepReasoningChange}
            onOpenPhotoRecreator={onOpenPhotoRecreator}
            onOpenVoiceChat={onOpenVoiceChat}
          />
        </div>
      </div>
    </div>
  );
}