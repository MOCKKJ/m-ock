
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Image, Video, MessageSquare, Menu, Globe, Coins, X,
  Zap, Crown, Users, ChevronDown, LogOut, User, Settings,
  ShoppingCart, TrendingUp, Sparkles, Layout, Code2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { usePageTracking } from '@/hooks/usePageTracking';
import Sidebar from '@/components/layout/Sidebar';
import ChatWindow from '@/components/features/ChatWindow';
import ImageGeneratorPanel from '@/components/features/ImageGeneratorPanel';
import VideoGeneratorPanel from '@/components/features/VideoGeneratorPanel';
import PromptLibrary from '@/components/features/PromptLibrary';
import PersonalityPicker, { PersonalityPreset, loadPersonality, savePersonality } from '@/components/features/PersonalityPicker';
import { loadStreamSpeed, StreamSpeed } from '@/components/features/ChatWindow';
import PricingModal from '@/components/features/PricingModal';
import WelcomeProModal from '@/components/features/WelcomeProModal';
import WalletPanel from '@/components/features/WalletPanel';
import VoiceChatPanel from '@/components/features/VoiceChatPanel';
import LowTokensModal from '@/components/features/LowTokensModal';
import PhotoRecreator from '@/components/features/PhotoRecreator';
import NotificationBell from '@/components/features/NotificationBell';
import CommunityBoard from '@/components/features/CommunityBoard';
import WebsiteBuilderPanel from '@/components/features/WebsiteBuilderPanel';
import IDEBuilderPanel from '@/components/features/IDEBuilderPanel';
import PWAInstallBanner from '@/components/features/PWAInstallBanner';
import { useTokenWallet } from '@/hooks/useTokenWallet';
import { useWakeword, getWakewordEnabled, getWakewordLang } from '@/hooks/useWakeword';
import { useTTSHealthCheck } from '@/hooks/useTTSHealthCheck';
import { useUsageLimits } from '@/hooks/useUsageLimits';
import { useAuth } from '@/contexts/AuthContext';
import { Conversation, Message, ChatMode } from '@/types/chat';
import {
  loadConversationsLocal,
  saveConversationsLocal,
  loadConversations,
  upsertConversationToCloud,
  deleteConversationFromCloud,
  createConversation,
  generateTitle,
} from '@/lib/storage';
import {
  streamChatResponse,
  generateImage,
  generateVideo,
  buildMessage,
  ChatHistoryMessage,
} from '@/lib/mockAI';
import { Analytics } from '@/lib/analytics';
import { PERSONALITY_PRESETS } from '@/components/features/PersonalityPicker';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type TabMode = 'chat' | 'image-studio' | 'video-studio' | 'universe' | 'community' | 'website-builder' | 'ide-builder';

// ── MLTX Green palette ────────────────────────────────────────────────────
const GREEN  = 'hsl(142 70% 55%)';
const GREEN2 = 'hsl(142 70% 42%)';
const RED    = 'hsl(4 90% 58%)';

// ── Matrix Rain — MOCKJ green glowing letters ─────────────────────────────
function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const CHARS = 'MOCKJ01モコクジMOCKJモCKJ10モコクMOCKJ';
    const FS = 14;
    let cols = Math.floor(canvas.width / FS);
    const drops: number[] = Array.from({ length: Math.max(cols, 200) }, () => Math.random() * -120);
    ctx.font = `bold ${FS}px monospace`;
    const interval = setInterval(() => {
      cols = Math.floor(canvas.width / FS);
      ctx.fillStyle = 'rgba(2,10,4,0.06)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < cols; i++) {
        if (drops[i] === undefined) drops[i] = Math.random() * -120;
        const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
        const y = drops[i] * FS;
        const x = i * FS;
        if (y > 0) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#00c850';
          ctx.fillStyle = 'rgba(180,255,200,0.95)';
          ctx.fillText(ch, x, y);
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(0,180,70,0.3)';
          const t = CHARS[Math.floor(Math.random() * CHARS.length)];
          ctx.fillText(t, x, y - FS);
        }
        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i] += 0.45;
      }
    }, 55);
    return () => { clearInterval(interval); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" style={{ opacity: 0.065 }} aria-hidden="true" />;
}

// ── Sparkle field — luxury multicolor ───────────────────────────────────────
const SPARKLE_COLORS = [
  'hsl(142 70% 55%)', 'hsl(310 80% 70%)', 'hsl(265 80% 70%)',
  'hsl(38 95% 65%)',  'hsl(0 0% 100%)',   'hsl(191 97% 65%)',
];
const SPARKLES = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  left: `${(i * 2.7 + Math.sin(i) * 15) % 100}%`,
  top:  `${(i * 3.1 + Math.cos(i) * 20) % 100}%`,
  size: (i % 3) + 2,
  dur:  `${4 + (i % 5)}s`,
  delay:`${(i * 0.4) % 7}s`,
  color: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
}));

function SparkleField() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {SPARKLES.map(s => (
        <div
          key={s.id}
          className="sparkle"
          style={{
            left: s.left, top: s.top,
            width: s.size, height: s.size,
            background: s.color,
            boxShadow: `0 0 ${s.size * 4}px ${s.color}, 0 0 ${s.size * 8}px ${s.color}55`,
            animation: `sparkle-twinkle ${s.dur} ease-in-out infinite`,
            animationDelay: s.delay,
          }}
        />
      ))}
    </div>
  );
}

// ── Particle field — MLTX green dominant ──────────────────────────────────
const PARTICLES = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  left: `${Math.random() * 100}%`,
  bottom: `${Math.random() * 20}%`,
  size: Math.random() * 3 + 1.5,
  dur: `${Math.random() * 14 + 10}s`,
  delay: `${Math.random() * 12}s`,
  drift: Math.random() > 0.5 ? 1 : -1,
  color: [GREEN, GREEN2, GREEN, RED][Math.floor(Math.random() * 4)],
}));

function ParticleField() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {PARTICLES.map(p => (
        <div
          key={p.id}
          className="particle"
          style={{
            left: p.left,
            bottom: p.bottom,
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
            ['--dur' as string]: p.dur,
            ['--delay' as string]: p.delay,
            ['--drift' as string]: p.drift,
          }}
        />
      ))}
    </div>
  );
}

// ── Plan badge ─────────────────────────────────────────────────────────────
function PlanBadge({ tier }: { tier: string }) {
  const isElite = tier === 'elite';
  const isPro   = tier === 'pro' || tier === 'starter';
  if (isElite) return (
    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
      style={{ background: 'linear-gradient(135deg, hsl(38 95% 60% / 0.2), hsl(310 80% 65% / 0.15))', border: '1px solid hsl(38 95% 60% / 0.6)', color: 'hsl(38 95% 72%)', boxShadow: '0 0 12px hsl(38 95% 60% / 0.3)' }}>
      <Crown className="w-3 h-3" />Elite
    </span>
  );
  if (isPro) return (
    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
      style={{ background: `${GREEN}22`, border: `1px solid ${GREEN}66`, color: GREEN, boxShadow: `0 0 10px ${GREEN}33` }}>
      <Zap className="w-3 h-3" />Pro
    </span>
  );
  return (
    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
      style={{ background: `${GREEN}10`, border: `1px solid ${GREEN}30`, color: `${GREEN}bb` }}>
      Free
    </span>
  );
}

// ── Profile dropdown ───────────────────────────────────────────────────────
function ProfileMenu({ user, subscription, onSignOut }: {
  user: { username?: string; email?: string; avatar?: string } | null;
  subscription: { subscribed: boolean; tier: string } | null;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const initial = (user?.username?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase();
  const tier = subscription?.tier ?? 'free';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-all duration-150"
        style={{
          background: open ? `${GREEN}14` : 'rgba(3,10,5,0.85)',
          border: `1px solid ${open ? `${GREEN}55` : `${GREEN}28`}`,
        }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLButtonElement).style.borderColor = `${GREEN}44`; }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLButtonElement).style.borderColor = `${GREEN}28`; }}
      >
        {user?.avatar ? (
          <img src={user.avatar} alt="avatar" className="w-6 h-6 rounded-full object-cover" />
        ) : (
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black"
            style={{ background: `linear-gradient(135deg, ${GREEN2}, ${GREEN})`, color: '#000' }}>
            {initial}
          </div>
        )}
        <span className="text-xs font-semibold text-white/70 max-w-[80px] truncate hidden sm:block">
          {user?.username ?? user?.email?.split('@')[0] ?? 'Account'}
        </span>
        <ChevronDown className="w-3 h-3 text-white/40 transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-52 rounded-2xl overflow-hidden z-50 shadow-2xl"
          style={{ background: 'hsl(142 20% 4%)', border: `1px solid ${GREEN}38`, boxShadow: `0 16px 48px rgba(0,0,0,0.7), 0 0 30px ${GREEN}12` }}>
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${GREEN}18` }}>
            <p className="text-sm font-bold text-white truncate">{user?.username ?? 'User'}</p>
            <p className="text-[11px] text-white/40 truncate">{user?.email}</p>
            <div className="mt-2"><PlanBadge tier={tier} /></div>
          </div>
          {[
            { icon: User,       label: 'Account',     action: () => { navigate('/account'); setOpen(false); } },
            { icon: Coins,      label: 'Token Shop',  action: () => { navigate('/tokens'); setOpen(false); } },
            { icon: TrendingUp, label: 'Leaderboard', action: () => { navigate('/leaderboard'); setOpen(false); } },
            { icon: Settings,   label: 'Settings',    action: () => { navigate('/account'); setOpen(false); } },
          ].map(({ icon: Icon, label, action }) => (
            <button key={label} onClick={action}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/60 hover:text-white transition-colors"
              style={{ borderBottom: `1px solid ${GREEN}12` }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${GREEN}0a`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
          <button onClick={() => { onSignOut(); setOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
            style={{ color: RED }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${RED}10`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
            <LogOut className="w-3.5 h-3.5" />Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function Index() {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversationsLocal());
  const cloudSyncedRef = useRef(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('chat');
  const [tabMode, setTabMode] = useState<TabMode>('chat');
  const [showLibrary, setShowLibrary] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [deepReasoning, setDeepReasoning] = useState(false);
  const [personality, setPersonality] = useState<PersonalityPreset>(() => loadPersonality());
  const [showPersonality, setShowPersonality] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [showWelcomePro, setShowWelcomePro] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showVoiceChat, setShowVoiceChat] = useState(false);
  const [showPhotoRecreator, setShowPhotoRecreator] = useState(false);
  const [lastAIResponse, setLastAIResponse] = useState<string>('');
  const [wakewordEnabled, setWakewordEnabled] = useState(() => getWakewordEnabled());
  const [wakewordLang, setWakewordLang] = useState(() => getWakewordLang());
  const [lowTokensModal, setLowTokensModal] = useState<{ required?: number; balance?: number } | null>(null);
  const [expiryBanner, setExpiryBanner] = useState<{ daysLeft: number } | null>(null);
  const [trialBanner, setTrialBanner] = useState<{ daysLeft: number; hoursLeft: number } | null>(null);
  const trialCheckedRef = useRef(false);
  const voiceGreetedRef = useRef(false);
  const { subscription, user, logout } = useAuth();
  usePageTracking();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { consumeOrBlock } = useUsageLimits();
  const { wallet } = useTokenWallet();

  const tier = subscription?.tier ?? 'free';

  useEffect(() => {
    const handler = () => {
      setTrialBanner(null); // clear trial banner
      setExpiryBanner(null);
    };
    window.addEventListener('mockj:subscription-expired', handler);
    return () => window.removeEventListener('mockj:subscription-expired', handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { daysLeft } = (e as CustomEvent<{ daysLeft: number }>).detail;
      setExpiryBanner(prev => prev ?? { daysLeft });
    };
    window.addEventListener('mockj:subscription-expiring-soon', handler);
    return () => window.removeEventListener('mockj:subscription-expiring-soon', handler);
  }, []);

  useEffect(() => {
    if (!user || wallet.loading) return;
    if (!wallet.streak.canClaimToday) return;
    const sessionKey = `mockj_streak_toast_${user.id}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, '1');
    const nextDay = wallet.streak.current + 1;
    const reward = wallet.streak.todayReward;
    toast(`🔥 Day ${nextDay} streak available — claim +${reward} tokens`, {
      duration: 8000,
      action: { label: 'Claim now', onClick: () => navigate('/tokens?tab=earn') },
    });
  }, [user?.id, wallet.loading, navigate, wallet.streak.canClaimToday, wallet.streak.current, wallet.streak.todayReward]);

  useEffect(() => {
    const onEnabled = (e: Event) => setWakewordEnabled((e as CustomEvent<{ enabled: boolean }>).detail.enabled);
    const onLang    = (e: Event) => setWakewordLang((e as CustomEvent<{ lang: string }>).detail.lang);
    window.addEventListener('mockj:wakeword-change', onEnabled);
    window.addEventListener('mockj:wakeword-lang-change', onLang);
    return () => {
      window.removeEventListener('mockj:wakeword-change', onEnabled);
      window.removeEventListener('mockj:wakeword-lang-change', onLang);
    };
  }, []);

  useWakeword(
    () => {
      if (!showVoiceChat) {
        setShowVoiceChat(true);
        setTimeout(() => window.dispatchEvent(new CustomEvent('mockj:wakeword-activate')), 350);
      }
    },
    wakewordEnabled && !!user,
    showVoiceChat,
    wakewordLang
  );

  useTTSHealthCheck(user?.id);

  // ── Trial countdown banner ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user || trialCheckedRef.current) return;
    trialCheckedRef.current = true;
    const fetchTrialStatus = async () => {
      const { data } = await supabase
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('user_id', user.id)
        .eq('status', 'trialing')
        .maybeSingle();
      if (!data?.current_period_end) return;
      const trialEnd = new Date(data.current_period_end);
      const now = new Date();
      const diffMs = trialEnd.getTime() - now.getTime();
      if (diffMs <= 0) return; // already expired
      const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
      const daysLeft = Math.floor(totalHours / 24);
      const hoursLeft = totalHours % 24;
      setTrialBanner({ daysLeft, hoursLeft });
      // Insert a DB notification if ≤ 1 day remaining (idempotent — once per calendar day)
      if (daysLeft < 1) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: existing } = await supabase
          .from('notifications')
          .select('id, sent_at')
          .eq('user_id', user.id)
          .eq('type', 'trial_expiring')
          .gte('sent_at', today)
          .maybeSingle();
        if (!existing) {
          await supabase.from('notifications').insert({
            user_id: user.id,
            type: 'trial_expiring',
            title: 'Trial ends tomorrow — add your card',
            body: 'Your 3-day free trial expires soon. Add a payment method in the billing portal to keep full Pro access.',
            days_until_expiry: 1,
            subscription_end: data.current_period_end,
            read: false,
          });
          // Dispatch event so NotificationBell refreshes
          window.dispatchEvent(new CustomEvent('mockj:trial-expiring'));
        }
      }
    };
    fetchTrialStatus();
  }, [user]);

  // ── Voice-activated greeting on first load ────────────────────────────────
  useEffect(() => {
    if (voiceGreetedRef.current) return;
    voiceGreetedRef.current = true;
    // Only speak if TTS is likely available and user hasn't disabled sound
    const soundEnabled = localStorage.getItem('mockj_sound_enabled') !== 'false';
    if (!soundEnabled) return;
    // Show a toast greeting after 3 seconds
    const timer = setTimeout(() => {
      const greetings = [
        "Yo, MockJ is voice activated — say 'Hey Mock' to start, or just type. I got you.",
        "What's good? MockJ in the building. Voice activated — say 'Hey Mock' anytime. Let's build.",
        "Bet. MockJ is live. I'm voice activated — 'Hey Mock' wakes me up. What are we building today?",
        "MockJ here. Wired and ready. Say 'Hey Mock' to go hands-free, or drop your message below.",
      ];
      const msg = greetings[Math.floor(Math.random() * greetings.length)];
      toast(msg, {
        duration: 7000,
        icon: '🎙️',
        action: {
          label: 'Go Voice',
          onClick: () => setShowVoiceChat(true),
        },
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, []); // Only run once on mount

  useEffect(() => {
    if (!user || cloudSyncedRef.current) return;
    cloudSyncedRef.current = true;
    loadConversations(user.id).then(cloudConvs => {
      if (cloudConvs.length > 0) {
        setConversations(cloudConvs);
        saveConversationsLocal(cloudConvs);
      }
    });
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (refCode) {
      localStorage.setItem('mockj_pending_ref', refCode.toUpperCase());
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
  }, []);

  useEffect(() => {
    if (searchParams.get('pricing') === 'open') {
      setShowPricing(true);
      const next = new URLSearchParams(searchParams);
      next.delete('pricing');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const state = location.state as { pendingPrompt?: string } | null;
    if (state?.pendingPrompt) {
      setTabMode('chat');
      setPendingPrompt(state.pendingPrompt);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  useEffect(() => {
    const handler = () => {
      setTrialBanner(null); // clear trial banner
      setExpiryBanner(null);
    };
    window.addEventListener('mockj:subscription-expired', handler);
    return () => window.removeEventListener('mockj:subscription-expired', handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ required?: number; balance?: number }>).detail;
      setLowTokensModal({ required: detail.required, balance: detail.balance });
    };
    window.addEventListener('mockj:low-tokens', handler);
    return () => window.removeEventListener('mockj:low-tokens', handler);
  }, []);

  useEffect(() => {
    const handler = () => { setShowPricing(false); setShowWelcomePro(true); };
    window.addEventListener('mockj:checkout-success', handler);
    return () => window.removeEventListener('mockj:checkout-success', handler);
  }, []);

  // ── Checkout success confetti + toast on main app screen ─────────────────
  useEffect(() => {
    const handleCheckoutSuccess = () => {
      // Green toast
      toast.success('🎉 Tokens added to your wallet!', {
        duration: 6000,
        style: {
          background: 'hsl(224 20% 7%)',
          border: `1px solid ${GREEN}66`,
          color: '#fff',
          boxShadow: `0 0 24px ${GREEN}44`,
        },
        action: {
          label: 'View Balance',
          onClick: () => navigate('/tokens'),
        },
      });
      // Confetti burst
      const loadAndFire = async () => {
        try {
          type ConfettiFn = (opts: Record<string, unknown>) => void;
          type CW = Window & { confetti?: ConfettiFn };
          const w = window as CW;
          if (!w.confetti) {
            await new Promise<void>((resolve, reject) => {
              const s = document.createElement('script');
              s.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js';
              s.onload = () => resolve();
              s.onerror = () => reject();
              document.head.appendChild(s);
            });
          }
          const confetti = (window as CW).confetti!;
          const COLORS = [GREEN, GREEN2, RED, 'hsl(38 95% 60%)', '#39ff14', '#ffd700', '#ffffff'];
          confetti({ particleCount: 100, spread: 70, origin: { x: 0.5, y: 0.4 }, colors: COLORS, gravity: 0.9 });
          setTimeout(() => confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0, y: 0.6 }, colors: COLORS }), 200);
          setTimeout(() => confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1, y: 0.6 }, colors: COLORS }), 350);
        } catch { /* cosmetic — ignore */ }
      };
      loadAndFire();
    };
    window.addEventListener('mockj:checkout-success', handleCheckoutSuccess);
    return () => window.removeEventListener('mockj:checkout-success', handleCheckoutSuccess);
  }, [navigate]);

  useEffect(() => {
    const handler = () => setShowPricing(true);
    window.addEventListener('mockj:open-pricing', handler);
    return () => window.removeEventListener('mockj:open-pricing', handler);
  }, []);

  useEffect(() => { if (showPricing) Analytics.upgradeViewed(); }, [showPricing]);

  const handlePersonalityChange = (preset: PersonalityPreset) => {
    setPersonality(preset);
    savePersonality(preset);
    const label = PERSONALITY_PRESETS.find(p => p.id === preset)?.label ?? preset;
    toast.success(`Personality set to ${label}`);
  };

  const activeConv = conversations.find(c => c.id === activeId) ?? null;

  const persist = (convs: Conversation[], changedConv?: Conversation, deletedId?: string) => {
    setConversations(convs);
    saveConversationsLocal(convs);
    if (user) {
      if (changedConv) upsertConversationToCloud(changedConv);
      if (deletedId) deleteConversationFromCloud(deletedId);
    }
  };

  const handleNew = useCallback((mode: ChatMode = 'chat') => {
    const conv = createConversation(mode);
    const updated = [conv, ...conversations];
    persist(updated, conv);
    setActiveId(conv.id);
    setChatMode(mode);
    setTabMode('chat');
  }, [conversations]);

  const handleSelect = (id: string) => { setActiveId(id); setTabMode('chat'); };
  const handleDelete = (id: string) => {
    const updated = conversations.filter(c => c.id !== id);
    persist(updated, undefined, id);
    if (activeId === id) setActiveId(updated[0]?.id ?? null);
  };

  const handleSend = async (text: string, imageDataUrl?: string) => {
    const action = chatMode === 'image' ? 'image' : chatMode === 'video' ? 'video' : 'chat';
    if (!consumeOrBlock(action)) {
      toast.error(`Daily limit reached. Upgrade to MockJ Pro for unlimited access.`);
      setShowPricing(true);
      return;
    }
    let convId = activeId;
    let convs = conversations;
    if (!convId) {
      const newConv = createConversation(chatMode);
      convs = [newConv, ...conversations];
      convId = newConv.id;
      setActiveId(convId);
    }
    const userMsg = { ...buildMessage('user', text, 'text'), userAvatar: user?.avatar };
    convs = convs.map(c => {
      if (c.id !== convId) return c;
      const msgs = [...c.messages, userMsg];
      return { ...c, messages: msgs, title: msgs.length === 1 ? generateTitle(text) : c.title, updatedAt: new Date() };
    });
    persist(convs, convs.find(c => c.id === convId));
    setIsTyping(true);
    try {
      if (chatMode === 'chat') {
        Analytics.chatSent();
        if (imageDataUrl) {
          const imgPreviewMsg: Message = {
            id: crypto.randomUUID(), role: 'user', content: text, type: 'image',
            mediaUrl: imageDataUrl, timestamp: new Date(),
          };
          convs = convs.map(c => c.id === convId ? { ...c, messages: [...c.messages.slice(0, -1), imgPreviewMsg] } : c);
          setConversations([...convs]);
        }
        const currentConv = convs.find(c => c.id === convId);
        const historyMsgs = currentConv?.messages ?? [];
        const history: ChatHistoryMessage[] = historyMsgs
          .slice(-21, -1).filter(m => m.type === 'text')
          .map(m => ({ role: m.role, content: m.content }));
        const aiMsgId = crypto.randomUUID();
        const streamingMsg: Message = { id: aiMsgId, role: 'assistant', content: '', type: 'text', timestamp: new Date(), streaming: true };
        convs = convs.map(c => c.id === convId ? { ...c, messages: [...c.messages, streamingMsg], updatedAt: new Date() } : c);
        setConversations([...convs]);
        let accumulated = '';
        const stream = streamChatResponse(imageDataUrl ? `[Image attached] ${text}` : text, history, deepReasoning, personality);
        const speed: StreamSpeed = loadStreamSpeed();
        for await (const chunk of stream) {
          if (speed === 'fast') {
            accumulated += chunk;
          } else if (speed === 'cinematic') {
            const words = chunk.split(/(\s+)/);
            for (const word of words) {
              accumulated += word;
              const updatedMsg: Message = { id: aiMsgId, role: 'assistant', content: accumulated, type: 'text', timestamp: new Date(), streaming: true };
              convs = convs.map(c => c.id !== convId ? c : { ...c, messages: c.messages.map(m => m.id === aiMsgId ? updatedMsg : m), updatedAt: new Date() });
              setConversations([...convs]);
              if (word.trim()) await new Promise(r => setTimeout(r, 38));
            }
            continue;
          } else {
            accumulated += chunk;
          }
          const updatedMsg: Message = { id: aiMsgId, role: 'assistant', content: accumulated, type: 'text', timestamp: new Date(), streaming: true };
          convs = convs.map(c => c.id !== convId ? c : { ...c, messages: c.messages.map(m => m.id === aiMsgId ? updatedMsg : m), updatedAt: new Date() });
          setConversations([...convs]);
        }
        const finalMsg: Message = {
          id: aiMsgId, role: 'assistant',
          content: accumulated || "I seem to have lost my train of thought. Could you try again?",
          type: 'text', timestamp: new Date(), streaming: false,
        };
        setLastAIResponse(finalMsg.content);
        convs = convs.map(c => c.id !== convId ? c : { ...c, messages: c.messages.map(m => m.id === aiMsgId ? finalMsg : m), updatedAt: new Date() });
        persist(convs, convs.find(c => c.id === convId));
        window.dispatchEvent(new CustomEvent('mockj:tokens-spent'));
      } else if (chatMode === 'image') {
        Analytics.imageSent();
        const imageUrl = await generateImage({ prompt: text, style: 'realistic', aspectRatio: '1:1', quality: '1K' });
        const aiMsg = buildMessage('assistant', `Here's your generated image for: "${text}"`, 'image', imageUrl, text);
        convs = convs.map(c => c.id === convId ? { ...c, messages: [...c.messages, aiMsg], updatedAt: new Date() } : c);
        persist(convs, convs.find(c => c.id === convId));
      } else if (chatMode === 'video') {
        Analytics.videoSent();
        const videoResult = await generateVideo({ prompt: text, style: 'cinematic', duration: '10s' });
        const aiMsg = buildMessage('assistant', `Video generated: ${videoResult.label} · ${videoResult.duration}`, 'video', videoResult.thumbnailUrl, text);
        convs = convs.map(c => c.id === convId ? { ...c, messages: [...c.messages, aiMsg], updatedAt: new Date() } : c);
        persist(convs, convs.find(c => c.id === convId));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      const errObj = err as { limitExceeded?: boolean; tokenShortfall?: boolean };
      if (errObj.tokenShortfall) {
        const shortfallErr = err as { required?: number; balance?: number };
        setLowTokensModal({ required: shortfallErr.required, balance: shortfallErr.balance });
      } else if (errObj.limitExceeded) {
        toast.error(message);
        setShowPricing(true);
      } else {
        toast.error(`MockJ: ${message}`);
      }
    } finally {
      setIsTyping(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    if (!user || !activeId) return;
    const cloudConvs = await loadConversations(user.id);
    if (cloudConvs.length > 0) {
      setConversations(cloudConvs);
      saveConversationsLocal(cloudConvs);
    }
  }, [user, activeId]);

  const handleVoiceSend = async (text: string, _imageDataUrl?: string): Promise<string> => {
    if (!consumeOrBlock('chat')) { setShowPricing(true); throw new Error('Daily limit reached'); }
    let convId = activeId;
    let convs = conversations;
    if (!convId) {
      const newConv = createConversation('chat');
      convs = [newConv, ...conversations];
      convId = newConv.id;
      setActiveId(convId);
    }
    const userMsg = { ...buildMessage('user', text, 'text'), userAvatar: user?.avatar };
    convs = convs.map(c => c.id !== convId ? c : { ...c, messages: [...c.messages, userMsg], title: c.messages.length === 0 ? generateTitle(text) : c.title, updatedAt: new Date() });
    persist(convs, convs.find(c => c.id === convId));
    Analytics.chatSent();
    const currentConv = convs.find(c => c.id === convId);
    const history: ChatHistoryMessage[] = (currentConv?.messages ?? []).slice(-21, -1).filter(m => m.type === 'text').map(m => ({ role: m.role, content: m.content }));
    let accumulated = '';
    const stream = streamChatResponse(text, history, false, personality);
    for await (const chunk of stream) { accumulated += chunk; }
    const aiMsg = buildMessage('assistant', accumulated || 'No response', 'text');
    convs = convs.map(c => c.id !== convId ? c : { ...c, messages: [...c.messages, aiMsg], updatedAt: new Date() });
    persist(convs, convs.find(c => c.id === convId));
    setLastAIResponse(accumulated);
    window.dispatchEvent(new CustomEvent('mockj:tokens-spent'));
    return accumulated;
  };

  const MOBILE_TABS: { mode: TabMode; icon: typeof MessageSquare; label: string }[] = [
    { mode: 'chat',            icon: MessageSquare, label: 'Chat' },
    { mode: 'image-studio',    icon: Image,         label: 'Images' },
    { mode: 'video-studio',    icon: Video,         label: 'Video' },
    { mode: 'community',       icon: Users,         label: 'Community' },
    { mode: 'website-builder', icon: Layout,        label: 'Builder' },
  ];

  const AI_TOOLS = [
    { label: 'App Blueprint',  prompt: 'Help me build a complete app blueprint — tech stack, database schema, API design, and roadmap. What type of app?' },
    { label: 'Code Fix',       prompt: 'I need help fixing a bug. Paste your code and describe the issue.' },
    { label: 'Image Edit',     prompt: null, action: 'image' as const },
    { label: 'Money Strategy', prompt: "Give me a personalized money strategy — budgeting, investing, and income growth. What's your goal?" },
    { label: 'Launch Plan',    prompt: "Help me create a go-to-market launch plan. What are you launching?" },
    { label: 'SEO Copy',       prompt: 'Write high-converting SEO-optimized copy. What product or service?' },
    { label: 'Video Script',   prompt: "Write a YouTube video script. What's the topic?" },
  ];

  return (
    <div className="flex h-screen overflow-hidden relative" style={{ background: '#020a04' }}>
      <MatrixRain />
      <ParticleField />
      <SparkleField />

      {/* MLTX Green ambient orbs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-[0.09]"
          style={{ background: `radial-gradient(circle, ${GREEN}, transparent 70%)` }} />
        <div className="absolute top-1/2 -right-32 w-80 h-80 rounded-full opacity-[0.06]"
          style={{ background: `radial-gradient(circle, ${GREEN2}, transparent 70%)` }} />
        <div className="absolute -bottom-24 left-1/3 w-72 h-72 rounded-full opacity-[0.07]"
          style={{ background: `radial-gradient(circle, ${RED}, transparent 70%)` }} />
      </div>

      {/* ── Trial countdown banner ── */}
      {trialBanner && (
        <div
          className="fixed top-0 inset-x-0 z-[61] flex items-center gap-3 px-4 py-2"
          style={{
            background: `linear-gradient(90deg, ${GREEN}10, hsl(142 70% 42% / 0.12))`,
            borderBottom: `1px solid ${GREEN}44`,
            backdropFilter: 'blur(8px)',
          }}
        >
          <span className="flex-1 text-center text-xs font-semibold" style={{ color: 'rgba(200,240,210,0.85)' }}>
            🎉 Free trial active —{' '}
            <strong className="font-black" style={{ color: GREEN }}>
              {trialBanner.daysLeft === 0
                ? `${trialBanner.hoursLeft}h remaining`
                : `${trialBanner.daysLeft} day${trialBanner.daysLeft !== 1 ? 's' : ''} left`
              }
            </strong>{' '}—{' '}
            <button
              onClick={async () => {
                const { data } = await supabase.functions.invoke('customer-portal', {});
                if (data?.url) window.open(data.url, '_blank');
              }}
              className="underline underline-offset-2 font-black hover:opacity-80 transition-opacity"
              style={{ color: GREEN }}
            >
              Add Card to Keep Access
            </button>
          </span>
          <button
            onClick={() => setTrialBanner(null)}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-white/40 hover:text-white"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Subscription expiry banner */}
      {expiryBanner && (
        <div className="fixed top-0 inset-x-0 z-[60] flex items-center gap-3 px-4 py-2"
          style={{ background: 'linear-gradient(90deg, hsl(38 95% 60% / 0.15), hsl(4 90% 58% / 0.15))', borderBottom: '1px solid hsl(38 95% 60% / 0.35)', backdropFilter: 'blur(8px)' }}>
          <span className="flex-1 text-center text-xs font-semibold" style={{ color: 'hsl(38 95% 72%)' }}>
            ⚠️ Your MockJ Pro expires in{' '}
            <strong className="font-black">{expiryBanner.daysLeft === 0 ? 'less than a day' : `${expiryBanner.daysLeft} day${expiryBanner.daysLeft !== 1 ? 's' : ''}`}</strong>{' '}—{' '}
            <button onClick={() => navigate('/account')} className="underline underline-offset-2 font-black hover:opacity-80" style={{ color: 'hsl(38 95% 72%)' }}>renew now</button>
          </span>
          <button onClick={() => setExpiryBanner(null)} className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-white/40 hover:text-white">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden" onClick={() => setMobileSidebarOpen(false)} />
      )}

      <div className={cn('fixed inset-y-0 left-0 z-50 transition-transform duration-300 md:static md:translate-x-0', mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full')}>
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          activeConversation={activeConv}
          onSelect={(id) => { handleSelect(id); setMobileSidebarOpen(false); }}
          onNew={(mode) => { handleNew(mode); setMobileSidebarOpen(false); }}
          onDelete={handleDelete}
          onOpenLibrary={() => { setShowLibrary(true); setMobileSidebarOpen(false); }}
          onOpenPersonality={() => { setShowPersonality(true); setMobileSidebarOpen(false); }}
          onOpenPricing={() => { setShowPricing(true); setMobileSidebarOpen(false); }}
          onOpenWallet={() => { setShowWallet(true); setMobileSidebarOpen(false); }}
          currentPersonality={personality}
          onMobileClose={() => setMobileSidebarOpen(false)}
          activeTab={tabMode}
          onTabChange={(t) => setTabMode(t as TabMode)}
        />
      </div>

      {/* ── Main column ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">

        {/* DESKTOP HEADER */}
        <header className="hidden md:flex items-center gap-3 px-5 py-3 shrink-0"
          style={{ background: 'rgba(2, 8, 3, 0.92)', backdropFilter: 'blur(24px)', borderBottom: `1px solid ${GREEN}22`, boxShadow: `0 1px 0 ${GREEN}10` }}>

          {/* Logo — MockJ mascot icon */}
          <button onClick={() => setTabMode('chat')} className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-xl overflow-hidden relative"
              style={{ border: `1.5px solid ${GREEN}66`, boxShadow: `0 0 16px ${GREEN}55` }}>
              <img src="/mockj-icon.png" alt="MockJ" className="w-full h-full object-cover object-top" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-lg font-black tracking-wide"
                style={{ fontFamily: 'Space Grotesk, sans-serif', background: `linear-gradient(135deg, ${GREEN}, hsl(142 70% 45%), ${RED})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                MockJ
              </span>
              <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: `${GREEN}88`, letterSpacing: '0.12em' }}>Your Digital Plug</span>
            </div>
          </button>

          {/* Nav tabs */}
          <nav className="flex items-center gap-1 ml-2">
            {([
              { mode: 'chat'            as TabMode, icon: MessageSquare, label: 'Chat' },
              { mode: 'image-studio'    as TabMode, icon: Image,         label: 'Image Studio' },
              { mode: 'video-studio'    as TabMode, icon: Video,         label: 'Video Studio' },
              { mode: 'community'       as TabMode, icon: Users,         label: 'Community' },
              { mode: 'website-builder' as TabMode, icon: Layout,        label: 'Website Builder' },
                { mode: 'ide-builder' as TabMode,      icon: Code2,         label: 'IDE Builder' },
            ] as const).map(({ mode, icon: Icon, label }) => (
              <button key={mode} onClick={() => setTabMode(mode)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 relative"
                style={{
                  background: tabMode === mode ? `${GREEN}18` : 'transparent',
                  color: tabMode === mode ? GREEN : 'rgba(160,190,170,0.5)',
                  border: tabMode === mode ? `1px solid ${GREEN}44` : '1px solid transparent',
                  boxShadow: tabMode === mode ? `0 0 14px ${GREEN}22` : 'none',
                }}
                onMouseEnter={e => { if (tabMode !== mode) { const el = e.currentTarget as HTMLButtonElement; el.style.color = GREEN; el.style.background = `${GREEN}0c`; } }}
                onMouseLeave={e => { if (tabMode !== mode) { const el = e.currentTarget as HTMLButtonElement; el.style.color = 'rgba(160,190,170,0.5)'; el.style.background = 'transparent'; } }}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {mode === 'community' && (
                  <span className="live-dot w-1.5 h-1.5 rounded-full inline-block" style={{ background: GREEN }} />
                )}
              </button>
            ))}
          </nav>

          <div className="flex-1" />

          {/* Token pill */}
          <button onClick={() => navigate('/tokens')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-150 shrink-0"
            style={{
              background: wallet.balance < 50 ? `${RED}14` : `${GREEN}12`,
              border: wallet.balance < 50 ? `1px solid ${RED}55` : `1px solid ${GREEN}44`,
              boxShadow: wallet.balance < 50 ? `0 0 14px ${RED}25` : `0 0 10px ${GREEN}18`,
            }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.boxShadow = wallet.balance < 50 ? `0 0 24px ${RED}45` : `0 0 24px ${GREEN}38`; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.boxShadow = wallet.balance < 50 ? `0 0 14px ${RED}25` : `0 0 10px ${GREEN}18`; }}
          >
            <Coins className="w-3.5 h-3.5" style={{ color: wallet.balance < 50 ? RED : GREEN }} />
            <span className="text-xs font-black tabular-nums" style={{ color: wallet.balance < 50 ? RED : GREEN }}>
              {wallet.loading ? '…' : wallet.balance.toLocaleString()}
            </span>
            {wallet.balance < 50 && !wallet.loading && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full animate-pulse"
                style={{ background: `${RED}22`, color: RED, border: `1px solid ${RED}55` }}>LOW</span>
            )}
          </button>

          <PlanBadge tier={tier} />

          {/* Upgrade CTA */}
          {!subscription?.subscribed ? (
            <button onClick={() => setShowPricing(true)}
              className="relative overflow-hidden flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black transition-all duration-150 shrink-0 shine-sweep"
              style={{ background: `linear-gradient(135deg, hsl(142 70% 32%), hsl(142 70% 24%))`, border: `1px solid ${GREEN}66`, color: 'white', boxShadow: `0 0 22px ${GREEN}44` }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 40px ${GREEN}77`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 22px ${GREEN}44`; }}>
              <Sparkles className="w-3 h-3" />Upgrade
            </button>
          ) : (
            <button onClick={() => navigate('/tokens')}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black transition-all duration-150 shrink-0"
              style={{ background: `${GREEN}12`, border: `1px solid ${GREEN}44`, color: GREEN }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 20px ${GREEN}38`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; }}>
              <ShoppingCart className="w-3 h-3" />Buy Tokens
            </button>
          )}

          <NotificationBell />

          {user ? (
            <ProfileMenu user={user} subscription={subscription} onSignOut={() => { logout(); navigate('/'); }} />
          ) : (
            <button onClick={() => navigate('/auth')}
              className="px-4 py-1.5 rounded-full text-xs font-black transition-all"
              style={{ background: `${GREEN}18`, border: `1px solid ${GREEN}44`, color: GREEN }}>
              Sign in
            </button>
          )}
        </header>

        {/* MOBILE TOP BAR */}
        <div className="flex items-center gap-2 px-3 md:hidden shrink-0 z-10"
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))', paddingBottom: '0.5rem', background: 'rgba(2, 8, 3, 0.94)', backdropFilter: 'blur(16px)', borderBottom: `1px solid ${GREEN}22` }}>
          <button onClick={() => setMobileSidebarOpen(true)} className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0"
            style={{ color: `${GREEN}bb` }}>
            <Menu className="w-4 h-4" />
          </button>
          <div className="flex-1 flex items-center justify-center gap-2">
            <div className="w-6 h-6 rounded-lg overflow-hidden shrink-0" style={{ border: `1px solid ${GREEN}55`, boxShadow: `0 0 8px ${GREEN}44` }}>
              <img src="/mockj-icon.png" alt="MockJ" className="w-full h-full object-cover object-top" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-black text-sm"
                style={{ fontFamily: 'Space Grotesk, sans-serif', background: `linear-gradient(135deg, ${GREEN}, hsl(142 70% 42%))`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                MockJ
              </span>
              <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: `${GREEN}77` }}>Your Digital Plug</span>
            </div>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: GREEN, boxShadow: `0 0 8px ${GREEN}` }} />
          </div>
          <button onClick={() => navigate('/tokens')}
            className="flex items-center gap-1 px-2 py-1 rounded-full shrink-0"
            style={{ border: `1px solid ${GREEN}44`, background: `${GREEN}10`, color: GREEN }}>
            <Coins className="w-3 h-3" />
            <span className="text-[10px] font-black">{wallet.loading ? '…' : wallet.balance.toLocaleString()}</span>
          </button>
          <NotificationBell />
        </div>

        {/* Content */}
        <div className="flex-1 flex min-w-0 overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden p-0 md:p-4 md:pr-0">
            <div className="flex-1 overflow-hidden flex flex-col rounded-none md:rounded-2xl pb-safe md:pb-0"
              style={{ background: 'rgba(2, 8, 3, 0.88)', backdropFilter: 'blur(20px)', border: `1px solid ${GREEN}25`, boxShadow: `0 0 50px ${GREEN}0c, inset 0 0 30px ${GREEN}06` }}>
              {tabMode === 'chat' && (
                <ChatWindow
                  messages={activeConv?.messages ?? []}
                  isTyping={isTyping}
                  mode={chatMode}
                  onModeChange={setChatMode}
                  onSend={(text, img) => handleSend(text, img)}
                  pendingPrompt={pendingPrompt}
                  onPendingPromptConsumed={() => setPendingPrompt(null)}
                  deepReasoning={deepReasoning}
                  onDeepReasoningChange={setDeepReasoning}
                  onOpenImageStudio={() => setTabMode('image-studio')}
                  onOpenPhotoRecreator={() => setShowPhotoRecreator(true)}
                  onOpenVoiceChat={() => setShowVoiceChat(true)}
                  onRefresh={handleRefresh}
                  onNewChat={() => handleNew('chat')}
                />
              )}
              {tabMode === 'image-studio' && <div className="flex-1 overflow-hidden h-full"><ImageGeneratorPanel /></div>}
              {tabMode === 'video-studio' && <div className="flex-1 overflow-hidden h-full"><VideoGeneratorPanel /></div>}
              {tabMode === 'community' && <CommunityBoard />}
              {tabMode === 'website-builder' && <div className="flex-1 overflow-hidden h-full"><WebsiteBuilderPanel /></div>}
              {tabMode === 'ide-builder' && <div className="flex-1 overflow-hidden h-full"><IDEBuilderPanel /></div>}
            </div>
          </div>

          {/* Right panel: AI Tools */}
          <div className="hidden lg:flex flex-col w-56 shrink-0 m-4 ml-2 rounded-2xl overflow-hidden"
            style={{ background: 'rgba(2, 8, 3, 0.92)', backdropFilter: 'blur(20px)', border: `1.5px solid ${GREEN}50`, boxShadow: `0 0 30px ${GREEN}18, inset 0 0 20px ${GREEN}06` }}>
            <div className="px-5 py-4 shrink-0" style={{ borderBottom: `1px solid ${GREEN}22` }}>
              <h3 className="text-sm font-black text-white"
                style={{ fontFamily: 'Space Grotesk, sans-serif', textShadow: `0 0 16px ${GREEN}66` }}>
                AI Tools
              </h3>
              <button onClick={() => navigate('/tokens')}
                className="mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
                style={{ background: wallet.balance < 50 ? `${RED}10` : `${GREEN}0c`, border: wallet.balance < 50 ? `1px solid ${RED}44` : `1px solid ${GREEN}30` }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = wallet.balance < 50 ? `0 0 16px ${RED}28` : `0 0 12px ${GREEN}22`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; }}>
                <Coins className="w-3.5 h-3.5 shrink-0" style={{ color: wallet.balance < 50 ? RED : GREEN }} />
                <span className="text-xs font-bold flex-1 text-left" style={{ color: wallet.balance < 50 ? RED : GREEN }}>
                  {wallet.loading ? 'Loading…' : `${wallet.balance.toLocaleString()} tokens`}
                </span>
                {wallet.balance < 50 && !wallet.loading && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full animate-pulse"
                    style={{ background: `${RED}22`, color: RED, border: `1px solid ${RED}44` }}>LOW</span>
                )}
              </button>
            </div>

            <div className="flex-1 p-3 flex flex-col gap-2 overflow-y-auto">
              {AI_TOOLS.map(({ label, prompt, action }, idx) => (
                <button key={label}
                  onClick={() => { if (action === 'image') { setTabMode('image-studio'); return; } if (prompt) { setTabMode('chat'); setPendingPrompt(prompt); } }}
                  className="tool-btn-animate relative overflow-hidden w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.97]"
                  style={{ background: 'rgba(3, 12, 5, 0.9)', border: `1px solid ${GREEN}18`, color: 'rgba(180,220,190,0.7)', animationDelay: `${idx * 60}ms` }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.border = `1px solid ${GREEN}55`; el.style.background = 'rgba(4, 16, 6, 0.95)'; el.style.color = '#fff'; el.style.boxShadow = `0 0 18px ${GREEN}22`; }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.border = `1px solid ${GREEN}18`; el.style.background = 'rgba(3, 12, 5, 0.9)'; el.style.color = 'rgba(180,220,190,0.7)'; el.style.boxShadow = 'none'; }}>
                  {label}
                </button>
              ))}
            </div>

            <div className="p-3" style={{ borderTop: `1px solid ${GREEN}20` }}>
              <button onClick={() => handleNew('chat')}
                className="relative overflow-hidden w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95 shine-sweep"
                style={{ background: `linear-gradient(135deg, ${GREEN}30, hsl(142 70% 28%)22)`, border: `1px solid ${GREEN}50`, color: GREEN, boxShadow: `0 0 16px ${GREEN}18` }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 28px ${GREEN}40`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 16px ${GREEN}18`; }}>
                + New Chat
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showLibrary      && <PromptLibrary onSelect={(p) => { setTabMode('chat'); setChatMode('chat'); setPendingPrompt(p); setShowLibrary(false); }} onClose={() => setShowLibrary(false)} />}
      {showPersonality  && <PersonalityPicker current={personality} onSelect={handlePersonalityChange} onClose={() => setShowPersonality(false)} />}
      {showPricing      && <PricingModal onClose={() => setShowPricing(false)} />}
      {showWelcomePro   && <WelcomeProModal onClose={() => setShowWelcomePro(false)} />}
      {showWallet       && <WalletPanel onClose={() => setShowWallet(false)} />}
      {showVoiceChat    && <VoiceChatPanel onClose={() => setShowVoiceChat(false)} onSendMessage={handleVoiceSend} lastAIResponse={lastAIResponse} />}
      {showPhotoRecreator && <PhotoRecreator onClose={() => setShowPhotoRecreator(false)} />}
      {lowTokensModal   && <LowTokensModal required={lowTokensModal.required} balance={lowTokensModal.balance} onClose={() => setLowTokensModal(null)} onOpenPricing={() => { setLowTokensModal(null); setShowPricing(true); }} />}
      <PWAInstallBanner />

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', background: 'rgba(2, 8, 3, 0.97)', backdropFilter: 'blur(20px)', borderTop: `1px solid ${GREEN}22` }}>
        {MOBILE_TABS.map(({ mode, icon: Icon, label }) => (
          <button key={mode}
            onClick={() => setTabMode(mode)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[9px] font-semibold transition-all duration-200 relative"
            style={{ minHeight: '52px', color: tabMode === mode ? GREEN : `${GREEN}55` }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200"
              style={{ background: tabMode === mode ? `${GREEN}18` : 'transparent', boxShadow: tabMode === mode ? `0 0 14px ${GREEN}35` : 'none' }}>
              <Icon className="w-4 h-4" />
            </div>
            <span className="leading-none">{label}</span>
            {tabMode === mode && (
              <span className="absolute top-0 inset-x-4 h-0.5 rounded-full" style={{ background: GREEN, boxShadow: `0 0 10px ${GREEN}` }} />
            )}
          </button>
        ))}

        {/* Profile / Sign-in tab */}
        {user ? (
          <button
            onClick={() => navigate('/account')}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[9px] font-semibold transition-all duration-200 relative"
            style={{ minHeight: '52px', color: `${GREEN}55` }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 relative"
              style={{ background: 'transparent' }}>
              {user.avatar ? (
                <img src={user.avatar} alt="avatar" className="w-7 h-7 rounded-full object-cover border" style={{ borderColor: `${GREEN}66` }} />
              ) : (
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black"
                  style={{ background: `linear-gradient(135deg, ${GREEN2}, ${GREEN})`, color: '#000' }}>
                  {(user.username?.[0] ?? user.email?.[0] ?? 'U').toUpperCase()}
                </div>
              )}
              {/* Sign-out dot indicator */}
            </div>
            <span className="leading-none">Profile</span>
          </button>
        ) : (
          <button
            onClick={() => navigate('/auth')}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[9px] font-semibold transition-all duration-200"
            style={{ minHeight: '52px', color: GREEN }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: `${GREEN}18`, border: `1px solid ${GREEN}44` }}>
              <User className="w-4 h-4" />
            </div>
            <span className="leading-none">Sign In</span>
          </button>
        )}
      </nav>


    </div>
  );
}
