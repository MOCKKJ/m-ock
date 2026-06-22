/**
 * /success — Stripe post-checkout landing page.
 * Shows exact purchase details (pack name, tokens, price), animated counter,
 * "Start Chatting" CTA, and auto-redirects after 8s.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Crown, Zap, ArrowRight, Sparkles, Check, MessageSquare, Coins, Building2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

// ── Brand colors ─────────────────────────────────────────────────────────────
const GREEN  = 'hsl(142 70% 55%)';
const GREEN2 = 'hsl(142 70% 28%)';
const RED    = 'hsl(4 90% 58%)';
const GOLD   = 'hsl(38 95% 60%)';
const VIOLET = 'hsl(265 80% 65%)';

// ── Confetti burst ────────────────────────────────────────────────────────────
type ConfettiFn = (opts: Record<string, unknown>) => void;
function loadConfettiScript(): Promise<ConfettiFn> {
  type ConfettiWindow = Window & { confetti?: ConfettiFn };
  const w = window as ConfettiWindow;
  if (w.confetti) return Promise.resolve(w.confetti);
  return new Promise<ConfettiFn>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js';
    s.onload = () => {
      const fn = (window as ConfettiWindow).confetti;
      fn ? resolve(fn) : reject(new Error('confetti unavailable'));
    };
    s.onerror = () => reject(new Error('confetti load failed'));
    document.head.appendChild(s);
  });
}
async function fireConfetti() {
  try {
    const confetti = await loadConfettiScript();
    const COLORS = [GREEN, GREEN2, RED, GOLD, '#39ff14', '#ff4444', '#ffd700', '#ffffff'];
    confetti({ particleCount: 130, spread: 80,  origin: { x: 0.5, y: 0.55 }, colors: COLORS, gravity: 0.9, scalar: 1.1 });
    setTimeout(() => confetti({ particleCount: 70, angle: 60,  spread: 55, origin: { x: 0, y: 0.65 }, colors: COLORS }), 220);
    setTimeout(() => confetti({ particleCount: 70, angle: 120, spread: 55, origin: { x: 1, y: 0.65 }, colors: COLORS }), 380);
    setTimeout(() => confetti({ particleCount: 90, spread: 100, origin: { x: 0.5, y: 0.5 }, colors: COLORS, gravity: 0.7, scalar: 0.9 }), 650);
  } catch { /* cosmetic only */ }
}

// ── Count-up animation ────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1800, startDelay = 600) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) return;
    let frame: number;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start - startDelay;
      if (elapsed < 0) { frame = requestAnimationFrame(animate); return; }
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, startDelay]);
  return value;
}

// ── Package registry — maps packageId → display info ─────────────────────────
const PACKAGE_INFO: Record<string, {
  tokens: number; builderCredits?: number; label: string; emoji: string; price?: string; isSubscription?: boolean;
}> = {
  // Legacy
  starter:      { tokens: 500,   label: 'Starter Pack',        emoji: '🚀', price: '$4.99'     },
  creator:      { tokens: 1500,  label: 'Creator Pack',         emoji: '⭐', price: '$9.99'     },
  pro_pack:     { tokens: 5000,  label: 'Pro Pack',             emoji: '🔥', price: '$29.99'    },
  // Live token packs
  'tokens-100':  { tokens: 100,  label: '100 Tokens',           emoji: '⚡', price: '$1.99'     },
  'tokens-550':  { tokens: 550,  label: '550 Tokens',           emoji: '🔥', price: '$7.99'     },
  'tokens-1150': { tokens: 1150, label: '1,150 Tokens',         emoji: '💯', price: '$14.99'    },
  'tokens-6000': { tokens: 6000, label: '6,000 Tokens',         emoji: '👑', price: '$59.99'    },
  // Builder credit packs
  'builder-5k':  { tokens: 0, builderCredits: 5000,  label: '5K Builder Credits',  emoji: '🏗️', price: '$4.99'  },
  'builder-15k': { tokens: 0, builderCredits: 15000, label: '15K Builder Credits', emoji: '🔥', price: '$12.99' },
  'builder-50k': { tokens: 0, builderCredits: 50000, label: '50K Builder Credits', emoji: '💎', price: '$39.99' },
  // Subscriptions
  'pro-monthly':   { tokens: 2000, label: 'MockJ Pro',   emoji: '⚡', price: '$59.99/mo', isSubscription: true },
  'elite-monthly': { tokens: 6000, label: 'MockJ Elite', emoji: '👑', price: '$99.99/mo', isSubscription: true },
};

const BADGE_LABELS: Record<string, string> = {
  creator:     '⭐ Creator',
  pro_creator: '🔥 Pro Creator',
  elite:       '👑 Elite',
  titan:       '💎 Titan',
};

const SUB_TIERS: Record<string, { label: string; emoji: string; price?: string }> = {
  sale:      { label: 'MockJ Intro',     emoji: '🎉', price: '$2.99/mo'  },
  pro:       { label: 'MockJ Pro',       emoji: '⚡', price: '$59.99/mo' },
  starter:   { label: 'MockJ Pro',       emoji: '⚡', price: '$59.99/mo' },
  elite:     { label: 'MockJ Elite',     emoji: '👑', price: '$99.99/mo' },
  plus:      { label: 'MockJ Plus',      emoji: '✨', price: '$14.99/mo' },
  unlimited: { label: 'MockJ Unlimited', emoji: '♾️', price: '$79.99/mo' },
};

// ── CSS keyframes injection ───────────────────────────────────────────────────
const CSS = `
@keyframes successPop {
  0%   { transform: scale(0.3) translateY(40px); opacity: 0; }
  65%  { transform: scale(1.06) translateY(-6px); opacity: 1; }
  85%  { transform: scale(0.97); }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
.success-pop   { animation: successPop 0.7s cubic-bezier(0.34,1.56,0.64,1) both; }
.fade-slide-up { animation: fadeSlideUp 0.5s ease-out both; }
`;

export default function SuccessPage() {
  const { refreshSubscription, subscription } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ── State ──────────────────────────────────────────────────────────────────
  const [pkgId, setPkgId] = useState<string | null>(null);
  const [tokensToShow, setTokensToShow] = useState(0);
  const [builderCreditsAwarded, setBuilderCreditsAwarded] = useState(0);
  const [badgeEarned, setBadgeEarned] = useState<string | null>(null);
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const [phase, setPhase] = useState<'loading' | 'celebrate'>('loading');
  const [secondsLeft, setSecondsLeft] = useState(8);

  // Exact purchase details
  const [purchaseName, setPurchaseName] = useState<string | null>(null);
  const [purchaseEmoji, setPurchaseEmoji] = useState<string>('🎉');
  const [purchasePrice, setPurchasePrice] = useState<string | null>(null);
  const [purchaseTokens, setPurchaseTokens] = useState<number>(0);

  const confettiFiredRef = useRef(false);
  const cancelledRef = useRef(false);
  const toastFiredRef = useRef(false);

  // ── Fetch wallet + purchase data ───────────────────────────────────────────
  const fetchWalletData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Live token balance
      const { data: tokRow } = await supabase
        .from('user_tokens')
        .select('balance')
        .eq('user_id', session.user.id)
        .single();
      if (tokRow?.balance !== undefined) setLiveBalance(tokRow.balance);

      // Most recent token purchase
      const { data: recentTx } = await supabase
        .from('token_transactions')
        .select('amount, type, description, meta, created_at')
        .eq('user_id', session.user.id)
        .eq('type', 'purchase')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const txWithin10m = recentTx &&
        (Date.now() - new Date(recentTx.created_at).getTime()) < 10 * 60 * 1000;

      // Most recent builder credit purchase
      const { data: recentBuilder } = await supabase
        .from('builder_credit_ledger')
        .select('amount, reason, created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const builderWithin10m = recentBuilder &&
        (Date.now() - new Date(recentBuilder.created_at).getTime()) < 10 * 60 * 1000 &&
        recentBuilder.amount > 0;

      if (txWithin10m && recentTx) {
        const credited = recentTx.amount ?? 0;
        // Try metadata first, then URL param
        const pid = String(recentTx.meta?.packageId ?? searchParams.get('pkg') ?? '');
        if (pid) setPkgId(pid);
        const info = pid ? PACKAGE_INFO[pid] : null;
        const displayTokens = info?.tokens || credited;

        setTokensToShow(displayTokens);
        setPurchaseTokens(displayTokens);

        if (info) {
          setPurchaseName(info.label);
          setPurchaseEmoji(info.emoji);
          setPurchasePrice(info.price ?? null);
        }

        if (!toastFiredRef.current && credited > 0 && tokRow?.balance !== undefined) {
          toastFiredRef.current = true;
          const label = info?.label ?? `${credited.toLocaleString()} tokens`;
          toast.success(
            `✅ ${label} — ${credited.toLocaleString()} tokens added · Balance: ${tokRow.balance.toLocaleString()}`,
            { duration: 9000, id: 'token-credit-confirm' }
          );
        }

        // Badge detection (best-effort)
        try {
          const { data: walletData } = await supabase.functions.invoke('token-ops', {
            body: { action: 'balance' },
            headers: { 'Authorization': `Bearer ${session.access_token}` },
          });
          if (walletData) {
            const badges: string[] = walletData.badges ?? [];
            if (pid && PACKAGE_INFO[pid]) {
              const badgeKey = (pid === 'pro_pack' ? 'pro_creator' : pid === 'creator' ? 'creator' : null);
              if (badgeKey && badges.includes(badgeKey)) setBadgeEarned(badgeKey);
            }
          }
        } catch { /* non-fatal */ }

      } else if (builderWithin10m && recentBuilder) {
        // Builder credit purchase — no token tx
        setBuilderCreditsAwarded(recentBuilder.amount);
        const bPkgId = recentBuilder.amount >= 50000 ? 'builder-50k'
          : recentBuilder.amount >= 15000 ? 'builder-15k'
          : 'builder-5k';
        const bInfo = PACKAGE_INFO[bPkgId];
        setPurchaseName(bInfo.label);
        setPurchaseEmoji(bInfo.emoji);
        setPurchasePrice(bInfo.price ?? null);
      }
    } catch { /* non-fatal */ }
  }, [searchParams]);

  // ── Poll until celebrate phase ─────────────────────────────────────────────
  useEffect(() => {
    cancelledRef.current = false;
    let attempt = 0;
    const MAX = 8;

    const poll = async () => {
      if (cancelledRef.current) return;
      attempt++;
      try { await refreshSubscription(); } catch { /* non-fatal */ }
      await fetchWalletData();

      if (attempt >= 3) {
        if (!cancelledRef.current) {
          window.dispatchEvent(new CustomEvent('mockj:checkout-success'));
          setPhase('celebrate');
          if (!confettiFiredRef.current) {
            confettiFiredRef.current = true;
            setTimeout(fireConfetti, 300);
          }
        }
        return;
      }
      if (attempt < MAX) setTimeout(poll, 2000);
    };

    const boot = setTimeout(poll, 900);
    return () => { cancelledRef.current = true; clearTimeout(boot); };
  }, [refreshSubscription, fetchWalletData]);

  // ── Countdown + auto-redirect ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'celebrate') return;
    const id = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) { clearInterval(id); navigate('/', { replace: true }); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, navigate]);

  // ── Count-up animations ────────────────────────────────────────────────────
  const animatedTokens  = useCountUp(tokensToShow, 2000, 400);
  const animatedBuilder = useCountUp(builderCreditsAwarded, 1800, 500);
  const animatedBalance = useCountUp(liveBalance ?? 0, 1600, 900);

  // ── Derive display info ────────────────────────────────────────────────────
  const pkgInfo        = pkgId ? PACKAGE_INFO[pkgId] : null;
  const isSubscription = subscription.subscribed && !pkgInfo;
  const subInfo        = SUB_TIERS[subscription.tier] ?? SUB_TIERS.pro;
  const isBuilderOnly  = builderCreditsAwarded > 0 && tokensToShow === 0;
  const displayName    = purchaseName ?? (isSubscription ? subInfo.label : pkgInfo?.label ?? 'Your Purchase');
  const displayEmoji   = purchaseEmoji ?? (isSubscription ? subInfo.emoji : pkgInfo?.emoji ?? '🎉');
  const displayPrice   = purchasePrice ?? (isSubscription ? subInfo.price : null);

  // CSS injection
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ background: '#04030f' }}
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 30%, ${GREEN}12 0%, transparent 55%),
                       radial-gradient(ellipse at 20% 80%, ${RED}08 0%, transparent 50%),
                       radial-gradient(ellipse at 80% 70%, ${GOLD}07 0%, transparent 50%)`,
        }}
      />

      <div className="relative z-10 flex flex-col items-center text-center max-w-sm w-full gap-0">

        {/* ── LOADING ────────────────────────────────────────────────────────── */}
        {phase === 'loading' && (
          <div className="flex flex-col items-center gap-6">
            <div className="relative" style={{ width: 96, height: 96 }}>
              <div
                className="absolute inset-0 rounded-2xl animate-spin"
                style={{ background: `conic-gradient(from 0deg, ${GREEN}, ${GREEN2}, ${RED}, ${GREEN2}, ${GREEN})`, borderRadius: '18px' }}
              />
              <div className="absolute inset-[3px] rounded-2xl overflow-hidden" style={{ border: `1px solid ${GREEN}44` }}>
                <img src="/mockj-icon.png" alt="MockJ" className="w-full h-full object-cover object-top" />
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: GREEN }}>Processing payment…</p>
              <h1 className="text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Confirming with Stripe</h1>
              <p className="text-sm mt-2" style={{ color: 'rgba(160,180,220,0.55)' }}>Crediting tokens and activating your plan…</p>
            </div>
            <div className="flex gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2.5 h-2.5 rounded-full" style={{ background: GREEN, animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
            </div>
          </div>
        )}

        {/* ── CELEBRATE ──────────────────────────────────────────────────────── */}
        {phase === 'celebrate' && (
          <>
            {/* Mascot */}
            <div className="relative mb-5 success-pop">
              <div
                className="absolute inset-[-3px] rounded-3xl"
                style={{ background: `conic-gradient(from 0deg, ${GREEN}, ${GREEN2}, ${RED}, ${GOLD}, ${GREEN2}, ${GREEN})`, borderRadius: '22px', animation: 'spin 3.5s linear infinite' }}
              />
              <div
                className="relative w-28 h-28 rounded-3xl overflow-hidden"
                style={{ border: `2px solid ${GREEN}88`, boxShadow: `0 0 30px ${GREEN}55, 0 0 60px ${GREEN}22`, margin: '3px' }}
              >
                <img src="/mockj-icon.png" alt="MockJ" className="w-full h-full object-cover object-top" />
              </div>
              <div
                className="absolute -top-3 -right-3 w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
                style={{ background: `linear-gradient(135deg, ${GOLD}, hsl(38 95% 45%))`, border: `2px solid ${GOLD}77` }}
              >
                <Crown className="w-5 h-5" style={{ color: '#000' }} />
              </div>
            </div>

            {/* Headline */}
            <div className="fade-slide-up mb-4 w-full" style={{ animationDelay: '0.05s' }}>
              <div className="flex items-center justify-center gap-2 mb-2">
                <Sparkles className="w-4 h-4" style={{ color: GOLD }} />
                <span className="text-xs font-black uppercase tracking-widest" style={{ color: GREEN }}>Payment confirmed 🔥</span>
                <Sparkles className="w-4 h-4" style={{ color: GOLD }} />
              </div>
              <h1 className="text-3xl font-black text-white leading-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                {displayEmoji} <span style={{ color: GREEN }}>{displayName}</span>
              </h1>
              {displayPrice && (
                <div
                  className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-black"
                  style={{ background: `${GOLD}18`, border: `1px solid ${GOLD}44`, color: GOLD }}
                >
                  <Check className="w-3 h-3" />
                  {displayPrice} · Payment confirmed
                </div>
              )}
              <p className="text-[10px] font-black uppercase tracking-widest mt-2" style={{ color: `${GREEN}55` }}>
                MLTX · Built Different. Wired for Greatness. 🔥
              </p>
            </div>

            {/* ── Token counter ──────────────────────────────────────────────── */}
            {tokensToShow > 0 && (
              <div className="w-full mb-4 fade-slide-up" style={{ animationDelay: '0.15s' }}>
                <div
                  className="rounded-3xl border p-5 relative overflow-hidden"
                  style={{ background: `${GREEN}07`, borderColor: `${GREEN}44`, boxShadow: `0 0 40px ${GREEN}18` }}
                >
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ background: `radial-gradient(ellipse at 50% 0%, ${GREEN}12 0%, transparent 70%)` }} />
                  <div className="relative flex flex-col items-center gap-1 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                        style={{ background: `${GREEN}18`, border: `1px solid ${GREEN}55` }}>
                        <Zap className="w-5 h-5" style={{ color: GREEN }} />
                      </div>
                      <span
                        className="font-black tabular-nums leading-none"
                        style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '48px', color: GREEN, textShadow: `0 0 28px ${GREEN}88`, letterSpacing: '-1px' }}
                      >
                        +{animatedTokens.toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm font-bold" style={{ color: `${GREEN}88` }}>MOCKJ tokens added to your wallet</p>
                  </div>
                  {liveBalance !== null && (
                    <div className="relative pt-3 border-t flex flex-col items-center gap-0.5"
                      style={{ borderColor: `${GREEN}20` }}>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">New Balance</p>
                      <p className="text-3xl font-black" style={{ fontFamily: 'Space Grotesk, sans-serif', color: GOLD, textShadow: `0 0 20px ${GOLD}55` }}>
                        {animatedBalance.toLocaleString()}
                        <span className="text-base font-semibold ml-1" style={{ color: `${GOLD}77` }}>tokens</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Builder credits counter ────────────────────────────────────── */}
            {isBuilderOnly && (
              <div className="w-full mb-4 fade-slide-up" style={{ animationDelay: '0.15s' }}>
                <div
                  className="rounded-3xl border p-5 relative overflow-hidden"
                  style={{ background: `${VIOLET}08`, borderColor: `${VIOLET}44`, boxShadow: `0 0 40px ${VIOLET}18` }}
                >
                  <div className="relative flex flex-col items-center gap-1">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                        style={{ background: `${VIOLET}18`, border: `1px solid ${VIOLET}55` }}>
                        <Building2 className="w-5 h-5" style={{ color: VIOLET }} />
                      </div>
                      <span className="font-black tabular-nums leading-none"
                        style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '48px', color: VIOLET, textShadow: `0 0 28px ${VIOLET}88`, letterSpacing: '-1px' }}>
                        +{animatedBuilder.toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm font-bold" style={{ color: `${VIOLET}88` }}>Builder credits added to your account</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Subscription perks ─────────────────────────────────────────── */}
            {isSubscription && !tokensToShow && (
              <div className="w-full mb-4 fade-slide-up" style={{ animationDelay: '0.2s' }}>
                <div className="rounded-2xl border p-5"
                  style={{ background: 'hsl(265 80% 65% / 0.05)', borderColor: 'hsl(265 80% 65% / 0.25)' }}>
                  <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(140,160,200,0.5)' }}>You now have access to</p>
                  <div className="space-y-2">
                    {['Unlimited chat messages', 'Unlimited image generations', 'ElevenLabs voice output', 'Full Project Memory', 'Priority AI models', 'Monthly token grants'].map(f => (
                      <div key={f} className="flex items-center gap-2 text-xs text-white/80">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: GREEN }} />
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Badge earned ───────────────────────────────────────────────── */}
            {badgeEarned && BADGE_LABELS[badgeEarned] && (
              <div className="w-full mb-4 fade-slide-up" style={{ animationDelay: '0.25s' }}>
                <div className="rounded-2xl border p-4 flex items-center gap-4"
                  style={{ background: `${GOLD}08`, borderColor: `${GOLD}33` }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                    style={{ background: `${GOLD}18`, border: `1px solid ${GOLD}44` }}>
                    {BADGE_LABELS[badgeEarned].split(' ')[0]}
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: `${GOLD}aa` }}>Badge Unlocked</p>
                    <p className="text-base font-bold text-white">{BADGE_LABELS[badgeEarned]}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(160,180,220,0.5)' }}>Displayed on your profile forever</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── CTA buttons ────────────────────────────────────────────────── */}
            <div className="fade-slide-up w-full space-y-3 mt-1" style={{ animationDelay: '0.35s' }}>
              {/* Primary: Start Chatting */}
              <button
                onClick={() => navigate('/', { replace: true })}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-base transition-all active:scale-95 hover:scale-[1.01]"
                style={{
                  background: `linear-gradient(135deg, ${GREEN}ee, ${GREEN}aa)`,
                  color: '#000',
                  boxShadow: `0 6px 40px ${GREEN}44`,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 6px 50px ${GREEN}66`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 6px 40px ${GREEN}44`; }}
              >
                <MessageSquare className="w-5 h-5" />
                Start Chatting — Let's Go! 🔥
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Secondary: Buy more tokens */}
              <button
                onClick={() => navigate('/tokens?tab=tokens', { replace: true })}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-sm transition-all active:scale-95"
                style={{ background: `${GREEN}0e`, border: `1px solid ${GREEN}33`, color: `${GREEN}cc` }}
              >
                <Coins className="w-4 h-4" />
                Buy More Tokens
              </button>

              <p className="text-[11px] text-center" style={{ color: 'rgba(90,110,150,0.4)' }}>
                Auto-redirecting in {secondsLeft}s… · Secured by Stripe · MLTX © 2025
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
