import { useState, useEffect, useRef } from 'react';
import {
  Check, X, Crown, Zap, Flame, Loader2, RefreshCw,
  Settings, ChevronDown, ChevronUp, MessageSquare, Image, Video,
  Mic, Brain, Database, Shield, Award, Clock,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Analytics } from '@/lib/analytics';
import logoImg from '@/assets/mockj-logo.png';
import { useNavigate } from 'react-router-dom';

// All plans route through create-checkout edge function for live Stripe sessions

// ── Plan definitions ────────────────────────────────────────────────────────
export const PLANS = {
  pro: {
    id: 'pro' as const,
    name: 'Pro',
    price: '$50.99',
    period: '/mo',
    description: 'Full unrestricted access to every feature',
    accentHsl: '191 97% 55%',
    icon: Crown,
    badge: 'Most Popular',
    cta: 'Upgrade to Pro',
    features: [
      'Unlimited chat messages',
      'Unlimited image generations',
      'Unlimited video generations',
      'ElevenLabs voice output',
      'Full Project Memory & editing',
      'Commercial image license',
      'Advanced creator tools',
      'Priority AI models',
      'Priority support',
    ],
  },
  sale: {
    id: 'sale' as const,
    name: 'Intro',
    price: '$2.99',
    period: '/mo',
    description: 'Limited-time flash pricing — full Pro access',
    accentHsl: '4 90% 58%',
    icon: Flame,
    badge: '🔥 Flash Deal',
    cta: 'Upgrade to Intro',
    features: [
      'Everything in Pro',
      'Limited-time flash pricing',
      'Perfect to try full feature set',
      'Cancel anytime',
    ],
  },
};

// ── Feature comparison rows ─────────────────────────────────────────────────
const COMPARE_ROWS: {
  icon: typeof MessageSquare;
  label: string;
  free: string | boolean;
  pro: string | boolean;
  intro: string | boolean;
}[] = [
  { icon: MessageSquare, label: 'Chat messages',        free: '10 / day',    pro: 'Unlimited',   intro: 'Unlimited'  },
  { icon: Image,         label: 'Image generations',    free: '3 / day',     pro: 'Unlimited',   intro: 'Unlimited'  },
  { icon: Video,         label: 'Video generations',    free: '1 / day',     pro: 'Unlimited',   intro: 'Unlimited'  },
  { icon: Mic,           label: 'Voice input (STT)',    free: true,          pro: true,          intro: true         },
  { icon: Mic,           label: 'ElevenLabs TTS',       free: false,         pro: true,          intro: true         },
  { icon: Brain,         label: 'Deep Reasoning',       free: false,         pro: true,          intro: true         },
  { icon: Database,      label: 'Project Brain sync',   free: 'Read-only',   pro: 'Full CRUD',   intro: 'Full CRUD'  },
  { icon: Award,         label: 'Commercial license',   free: false,         pro: true,          intro: true         },
  { icon: Shield,        label: 'Priority AI models',   free: false,         pro: true,          intro: true         },
  { icon: Clock,         label: 'Response speed',       free: 'Standard',    pro: 'Priority',    intro: 'Priority'   },
];

// ── FAQ entries ─────────────────────────────────────────────────────────────
const FAQS: { q: string; a: string }[] = [
  {
    q: 'What is the difference between Pro and Intro?',
    a: 'Both plans unlock the exact same features — unlimited chat, images, videos, ElevenLabs voice, Deep Reasoning, Project Brain, and commercial license. The only difference is price: Pro is $50.99/mo while Intro is a limited-time flash deal at $2.99/mo.',
  },
  {
    q: 'How does the 3-day free trial work?',
    a: "Start your Pro or Intro plan with zero payment upfront — no credit card required. You get full access for 3 days completely free. After the trial ends, add a payment method to continue. If you don't add one, the subscription automatically cancels at no charge to you.",
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. You can cancel your subscription at any time from the Manage Plan portal (powered by Stripe). Your access remains active until the end of the billing period — no prorating, no hidden fees.',
  },
  {
    q: 'What happens when I hit the free limits?',
    a: 'Free users get 10 chat messages, 3 image generations, and 1 video per day. When you reach a limit you\'ll see an upgrade prompt. Your limits reset at midnight UTC every day.',
  },
  {
    q: 'Is my payment secure?',
    a: 'All payments are processed securely by Stripe — one of the world\'s most trusted payment platforms. MockJ never stores your card details. Your data is encrypted end-to-end.',
  },
  {
    q: 'How quickly does my subscription activate?',
    a: 'Instantly. Once your Stripe payment succeeds, a webhook syncs your subscription status to MockJ in real time. Your Pro features unlock the moment the payment clears — usually within seconds.',
  },
  {
    q: 'What is the ElevenLabs voice output?',
    a: 'Pro and Intro subscribers get access to Auto-Speak: MockJ will read its responses aloud using a high-quality ElevenLabs AI voice. You can toggle this on/off from the sidebar, and adjust volume with the slider.',
  },
  {
    q: 'What is Project Brain / Knowledge Base?',
    a: 'Project Brain is MockJ\'s persistent memory system. You can store context, project notes, and facts that MockJ uses across all conversations. Free users get read-only access to the default knowledge base. Pro/Intro users can create, edit, and sync custom entries to the cloud.',
  },
  {
    q: 'Does the commercial license cover AI-generated images?',
    a: 'Yes. Pro and Intro subscribers receive a commercial use license for all images generated through MockJ AI Studio. You can use them in products, marketing, or client work without additional fees.',
  },
];

interface PricingModalProps {
  onClose?: () => void;
  fullPage?: boolean;
}

export default function PricingModal({ onClose, fullPage = false }: PricingModalProps) {
  const { user, subscription, refreshSubscription } = useAuth();
  const navigate = useNavigate();
  const [checkingOut, setCheckingOut] = useState<'pro' | 'sale' | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  // Track upgrade modal view
  useEffect(() => { Analytics.upgradeViewed(); }, []);

  // Handle ?checkout=success fallback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      refreshSubscription().then(() => {
        window.dispatchEvent(new CustomEvent('mockj:checkout-success'));
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Auto-poll on tab focus after checkout redirect
  useEffect(() => {
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 5;

    const poll = async () => {
      if (!user) return;
      await refreshSubscription();
      attempts++;
      if (attempts < MAX_ATTEMPTS) pollTimer = setTimeout(poll, 3000);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && user && !subscription.subscribed) {
        attempts = 0;
        if (pollTimer) clearTimeout(pollTimer);
        pollTimer = setTimeout(poll, 1500);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [user, subscription.subscribed, refreshSubscription]);

  // Fire welcome event when subscription activates
  const prevSubscribed = useRef(subscription.subscribed);
  useEffect(() => {
    if (!prevSubscribed.current && subscription.subscribed) {
      window.dispatchEvent(new CustomEvent('mockj:checkout-success'));
    }
    prevSubscribed.current = subscription.subscribed;
  }, [subscription.subscribed]);

  const handleCheckout = async (plan: 'pro' | 'sale') => {
    if (!user) {
      toast.error('Please sign in first to subscribe');
      onClose?.();
      navigate('/auth');
      return;
    }
    Analytics.checkoutStarted(plan);

    setCheckingOut(plan);
    const tab = window.open('about:blank', '_blank');
    const { data, error } = await supabase.functions.invoke('create-checkout', {
      body: { plan },
    });
    if (error || !data?.url) {
      tab?.close();
      toast.error(error?.message ?? 'Failed to start checkout. Please try again.');
      setCheckingOut(null);
      return;
    }
    if (tab) tab.location.href = data.url;
    else window.open(data.url, '_blank');
    setCheckingOut(null);
  };

  const handlePortal = async () => {
    setLoadingPortal(true);
    const tab = window.open('about:blank', '_blank');
    const { data, error } = await supabase.functions.invoke('customer-portal');
    if (error || !data?.url) {
      tab?.close();
      toast.error(error?.message ?? 'Failed to open billing portal.');
      setLoadingPortal(false);
      return;
    }
    if (tab) tab.location.href = data.url;
    else window.open(data.url, '_blank');
    setLoadingPortal(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshSubscription();
    toast.success('Subscription status refreshed');
    setRefreshing(false);
  };

  const wrapper = fullPage
    ? 'min-h-screen bg-background flex items-start justify-center px-4 py-12 overflow-y-auto'
    : 'fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto';

  // 5-layer shadow diffusion + specular edge highlight (physics-first depth)
  const glassStyle: React.CSSProperties = {
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    background: 'hsl(224 20% 7% / 0.94)',
    boxShadow:
      '0 40px 80px -20px rgba(0,0,0,0.65),' +
      '0 20px 40px -10px rgba(0,0,0,0.50),' +
      '0 8px 16px -4px rgba(0,0,0,0.35),' +
      '0 2px 4px -1px rgba(0,0,0,0.25),' +
      'inset 0 1px 0 0 rgba(255,255,255,0.10),' +  /* specular top edge */
      'inset 1px 0 0 0 rgba(255,255,255,0.04),' +  /* specular left edge */
      'inset -1px 0 0 0 rgba(0,0,0,0.15)',
    border: '1px solid rgba(255,255,255,0.10)',
  };

  // CSS noise grain — makes colors feel organic, not flat-rendered
  const grainStyle: React.CSSProperties = {
    backgroundImage:
      'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.028) 1px, transparent 0),' +
      'radial-gradient(circle at 80% 80%, rgba(255,255,255,0.028) 1px, transparent 0)',
    backgroundSize: '4px 4px',
    pointerEvents: 'none',
  };

  const renderCheck = (val: string | boolean, accent: string) => {
    if (val === false) return <X className="w-3.5 h-3.5 text-muted-foreground/40 mx-auto" />;
    if (val === true) return <Check className="w-3.5 h-3.5 mx-auto" style={{ color: `hsl(${accent})` }} />;
    return <span className="text-[10px] font-semibold text-center block" style={{ color: `hsl(${accent})` }}>{val}</span>;
  };

  return (
    <div className={wrapper} onClick={!fullPage ? onClose : undefined}>

      {/* Spring-physics keyframes + micro-interaction classes — injected once */}
      <style>{`
        @keyframes mockj-spring-pop {
          0%   { transform: scale(0.70) translateY(36px); opacity: 0; }
          40%  { transform: scale(1.06) translateY(-6px); opacity: 1; }
          62%  { transform: scale(0.97) translateY(3px); }
          80%  { transform: scale(1.01) translateY(-1px); }
          100% { transform: scale(1)    translateY(0px); }
        }
        .mockj-spring-enter { animation: mockj-spring-pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        .mockj-cta {
          transition: transform 180ms cubic-bezier(0.4,0,0.2,1),
                      box-shadow 180ms cubic-bezier(0.4,0,0.2,1);
        }
        .mockj-cta:hover:not(:disabled) { transform: translateY(-1px) scale(1.01); }
        .mockj-cta:active:not(:disabled) {
          transform: scale(0.96) translateY(1px) !important;
          box-shadow: none !important;
        }
        .mockj-cta-subtle {
          transition: transform 160ms cubic-bezier(0.4,0,0.2,1), opacity 160ms;
        }
        .mockj-cta-subtle:active:not(:disabled) { transform: scale(0.97); }
      `}</style>

      <div
        className={cn(
          'w-full max-w-2xl my-4 relative overflow-hidden',
          !fullPage && 'rounded-2xl mockj-spring-enter'
        )}
        style={!fullPage ? glassStyle : undefined}
        onClick={e => e.stopPropagation()}
      >
        {/* Grain overlay — tactile noise at 3% opacity */}
        {!fullPage && (
          <div className="absolute inset-0 z-0 rounded-2xl" style={grainStyle} />
        )}

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="relative z-10 flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg overflow-hidden ring-1 ring-[hsl(4_90%_58%_/_0.4)]">
              <img src={logoImg} alt="MockJ" className="w-full h-full object-cover" />
            </div>
            <div>
              <h2 className="font-bold text-base leading-none" style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#F5F5F5' }}>
                3-Day Free Trial. No Card Needed.
              </h2>
              <p className="text-[10px] mt-0.5" style={{ color: 'hsl(142 70% 55%)' }}>🎉 Cancel anytime · Auto-cancels if no payment added after trial</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleRefresh} className="w-7 h-7 rounded-lg flex items-center justify-center border border-white/[0.08] text-muted-foreground hover:text-foreground transition-all mockj-cta-subtle" title="Refresh subscription">
              <RefreshCw className={cn('w-3 h-3', refreshing && 'animate-spin')} />
            </button>
            {!fullPage && onClose && (
              <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center border border-white/[0.08] text-muted-foreground hover:text-foreground transition-all mockj-cta-subtle">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ── Active subscription banner ────────────────────────────────────── */}
        {subscription.subscribed && (
          <div className="relative z-10 mx-5 mt-4 p-3.5 rounded-xl bg-[hsl(191_97%_55%_/_0.08)] border border-[hsl(191_97%_55%_/_0.3)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Crown className="w-3.5 h-3.5 text-[hsl(191_97%_55%)]" />
                  <span className="text-xs font-semibold text-[hsl(191_97%_55%)]">
                    Active: MockJ {subscription.tier === 'sale' ? 'Intro' : 'Pro'}
                  </span>
                </div>
                {subscription.subscriptionEnd && (
                  <p className="text-[10px] text-muted-foreground">
                    Renews {new Date(subscription.subscriptionEnd).toLocaleDateString()}
                  </p>
                )}
              </div>
              <button
                onClick={handlePortal}
                disabled={loadingPortal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[hsl(191_97%_55%_/_0.4)] text-[hsl(191_97%_55%)] text-xs font-medium hover:bg-[hsl(191_97%_55%_/_0.1)] transition-all disabled:opacity-60 mockj-cta-subtle"
              >
                {loadingPortal ? <Loader2 className="w-3 h-3 animate-spin" /> : <Settings className="w-3 h-3" />}
                Manage
              </button>
            </div>
          </div>
        )}

        {/* ── 3-Column Plan Cards ───────────────────────────────────────────── */}
        <div className="relative z-10 p-5 grid grid-cols-1 sm:grid-cols-3 gap-3">

          {/* FREE CARD */}
          <div
            className="relative rounded-2xl border border-white/[0.07] p-4 flex flex-col gap-3"
            style={{ background: 'hsl(224 15% 9% / 0.7)' }}
          >
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Free</p>
              <div className="flex items-baseline gap-0.5">
                <span className="text-2xl font-black" style={{ color: '#F5F5F5' }}>$0</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">No credit card needed</p>
            </div>
            <ul className="space-y-1.5 flex-1">
              {[
                '10 chat messages / day',
                '3 image generations / day',
                '1 video / day',
                'Basic voice input',
                'Project Brain (read-only)',
                'Community support',
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                  <Check className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground/60" />
                  {f}
                </li>
              ))}
            </ul>
            {!user ? (
              <button
                onClick={() => { onClose?.(); navigate('/auth'); }}
                className="w-full py-2.5 rounded-xl text-xs font-bold border border-white/[0.09] text-muted-foreground hover:text-foreground hover:border-white/[0.18] transition-all mockj-cta-subtle"
              >
                Get Started Free
              </button>
            ) : !subscription.subscribed ? (
              <div className="w-full py-2.5 rounded-xl text-xs font-bold border border-[hsl(142_70%_55%_/_0.4)] text-[hsl(142_70%_55%)] bg-[hsl(142_70%_55%_/_0.06)] text-center">
                ✓ Current Plan
              </div>
            ) : (
              <div className="w-full py-2.5 rounded-xl text-xs font-bold border border-white/[0.06] text-muted-foreground/50 text-center cursor-default">
                Free Tier
              </div>
            )}
          </div>

          {/* PRO + INTRO CARDS */}
          {(Object.values(PLANS) as typeof PLANS[keyof typeof PLANS][]).map(plan => {
            const Icon = plan.icon;
            const accent = plan.accentHsl;
            const isActive = subscription.subscribed && subscription.tier === plan.id;
            const isLoading = checkingOut === plan.id;
            const isPro = plan.id === 'pro';

            return (
              <div
                key={plan.id}
                className="relative rounded-2xl border p-4 flex flex-col gap-3 transition-all duration-300"
                style={{
                  borderColor: `hsl(${accent} / ${isActive ? '0.55' : '0.22'})`,
                  background: `hsl(${accent} / 0.06)`,
                  boxShadow: isActive || isPro
                    ? `0 0 32px hsl(${accent} / 0.14), inset 0 1px 0 rgba(255,255,255,0.08)`
                    : 'inset 0 1px 0 rgba(255,255,255,0.05)',
                }}
              >
                {/* Badge */}
                {plan.badge && (
                  <div
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide whitespace-nowrap"
                    style={{
                      backgroundColor: `hsl(${accent})`,
                      color: '#0A0A0A',
                      boxShadow: `0 2px 8px hsl(${accent} / 0.4)`,
                    }}
                  >
                    {plan.badge}
                  </div>
                )}
                {isActive && (
                  <div
                    className="absolute -top-2.5 right-3 px-2.5 py-0.5 rounded-full text-[9px] font-black"
                    style={{ backgroundColor: `hsl(${accent})`, color: '#0A0A0A' }}
                  >
                    Active ✓
                  </div>
                )}

                {/* Header */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className="w-3.5 h-3.5" style={{ color: `hsl(${accent})` }} />
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: `hsl(${accent})` }}>
                      {plan.name}
                    </p>
                  </div>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-2xl font-black" style={{ color: '#F5F5F5' }}>{plan.price}</span>
                    <span className="text-[10px] text-muted-foreground">{plan.period}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{plan.description}</p>
                  {!isActive && (
                    <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-lg" style={{ background: 'hsl(142 70% 55% / 0.08)', border: '1px solid hsl(142 70% 55% / 0.3)' }}>
                      <span className="text-[10px] font-black" style={{ color: 'hsl(142 70% 65%)' }}>🎉 3-day FREE trial — no credit card required</span>
                    </div>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-1.5 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                      <Check className="w-3 h-3 shrink-0 mt-0.5" style={{ color: `hsl(${accent})` }} />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isActive ? (
                  <button
                    onClick={handlePortal}
                    disabled={loadingPortal}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border transition-all disabled:opacity-60 mockj-cta-subtle"
                    style={{ borderColor: `hsl(${accent} / 0.4)`, color: `hsl(${accent})`, backgroundColor: `hsl(${accent} / 0.08)` }}
                  >
                    {loadingPortal ? <Loader2 className="w-3 h-3 animate-spin" /> : <Settings className="w-3 h-3" />}
                    Manage Plan
                  </button>
                ) : (
                  <button
                    onClick={() => handleCheckout(plan.id)}
                    disabled={!!checkingOut || (subscription.subscribed && !isActive)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black disabled:opacity-40 disabled:cursor-not-allowed mockj-cta"
                    style={{
                      background: `hsl(${accent})`,
                      color: '#0A0A0A',
                      boxShadow: `0 4px 20px hsl(${accent} / 0.45), 0 0 1px hsl(${accent} / 0.7), inset 0 1px 0 rgba(255,255,255,0.2)`,
                    }}
                  >
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5" />
                        Start Free Trial
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Feature Comparison Table ──────────────────────────────────────── */}
        <div className="relative z-10 px-5 pb-2">
          <button
            onClick={() => setShowCompare(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/[0.07] text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-white/[0.14] transition-all mockj-cta-subtle"
          >
            <span>Compare all features</span>
            {showCompare ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showCompare && (
            <div className="mt-3 rounded-xl border border-white/[0.07] overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-4 bg-[hsl(224_15%_10%_/_0.8)] px-4 py-2.5">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Feature</div>
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center">Free</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-center" style={{ color: 'hsl(191 97% 55%)' }}>Pro</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-center" style={{ color: 'hsl(4 90% 58%)' }}>Intro</div>
              </div>
              {COMPARE_ROWS.map((row, i) => {
                const Icon = row.icon;
                return (
                  <div
                    key={row.label}
                    className={cn('grid grid-cols-4 px-4 py-2.5 items-center', i % 2 === 0 ? 'bg-[hsl(224_15%_8%_/_0.6)]' : 'bg-[hsl(224_15%_9%_/_0.6)]')}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                      <span className="text-[11px] text-muted-foreground">{row.label}</span>
                    </div>
                    <div className="text-center">{renderCheck(row.free, '210 20% 55%')}</div>
                    <div className="text-center">{renderCheck(row.pro, '191 97% 55%')}</div>
                    <div className="text-center">{renderCheck(row.intro, '4 90% 58%')}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── FAQ ─────────────────────────────────────────────────────────────── */}
        <div className="relative z-10 px-5 pb-5 pt-3">
          <p className="text-xs font-bold mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#F5F5F5' }}>
            Frequently Asked Questions
          </p>
          <div className="space-y-2">
            {FAQS.map((faq, i) => {
              const isOpen = openFaq === i;
              return (
                <div
                  key={i}
                  className={cn(
                    'rounded-xl border transition-all duration-200 overflow-hidden',
                    isOpen
                      ? 'border-[hsl(4_90%_58%_/_0.3)] bg-[hsl(4_90%_58%_/_0.04)]'
                      : 'border-white/[0.06] bg-[hsl(224_15%_8%_/_0.5)]'
                  )}
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left mockj-cta-subtle"
                  >
                    <span className={cn('text-xs font-semibold leading-snug pr-3', isOpen ? 'text-foreground' : 'text-muted-foreground')}>
                      {faq.q}
                    </span>
                    {isOpen
                      ? <ChevronUp className="w-3.5 h-3.5 text-[hsl(4_90%_58%)] shrink-0" />
                      : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4">
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{faq.a}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div className="relative z-10 px-5 pb-5 flex flex-col items-center gap-1">
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground/50">
            <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Secured by Stripe</span>
            <span>·</span>
            <span>Cancel anytime</span>
            <span>·</span>
            <span>No hidden fees</span>
          </div>
        </div>
      </div>
    </div>
  );
}
