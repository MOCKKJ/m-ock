/**
 * MockJ Token Shop & Billing
 * ─ Explicit Cash App Pay / PayPal / Venmo buttons on every token pack
 * ─ Stripe Buy Button (Card / Apple Pay / Google Pay) toggled on demand
 * ─ Custom checkout flow for subscriptions + builder credit packs
 */
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Coins, Zap, Crown, Check, ExternalLink, Shield, Loader2,
  Building2, ShoppingCart, ArrowLeft, X, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTokenWallet } from '@/hooks/useTokenWallet';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { toast } from 'sonner';
import mascot from '@/assets/mockj-mascot.png';
import { track } from '@/lib/posthog';

// ── Stripe Buy Button JSX type declaration ───────────────────────────────────
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'stripe-buy-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        'buy-button-id': string;
        'publishable-key': string;
      };
    }
  }
}

const PK = 'pk_live_51SICNiLNl01u4P4rhvG8R7G17pmYDKvlBCapJLV1KaoeJeI5grQkVC3cCa3P0jq2eeGqSSvdhDMBRtXrNLrP8C1O000MbfgTqD';

// ── Stripe Buy Button IDs (mapped to token packs) ────────────────────────────
const BUY_BTNS: Record<string, string> = {
  'tokens-100':  'buy_btn_1TjxrKLNl01u4P4re6cuVk3A',  // $1.99
  'tokens-550':  'buy_btn_1TjxqfLNl01u4P4rIXudUuoV',  // $7.99
  'tokens-1150': 'buy_btn_1TjxsoLNl01u4P4rVQkwCSSx',  // $14.99
  'tokens-6000': 'buy_btn_1TjxuGLNl01u4P4rkqHprmQn',  // $59.99
};

// ── Color constants ───────────────────────────────────────────────────────────
const GREEN   = 'hsl(142 70% 55%)';
const RED     = 'hsl(4 90% 58%)';
const VIOLET  = 'hsl(265 80% 65%)';
const GOLD    = 'hsl(38 95% 60%)';
const CASHAPP = '#00D632';
const VENMO   = '#3D95CE';
const PAYPAL  = '#003087';
const LINK    = '#0A85EA';

// ── Shared brand SVG icons ─────────────────────────────────────────────────────
const CashAppIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.15 14.2c-.19.94-1.03 1.6-1.97 1.6H8.82c-.94 0-1.78-.66-1.97-1.6L6 9.6h12l-.85 4.6zM7.42 7.2l.58-2.4C8.24 3.74 9.07 3 10.02 3h3.96c.95 0 1.78.74 2.02 1.8l.58 2.4H7.42zM12 17.5c-.69 0-1.25.56-1.25 1.25S11.31 20 12 20s1.25-.56 1.25-1.25S12.69 17.5 12 17.5z"/>
    <circle cx="12" cy="11.6" r="1.5"/>
  </svg>
);

const PayPalIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M7.076 21.337H4.272a.641.641 0 0 1-.633-.74L5.767 3.07a.641.641 0 0 1 .634-.537h6.068c2.894 0 4.88 1.265 5.27 3.44.14.765.12 1.532-.062 2.292-.74 3.093-2.966 4.638-6.388 4.638H9.3l-1.031 6.42a.641.641 0 0 1-.633.534h-.56zm6.37-12.38c.13-.68.099-1.208-.094-1.583-.284-.55-.9-.85-1.82-.85H9.776L8.928 12.4h2.196c1.75 0 2.872-.78 3.322-3.443z"/>
  </svg>
);

const VenmoIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.5 3c.5 1.8.7 3.5.7 5.4 0 5.6-4.8 12.9-8.7 17.6H5L2 3.8 8.4 3l1.8 14.2C12.1 13.4 14.5 8 14.5 5c0-.8-.1-1.5-.3-2L19.5 3z"/>
  </svg>
);

const ApplePayIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.32.07 2.24.72 3.01.73.91-.17 1.78-.82 2.76-.77 1.18.07 2.07.56 2.64 1.44-2.4 1.46-1.93 4.92.59 5.82-.42 1.2-.98 2.37-1 3.66zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
  </svg>
);

const GooglePayIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.24 10.285V14.4h1.385c.74 0 1.36-.246 1.85-.737.49-.49.735-1.09.735-1.8 0-.71-.245-1.308-.735-1.797-.49-.49-1.11-.735-1.85-.735h-1.385v.954zm0-1.285h1.385c1.1 0 2.03.385 2.79 1.155.76.77 1.14 1.695 1.14 2.778 0 1.082-.38 2.007-1.14 2.775-.76.768-1.69 1.152-2.79 1.152h-1.385V9H12.24zM5.5 13.15V9H7v4.15c0 .58.157 1.033.47 1.36.315.325.74.487 1.275.487.537 0 .963-.162 1.278-.487.315-.327.472-.78.472-1.36V9H12v4.15c0 .91-.305 1.668-.915 2.273-.61.604-1.4.907-2.365.907-.963 0-1.75-.303-2.36-.907-.61-.605-.915-1.363-.915-2.273z"/>
  </svg>
);

const LinkIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);

// ── Checkout helper ──────────────────────────────────────────────────────────
async function startCheckout(packageId: string, preferredMethod?: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { toast.error('Sign in to purchase.'); return; }

  track('checkout_started', { package_id: packageId, method: preferredMethod ?? 'default' });

  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: { packageId, preferredMethod },
  });

  if (error) {
    let msg = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const raw = await error.context.text();
        // Parse JSON error body if present
        try {
          const parsed = JSON.parse(raw);
          msg = parsed.error ?? parsed.message ?? raw;
        } catch {
          msg = raw || msg;
        }
      } catch { /* ignore */ }
    }
    track('checkout_error', { package_id: packageId, error: msg });
    // Show the specific Stripe error so users know what went wrong
    toast.error(msg, { duration: 7000 });
    return;
  }
  if (data?.url) {
    track('checkout_redirect', { package_id: packageId });
    window.location.href = data.url;
  }
}

async function openCustomerPortal() {
  const { data, error } = await supabase.functions.invoke('customer-portal', {});
  if (error) { toast.error('Could not open billing portal.'); return; }
  if (data?.url) window.open(data.url, '_blank');
}

// ── Plan badge ────────────────────────────────────────────────────────────────
function PlanBadge({ tier }: { tier: string }) {
  if (tier === 'elite') return (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black"
      style={{ background: `${GOLD}22`, border: `1px solid ${GOLD}88`, color: GOLD }}>
      <Crown className="w-3 h-3" /> Elite
    </span>
  );
  if (tier === 'pro' || tier === 'starter') return (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black"
      style={{ background: `${GREEN}22`, border: `1px solid ${GREEN}88`, color: GREEN }}>
      <Zap className="w-3 h-3" /> Pro
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black"
      style={{ background: 'rgba(100,120,200,0.08)', border: '1px solid rgba(100,120,200,0.25)', color: 'rgba(160,180,220,0.7)' }}>
      Free
    </span>
  );
}

// ── Payment method badges footer ──────────────────────────────────────────────
function PaymentBadges() {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black"
        style={{ background: `${CASHAPP}18`, border: `1px solid ${CASHAPP}55`, color: CASHAPP }}>
        <CashAppIcon size={11} /> Cash App Pay
      </span>
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black"
        style={{ background: `${VENMO}18`, border: `1px solid ${VENMO}55`, color: VENMO }}>
        <VenmoIcon size={11} /> Venmo
      </span>
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black"
        style={{ background: '#009cde18', border: `1px solid #009cde55`, color: '#009cde' }}>
        <PayPalIcon size={11} /> PayPal
      </span>
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold"
        style={{ background: 'rgba(230,230,230,0.06)', border: '1px solid rgba(230,230,230,0.18)', color: '#e2e2e2' }}>
        <ApplePayIcon size={11} /> Apple Pay
      </span>
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold"
        style={{ background: 'rgba(66,133,244,0.08)', border: '1px solid rgba(66,133,244,0.25)', color: '#4285F4' }}>
        <GooglePayIcon size={11} /> Google Pay
      </span>
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold"
        style={{ background: `${LINK}10`, border: `1px solid ${LINK}44`, color: LINK }}>
        <LinkIcon size={11} /> Link
      </span>
      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold"
        style={{ background: 'rgba(100,120,200,0.08)', border: '1px solid rgba(100,120,200,0.18)', color: 'rgba(160,180,220,0.55)' }}>
        💳 Card
      </span>
    </div>
  );
}

// ── Checkout confirmation modal ───────────────────────────────────────────────
interface ConfirmItem {
  packageId: string;
  name: string;
  price: string;
  period?: string;
  includes: string[];
  accentColor: string;
  emoji: string;
  isTrial?: boolean;
}

function CheckoutConfirmModal({
  item, onConfirm, onCancel, loading,
}: {
  item: ConfirmItem; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(14px)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          background: 'hsl(224 20% 7%)',
          border: `1.5px solid ${item.accentColor}55`,
          boxShadow: `0 0 80px ${item.accentColor}22, 0 32px 80px rgba(0,0,0,0.75)`,
        }}
      >
        <div className="px-6 pt-6 pb-4" style={{ borderBottom: `1px solid ${item.accentColor}18` }}>
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
              style={{ background: `${item.accentColor}14`, border: `1px solid ${item.accentColor}44` }}>
              {item.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest mb-0.5"
                style={{ color: `${item.accentColor}88` }}>Confirm Purchase</p>
              <h3 className="text-lg font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                {item.name}
              </h3>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-2xl font-black" style={{ color: item.accentColor }}>{item.price}</span>
                {item.period && <span className="text-sm" style={{ color: 'rgba(160,180,220,0.45)' }}>{item.period}</span>}
              </div>
            </div>
            <button onClick={onCancel} disabled={loading}
              className="w-7 h-7 flex items-center justify-center rounded-full shrink-0"
              style={{ color: 'rgba(160,180,220,0.35)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="px-6 py-4">
          <p className="text-[10px] font-black uppercase tracking-widest mb-2.5"
            style={{ color: 'rgba(140,160,200,0.5)' }}>What you get</p>
          <ul className="space-y-2">
            {item.includes.map(inc => (
              <li key={inc} className="flex items-start gap-2.5 text-sm" style={{ color: 'rgba(190,210,200,0.8)' }}>
                <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: item.accentColor }} />
                {inc}
              </li>
            ))}
          </ul>
          {item.isTrial && (
            <div className="mt-4 flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
              style={{ background: `${GREEN}0d`, border: `1px solid ${GREEN}44` }}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: GREEN }} />
              <p className="text-[11px] leading-relaxed" style={{ color: `${GREEN}cc` }}>
                <strong className="font-black">3-day FREE trial</strong> — no charge today.
                Auto-cancels if no card is added before trial ends.
              </p>
            </div>
          )}
        </div>
        <div className="px-6 pb-6 flex flex-col gap-2.5">
          <button
            onClick={onConfirm} disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black transition-all active:scale-[0.98] disabled:opacity-60"
            style={{
              background: `linear-gradient(135deg, ${item.accentColor}dd, ${item.accentColor}aa)`,
              color: '#000',
              boxShadow: `0 4px 24px ${item.accentColor}44`,
            }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ShoppingCart className="w-4 h-4" /> Confirm &amp; Pay →</>}
          </button>
          <button onClick={onCancel} disabled={loading}
            className="w-full py-2.5 rounded-2xl text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: 'rgba(100,120,200,0.07)', border: '1px solid rgba(100,120,200,0.18)', color: 'rgba(160,180,220,0.55)' }}>
            Cancel
          </button>
          <p className="text-[10px] text-center" style={{ color: 'rgba(90,110,150,0.45)' }}>
            Redirected to Stripe's secure checkout · Powered by Stripe
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Referral Section ────────────────────────────────────────────────────────
function ReferralSection({ userId }: { userId: string }) {
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [referralCount, setReferralCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('user_profiles')
      .select('referral_code, referral_count')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) {
          setReferralCode(data.referral_code ?? null);
          setReferralCount(data.referral_count ?? 0);
        }
      });
  }, [userId]);

  const referralLink = referralCode
    ? `${window.location.origin}/auth?ref=${referralCode}`
    : null;

  const handleCopy = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success('Referral link copied! Share it to earn tokens.');
    setTimeout(() => setCopied(false), 2500);
    track('referral_link_copied', { referral_code: referralCode });
  };

  return (
    <div
      className="mt-8 rounded-2xl overflow-hidden"
      style={{
        background: `${GREEN}0a`,
        border: `1.5px solid ${GREEN}44`,
        boxShadow: `0 0 32px ${GREEN}14`,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: `1px solid ${GREEN}22`, background: `${GREEN}08` }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${GREEN}22`, border: `1px solid ${GREEN}55` }}
        >
          <span className="text-base">🎁</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black" style={{ color: GREEN, fontFamily: 'Space Grotesk, sans-serif' }}>
            Refer Friends — Earn Tokens
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: `${GREEN}88` }}>
            You and your friend each get <strong>+250 tokens</strong> per referral
          </p>
        </div>
        <div
          className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black"
          style={{ background: `${GREEN}22`, border: `1px solid ${GREEN}55`, color: GREEN }}
        >
          {referralCount} referred
        </div>
      </div>

      {/* Rewards row */}
      <div className="grid grid-cols-2 gap-3 px-5 pt-4 pb-3">
        {[
          { label: 'You earn', value: '+250 tokens', icon: '💰' },
          { label: 'Friend earns', value: '+250 tokens', icon: '🎉' },
        ].map(({ label, value, icon }) => (
          <div
            key={label}
            className="flex items-center gap-2.5 p-3 rounded-xl"
            style={{ background: `${GREEN}0e`, border: `1px solid ${GREEN}33` }}
          >
            <span className="text-xl">{icon}</span>
            <div>
              <p className="text-[10px] font-semibold" style={{ color: `${GREEN}88` }}>{label}</p>
              <p className="text-base font-black" style={{ color: GREEN }}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Link row */}
      <div className="px-5 pb-5">
        {referralLink ? (
          <div className="flex items-center gap-2">
            <div
              className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 rounded-xl"
              style={{ background: 'hsl(224 15% 5%)', border: `1px solid ${GREEN}33` }}
            >
              <span className="text-[10px] font-mono truncate" style={{ color: `${GREEN}99` }}>
                {referralLink}
              </span>
            </div>
            <button
              onClick={handleCopy}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs transition-all active:scale-95"
              style={{
                background: copied ? `${GREEN}33` : `linear-gradient(135deg, ${GREEN}ee, ${GREEN}aa)`,
                color: copied ? GREEN : '#000',
                border: copied ? `1px solid ${GREEN}55` : 'none',
                boxShadow: copied ? 'none' : `0 3px 14px ${GREEN}44`,
                minWidth: 80,
              }}
            >
              {copied ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>
        ) : (
          <div
            className="flex items-center justify-center gap-2 py-3 rounded-xl"
            style={{ background: `${GREEN}08`, border: `1px solid ${GREEN}22` }}
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: `${GREEN}66` }} />
            <span className="text-xs" style={{ color: `${GREEN}66` }}>Loading referral link…</span>
          </div>
        )}
        <p className="text-[10px] mt-2 text-center" style={{ color: 'rgba(100,120,160,0.4)' }}>
          Tokens credited automatically when friend signs up · No cap on referrals
        </p>
      </div>
    </div>
  );
}

// ── Token Pack Card — clean layout with inline payment method picker ──────────
function TokenPackCard({
  id, name, price, badge, badgeEmoji, includes, buyBtnId, activeKey, currentBalance, onQuickPay,
}: {
  id: string; name: string; price: string;
  badge?: string; badgeEmoji?: string; includes: string[]; buyBtnId: string;
  activeKey: string | null;
  currentBalance: number;
  onQuickPay: (packageId: string, method: string) => void;
}) {
  const [scriptReady, setScriptReady] = useState(false);
  const [showMethods, setShowMethods] = useState(false);

  useEffect(() => {
    const check = () => customElements.get('stripe-buy-button') !== undefined;
    if (check()) { setScriptReady(true); return; }
    const interval = setInterval(() => { if (check()) { setScriptReady(true); clearInterval(interval); } }, 150);
    return () => clearInterval(interval);
  }, []);

  const isActive = (method: string) => activeKey === `${id}:${method}`;
  const anyActive = activeKey !== null && activeKey.startsWith(id + ':');
  const anyLoading = activeKey !== null;

  const METHODS = [
    {
      key: 'cashapp',
      label: 'Cash App Pay',
      bg: `linear-gradient(135deg, ${CASHAPP} 0%, #00b82a 100%)`,
      color: '#000',
      shadow: `${CASHAPP}55`,
      icon: <CashAppIcon size={20} />,
    },
    {
      key: 'paypal',
      label: 'PayPal',
      bg: 'linear-gradient(135deg, #0070ba 0%, #003087 100%)',
      color: '#fff',
      shadow: `${PAYPAL}55`,
      icon: <PayPalIcon size={20} />,
    },
    {
      key: 'venmo',
      label: 'Venmo',
      bg: `linear-gradient(135deg, ${VENMO} 0%, #1a7ac0 100%)`,
      color: '#fff',
      shadow: `${VENMO}44`,
      icon: <VenmoIcon size={20} />,
    },
  ];

  return (
    <div
      className="flex flex-col gap-4 p-5 rounded-2xl transition-all duration-150"
      style={{ background: 'hsl(224 15% 7%)', border: '1px solid rgba(100,120,200,0.14)' }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = `${GREEN}55`;
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 28px ${GREEN}14`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(100,120,200,0.14)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {badge && (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black mb-1.5"
              style={{ background: `${GREEN}22`, border: `1px solid ${GREEN}55`, color: GREEN }}>
              {badgeEmoji} {badge}
            </div>
          )}
          <p className="text-white font-black text-base leading-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{name}</p>
          <p className="text-2xl font-black mt-0.5" style={{ color: GREEN }}>{price}</p>
          {currentBalance >= 0 && (
            <p className="text-[10px] font-semibold mt-0.5" style={{ color: 'rgba(160,180,220,0.45)' }}>
              You have {currentBalance.toLocaleString()} token{currentBalance !== 1 ? 's' : ''} left
            </p>
          )}
        </div>
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: `${GREEN}18`, border: `1px solid ${GREEN}44` }}>
          <Coins className="w-5 h-5" style={{ color: GREEN }} />
        </div>
      </div>

      {/* ── Includes list ─────────────────────────────────────────────── */}
      <ul className="space-y-1">
        {includes.map(inc => (
          <li key={inc} className="flex items-center gap-2 text-[11px]" style={{ color: 'rgba(180,195,230,0.6)' }}>
            <Check className="w-3 h-3 shrink-0" style={{ color: GREEN }} /> {inc}
          </li>
        ))}
      </ul>

      {/* ── Primary CTA: Buy Now ──────────────────────────────────────── */}
      {!showMethods ? (
        <button
          onClick={() => setShowMethods(true)}
          disabled={anyLoading}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm transition-all active:scale-95 disabled:opacity-50"
          style={{
            background: `linear-gradient(135deg, ${GREEN}ee, ${GREEN}aa)`,
            color: '#000',
            boxShadow: `0 4px 20px ${GREEN}44`,
          }}
        >
          <ShoppingCart className="w-4 h-4" />
          Buy Now — {price}
        </button>
      ) : (
        <div className="space-y-2">
          {/* ── Payment method buttons ────────────────────────────────── */}
          <p className="text-[10px] font-black uppercase tracking-widest text-center mb-1"
            style={{ color: 'rgba(160,180,220,0.4)' }}>Choose payment method</p>

          {METHODS.map(m => (
            <button
              key={m.key}
              onClick={() => onQuickPay(id, m.key)}
              disabled={anyLoading}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-black transition-all active:scale-[0.98] disabled:opacity-50 select-none"
              style={{
                background: isActive(m.key) ? 'rgba(100,120,200,0.12)' : m.bg,
                color: isActive(m.key) ? 'rgba(160,180,220,0.65)' : m.color,
                fontSize: '14px',
                letterSpacing: '0.01em',
                boxShadow: isActive(m.key) ? 'none' : `0 4px 18px ${m.shadow}`,
                border: isActive(m.key) ? '1px solid rgba(100,120,200,0.28)' : 'none',
                minHeight: 48,
              }}
            >
              {isActive(m.key) ? (
                <><Loader2 className="w-4 h-4 animate-spin" /><span>Opening Stripe…</span></>
              ) : (
                <>
                  <span className="flex items-center justify-center w-5 h-5 shrink-0">{m.icon}</span>
                  <span>{m.label}</span>
                </>
              )}
            </button>
          ))}

          {/* ── Divider ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 my-1">
            <div className="flex-1 h-px" style={{ background: 'rgba(100,120,200,0.15)' }} />
            <span className="text-[10px] font-semibold px-2" style={{ color: 'rgba(130,150,190,0.4)' }}>or pay with card</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(100,120,200,0.15)' }} />
          </div>

          {/* ── Stripe Buy Button: Card / Apple Pay / Google Pay / Link ── */}
          <div className="w-full overflow-hidden rounded-xl" style={{ border: '1px solid rgba(100,120,200,0.18)' }}>
            {scriptReady ? (
              <stripe-buy-button buy-button-id={buyBtnId} publishable-key={PK} />
            ) : (
              <div className="w-full py-3 flex items-center justify-center text-xs"
                style={{ color: 'rgba(140,160,200,0.5)' }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Loading card options…
              </div>
            )}
          </div>

          {/* ── Availability badges ───────────────────────────────────── */}
          <div className="flex items-center justify-center flex-wrap gap-1.5 pt-0.5">
            {[
              { label: 'Apple Pay',  icon: <ApplePayIcon size={12} />,  color: '#e2e2e2' },
              { label: 'Google Pay', icon: <GooglePayIcon size={12} />, color: '#4285F4' },
            ].map(({ label, icon, color }) => (
              <div key={label} className="flex items-center gap-1 px-2 py-1 rounded-full"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
                <span style={{ color }}>{icon}</span>
                <span className="text-[10px] font-semibold" style={{ color: 'rgba(180,195,230,0.45)' }}>{label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1 px-2 py-1 rounded-full"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
              <span className="text-[11px]">💳</span>
              <span className="text-[10px] font-semibold" style={{ color: 'rgba(180,195,230,0.45)' }}>Card</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-full"
              style={{ background: `${LINK}10`, border: `1px solid ${LINK}44` }}>
              <span style={{ color: LINK }}><LinkIcon size={11} /></span>
              <span className="text-[10px] font-semibold" style={{ color: LINK }}>Link</span>
            </div>
          </div>

          {/* ── Back button ──────────────────────────────────────────── */}
          {!anyActive && (
            <button
              onClick={() => setShowMethods(false)}
              className="w-full py-2 rounded-xl text-xs font-semibold transition-all"
              style={{ background: 'rgba(100,120,200,0.06)', border: '1px solid rgba(100,120,200,0.15)', color: 'rgba(130,150,190,0.45)' }}
            >
              ← Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Subscription card ─────────────────────────────────────────────────────────
function SubCard({
  id, name, price, period, badge, badgeColor, features, highlight, emoji, isCurrentPlan, loading, onSelect,
}: {
  id: string; name: string; price: string; period: string; badge?: string; badgeColor?: string;
  features: string[]; highlight: boolean; emoji: string; isCurrentPlan: boolean; loading: boolean;
  onSelect: () => void;
}) {
  const accentColor = id === 'elite-monthly' ? GOLD : id === 'pro-monthly' ? GREEN : VIOLET;
  return (
    <div
      className="relative flex flex-col gap-5 p-6 rounded-2xl transition-all duration-200"
      style={{
        background: highlight ? 'hsl(224 15% 8%)' : 'hsl(224 15% 6%)',
        border: `1px solid ${highlight ? `${accentColor}66` : 'rgba(100,120,200,0.14)'}`,
        boxShadow: highlight ? `0 0 40px ${accentColor}22, 0 0 1px ${accentColor}55` : 'none',
        transform: highlight ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      {badge && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[11px] font-black text-black"
          style={{ background: badgeColor ?? accentColor }}>
          {badge}
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
          style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}44` }}>
          {emoji}
        </div>
        <div>
          <h3 className="text-lg font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{name}</h3>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-black" style={{ color: accentColor }}>{price}</span>
            <span className="text-sm" style={{ color: 'rgba(160,180,220,0.5)' }}>{period}</span>
          </div>
        </div>
      </div>
      <ul className="space-y-2 flex-1">
        {features.map(f => (
          <li key={f} className="flex items-start gap-2 text-xs" style={{ color: 'rgba(180,195,230,0.7)' }}>
            <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: accentColor }} /> {f}
          </li>
        ))}
      </ul>
      <button
        onClick={onSelect} disabled={loading || isCurrentPlan}
        className="w-full py-3 rounded-xl text-sm font-black transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        style={isCurrentPlan
          ? { background: `${accentColor}18`, border: `1px solid ${accentColor}44`, color: accentColor }
          : highlight
          ? { background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`, color: '#000', boxShadow: `0 0 20px ${accentColor}44` }
          : { background: 'hsl(224 15% 14%)', border: `1px solid ${accentColor}44`, color: accentColor }
        }
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isCurrentPlan ? '✓ Current Plan' : `Upgrade to ${name}`}
      </button>
    </div>
  );
}

// ── Builder credit pack card ──────────────────────────────────────────────────
function BuilderCard({ id, name, price, badge, badgeEmoji, includes, loading, onBuy }: {
  id: string; name: string; price: string; badge?: string; badgeEmoji?: string;
  includes: string[]; loading: boolean; onBuy: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-4 p-5 rounded-2xl transition-all duration-150 cursor-pointer"
      style={{ background: 'hsl(224 15% 7%)', border: '1px solid rgba(100,120,200,0.14)' }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `${VIOLET}55`; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 24px ${VIOLET}18`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(100,120,200,0.14)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
    >
      {badge && (
        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black self-start"
          style={{ background: `${VIOLET}22`, border: `1px solid ${VIOLET}55`, color: VIOLET }}>
          {badgeEmoji} {badge}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white font-black text-base" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{name}</p>
          <p className="text-2xl font-black mt-0.5" style={{ color: VIOLET }}>{price}</p>
        </div>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: `${VIOLET}18`, border: `1px solid ${VIOLET}44` }}>
          <Building2 className="w-6 h-6" style={{ color: VIOLET }} />
        </div>
      </div>
      <ul className="space-y-1">
        {includes.map(inc => (
          <li key={inc} className="flex items-center gap-2 text-xs" style={{ color: 'rgba(180,195,230,0.65)' }}>
            <span style={{ color: VIOLET }}>·</span> {inc}
          </li>
        ))}
      </ul>
      <button
        onClick={onBuy} disabled={loading}
        className="w-full py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-95"
        style={{ background: `${VIOLET}18`, border: `1px solid ${VIOLET}55`, color: VIOLET }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${VIOLET}28`; (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 16px ${VIOLET}33`; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${VIOLET}18`; (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; }}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Building2 className="w-4 h-4" /> Add Credits</>}
      </button>
    </div>
  );
}

// ── Confirm modal data ────────────────────────────────────────────────────────
const MODAL_ITEMS: Record<string, ConfirmItem> = {
  'pro-monthly': {
    packageId: 'pro-monthly', name: 'MockJ Pro', price: '$59.99', period: '/month',
    emoji: '⚡', accentColor: GREEN, isTrial: true,
    includes: ['3-day FREE trial — no charge today', '2,000 chat tokens/month', '10,000 builder credits/month', 'Unlimited chat + image & video generation', 'Website builder + IDE builder', 'Pro community badge'],
  },
  'elite-monthly': {
    packageId: 'elite-monthly', name: 'MockJ Elite', price: '$29.99', period: '/month',
    emoji: '👑', accentColor: GOLD, isTrial: true,
    includes: ['3-day FREE trial — no charge today', '6,000 chat tokens/month', '30,000 builder credits/month', 'Everything in Pro', 'Priority AI queue', 'Elite community badge'],
  },
  'builder-5k': {
    packageId: 'builder-5k', name: '5K Builder Credits', price: '$4.99',
    emoji: '🏗️', accentColor: VIOLET,
    includes: ['5,000 builder credits', '~10 static websites', 'Never expires'],
  },
  'builder-15k': {
    packageId: 'builder-15k', name: '15K Builder Credits', price: '$12.99',
    emoji: '🔥', accentColor: VIOLET,
    includes: ['15,000 builder credits', '~16 React apps', 'Never expires', 'Best value'],
  },
  'builder-50k': {
    packageId: 'builder-50k', name: '50K Builder Credits', price: '$39.99',
    emoji: '💎', accentColor: VIOLET,
    includes: ['50,000 builder credits', '~33 fullstack apps', 'Best per-credit price'],
  },
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TokenShopPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, subscription } = useAuth();
  const { wallet } = useTokenWallet();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // Format: "packageId:method" e.g. "tokens-100:cashapp"
  const [tokenLoadingKey, setTokenLoadingKey] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmItem | null>(null);
  const [tab, setTab] = useState<'plans' | 'tokens' | 'builder' | 'history'>(() => {
    const t = searchParams.get('tab');
    return (t === 'tokens' || t === 'builder' || t === 'history' || t === 'plans') ? t : 'plans';
  });
  const [builderCredits, setBuilderCredits] = useState(0);
  const [ledger, setLedger] = useState<{ id: string; amount: number; reason: string; created_at: string }[]>([]);
  const [builderLedger, setBuilderLedger] = useState<{ id: string; amount: number; reason: string; created_at: string }[]>([]);

  const tier = subscription?.tier ?? 'free';
  const isSubscribed = subscription?.subscribed ?? false;

  useEffect(() => {
    if (!user) return;
    supabase.from('user_profiles').select('builder_credits').eq('id', user.id).single()
      .then(({ data }) => { if (data) setBuilderCredits(data.builder_credits ?? 0); });
    supabase.from('token_ledger').select('id, amount, reason, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => { if (data) setLedger(data); });
    supabase.from('builder_credit_ledger').select('id, amount, reason, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => { if (data) setBuilderLedger(data); });
  }, [user]);

  // Subscriptions + builder packs
  const handleBuy = (packageId: string) => {
    if (!user) { toast.error('Sign in to purchase'); navigate('/auth'); return; }
    track('buy_clicked', { package_id: packageId });
    const item = MODAL_ITEMS[packageId];
    if (item) {
      setConfirmModal(item);
    } else {
      setLoadingId(packageId);
      startCheckout(packageId).finally(() => setLoadingId(null));
    }
  };

  // Token packs — specific payment method (Cash App / PayPal / Venmo)
  const handleTokenQuickPay = (packageId: string, method: string) => {
    if (!user) { toast.error('Sign in to purchase'); navigate('/auth'); return; }
    const key = `${packageId}:${method}`;
    track('buy_clicked', { package_id: packageId, method });
    setTokenLoadingKey(key);
    startCheckout(packageId, method).finally(() => setTokenLoadingKey(null));
  };

  const handleTabChange = (t: typeof tab) => {
    setTab(t);
    track('shop_tab_viewed', { tab: t });
  };

  const confirmCheckout = async () => {
    if (!confirmModal) return;
    const packageId = confirmModal.packageId;
    setLoadingId(packageId);
    try { await startCheckout(packageId); }
    finally { setLoadingId(null); setConfirmModal(null); }
  };

  const TABS = [
    { id: 'plans'   as const, label: '⚡ Plans' },
    { id: 'tokens'  as const, label: '$ Token Packs' },
    { id: 'builder' as const, label: '🏗️ Builder Credits' },
    { id: 'history' as const, label: '📊 History' },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#04030f', fontFamily: 'Inter, sans-serif' }}>

      {confirmModal && (
        <CheckoutConfirmModal
          item={confirmModal}
          loading={loadingId === confirmModal.packageId}
          onConfirm={confirmCheckout}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full opacity-[0.06]"
          style={{ background: `radial-gradient(circle, ${GREEN}, transparent 70%)` }} />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 rounded-full opacity-[0.04]"
          style={{ background: `radial-gradient(circle, ${CASHAPP}, transparent 70%)` }} />
      </div>

      {/* Header */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3"
        style={{ background: 'rgba(4,3,15,0.92)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${GREEN}22` }}>
        <button onClick={() => navigate('/')}
          className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
          style={{ border: `1px solid ${GREEN}33`, color: GREEN }}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0"
          style={{ border: `1.5px solid ${GREEN}66`, boxShadow: `0 0 14px ${GREEN}33` }}>
          <img src={mascot} alt="MockJ" className="w-full h-full object-cover object-top" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif', textShadow: `0 0 16px ${GREEN}55` }}>
            MockJ Token Shop
          </h1>
          <p className="text-[11px]" style={{ color: `${GREEN}99` }}>
            Cash App · PayPal · Venmo · Card · Apple Pay · Google Pay · Link
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{ background: `${GREEN}12`, border: `1px solid ${GREEN}44` }}>
            <Coins className="w-3.5 h-3.5" style={{ color: GREEN }} />
            <span className="text-xs font-black tabular-nums" style={{ color: GREEN }}>
              {wallet.loading ? '…' : wallet.balance.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{ background: `${VIOLET}12`, border: `1px solid ${VIOLET}44` }}>
            <Building2 className="w-3.5 h-3.5" style={{ color: VIOLET }} />
            <span className="text-xs font-black tabular-nums" style={{ color: VIOLET }}>
              {builderCredits.toLocaleString()}
            </span>
          </div>
          <PlanBadge tier={tier} />
        </div>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, hsl(224 20% 5%), hsl(142 30% 5%))`, borderBottom: `1px solid ${GREEN}22` }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at 70% 50%, ${GREEN}08 0%, transparent 60%)` }} />
        <div className="max-w-5xl mx-auto px-4 py-8 flex items-center gap-6">
          <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 hidden sm:block"
            style={{ border: `2px solid ${GREEN}66`, boxShadow: `0 0 30px ${GREEN}44` }}>
            <img src={mascot} alt="MockJ MLTX" className="w-full h-full object-cover object-top" />
          </div>
          <div className="flex-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black mb-3"
              style={{ background: `${GREEN}18`, border: `1px solid ${GREEN}55`, color: GREEN }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: GREEN }} />
              MLTX · MILLION LITE XCHANGE
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white mb-2"
              style={{ fontFamily: 'Space Grotesk, sans-serif', textShadow: `0 0 20px ${GREEN}33` }}>
              Fuel the Machine. <span style={{ color: GREEN }}>Buy Tokens.</span>
            </h2>
            {/* Payment method pills */}
            <div className="flex flex-wrap gap-2 mt-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black"
                style={{ background: `${CASHAPP}18`, border: `1.5px solid ${CASHAPP}66`, color: CASHAPP }}>
                <CashAppIcon size={15} /> Cash App Pay
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black"
                style={{ background: `${VENMO}18`, border: `1.5px solid ${VENMO}66`, color: VENMO }}>
                <VenmoIcon size={15} /> Venmo
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black"
                style={{ background: '#009cde18', border: '1.5px solid #009cde66', color: '#009cde' }}>
                <PayPalIcon size={15} /> PayPal
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: 'rgba(230,230,230,0.06)', border: '1px solid rgba(230,230,230,0.18)', color: '#e2e2e2' }}>
                <ApplePayIcon size={14} /> Apple Pay
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: 'rgba(66,133,244,0.08)', border: '1px solid rgba(66,133,244,0.25)', color: '#4285F4' }}>
                <GooglePayIcon size={14} /> Google Pay
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: `${LINK}12`, border: `1.5px solid ${LINK}44`, color: LINK }}>
                <LinkIcon size={14} /> Link
              </span>
            </div>
          </div>
          <div className="hidden md:flex flex-col gap-2 text-right shrink-0">
            <div className="text-xs font-bold" style={{ color: 'rgba(160,180,220,0.4)' }}>Your Balance</div>
            <div className="text-3xl font-black" style={{ color: GREEN, textShadow: `0 0 20px ${GREEN}55` }}>
              {wallet.loading ? '…' : wallet.balance.toLocaleString()}
            </div>
            <div className="text-xs" style={{ color: GREEN + '88' }}>tokens</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-[57px] z-10 flex gap-1 px-4 py-2"
        style={{ background: 'rgba(4,3,15,0.88)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(100,120,200,0.1)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => handleTabChange(t.id)}
            className="px-4 py-2 rounded-xl text-xs font-black transition-all"
            style={{
              background: tab === t.id ? `${GREEN}18` : 'transparent',
              color: tab === t.id ? GREEN : 'rgba(150,170,220,0.45)',
              border: tab === t.id ? `1px solid ${GREEN}44` : '1px solid transparent',
              boxShadow: tab === t.id ? `0 0 12px ${GREEN}22` : 'none',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-8 relative z-10">

        {/* ── PLANS ─────────────────────────────────────────────────────────── */}
        {tab === 'plans' && (
          <div>
            <div className="text-center mb-8">
              <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: GREEN }}>MockJ Plans</p>
              <h2 className="text-3xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif', textShadow: `0 0 20px ${GREEN}33` }}>
                Go Unlimited. <span style={{ color: RED }}>No Cap.</span>
              </h2>
              <div className="inline-flex items-center gap-3 mt-4 px-5 py-3 rounded-2xl"
                style={{ background: `${GREEN}0e`, border: `1.5px solid ${GREEN}55`, boxShadow: `0 0 24px ${GREEN}18` }}>
                <span className="text-xl">🎉</span>
                <div className="text-left">
                  <p className="text-sm font-black" style={{ color: GREEN }}>3-Day FREE Trial — No Credit Card Required</p>
                  <p className="text-[11px]" style={{ color: `${GREEN}88` }}>Start Pro or Elite free for 3 days. Auto-cancels. No charge.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
              <div className="flex flex-col gap-5 p-6 rounded-2xl"
                style={{ background: 'hsl(224 15% 6%)', border: '1px solid rgba(100,120,200,0.14)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: 'rgba(100,120,200,0.08)', border: '1px solid rgba(100,120,200,0.2)' }}>🤖</div>
                  <div>
                    <h3 className="text-lg font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Free</h3>
                    <p className="text-3xl font-black text-white">$0</p>
                  </div>
                </div>
                <ul className="space-y-2 flex-1">
                  {['3,000 builder credits', '10 chat/day', '3 images/day', '1 video/day', 'Community access'].map(f => (
                    <li key={f} className="flex items-start gap-2 text-xs" style={{ color: 'rgba(180,195,230,0.6)' }}>
                      <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'rgba(100,120,200,0.5)' }} /> {f}
                    </li>
                  ))}
                </ul>
                <div className="py-2.5 text-center text-sm font-black rounded-xl"
                  style={{ background: 'rgba(100,120,200,0.08)', color: 'rgba(150,170,220,0.5)', border: '1px solid rgba(100,120,200,0.2)' }}>
                  {tier === 'free' ? '✓ Current Plan' : 'Free Tier'}
                </div>
              </div>

              <SubCard
                id="pro-monthly" name="MockJ Pro" price="$59.99" period="/month"
                badge="🔥 Most Popular" badgeColor={GREEN} highlight emoji="⚡"
                isCurrentPlan={tier === 'pro' || tier === 'starter'}
                loading={loadingId === 'pro-monthly'}
                features={['🎉 3-day FREE trial — no card needed', '2,000 tokens/month', '10,000 builder credits/month', 'Unlimited chat', 'Image & video generation', 'Website builder', 'Pro community badge']}
                onSelect={() => handleBuy('pro-monthly')}
              />

              <SubCard
                id="elite-monthly" name="MockJ Elite" price="$29.99" period="/month"
                badge="👑 Elite" badgeColor={GOLD} highlight={false} emoji="👑"
                isCurrentPlan={tier === 'elite'}
                loading={loadingId === 'elite-monthly'}
                features={['🎉 3-day FREE trial — no card needed', '6,000 tokens/month', '30,000 builder credits/month', 'Everything in Pro', 'Priority AI queue', 'Elite community badge']}
                onSelect={() => handleBuy('elite-monthly')}
              />
            </div>

            {isSubscribed && (
              <div className="flex flex-col sm:flex-row items-center gap-4 p-5 rounded-2xl"
                style={{ background: `${GREEN}08`, border: `1px solid ${GREEN}33` }}>
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${GREEN}18`, border: `1px solid ${GREEN}44` }}>
                    <Shield className="w-5 h-5" style={{ color: GREEN }} />
                  </div>
                  <div>
                    <p className="font-black text-white text-sm">Active Subscription</p>
                    <p className="text-xs" style={{ color: `${GREEN}99` }}>Renews automatically · Cancel anytime</p>
                  </div>
                </div>
                <button onClick={openCustomerPortal}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all"
                  style={{ background: `${GREEN}18`, border: `1px solid ${GREEN}44`, color: GREEN }}>
                  <ExternalLink className="w-4 h-4" /> Manage Billing
                </button>
              </div>
            )}

            <div className="mt-6 flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(120,140,180,0.5)' }}>
                <Shield className="w-3.5 h-3.5" /> Payments secured by Stripe
              </div>
              <PaymentBadges />
            </div>
          </div>
        )}

        {/* ── TOKEN PACKS ───────────────────────────────────────────────────── */}
        {tab === 'tokens' && (
          <div>
            <div className="mb-6">
              <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: GREEN }}>Token Packs</p>
              <h2 className="text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Top Off the Tank. <span style={{ color: GREEN }}>One-Time.</span>
              </h2>
              <p className="text-sm mt-1 mb-4" style={{ color: 'rgba(160,180,220,0.5)' }}>
                1 token = 1 chat message. Tokens never expire.
              </p>

              {/* Payment method call-out banner */}
              <div className="grid grid-cols-3 gap-2 mb-6">
                {[
                  { color: CASHAPP,    label: 'Cash App Pay', icon: <CashAppIcon size={20} /> },
                  { color: VENMO,      label: 'Venmo',        icon: <VenmoIcon size={20} />   },
                  { color: '#009cde',  label: 'PayPal',       icon: <PayPalIcon size={20} />  },
                ].map(({ color, label, icon }) => (
                  <div key={label} className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                    style={{ background: `${color}10`, border: `1.5px solid ${color}44` }}>
                    <span className="shrink-0" style={{ color }}>{icon}</span>
                    <span className="text-xs font-black" style={{ color }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {!wallet.loading && wallet.balance === 0 && (
              <div className="mb-6 p-5 rounded-2xl flex items-center gap-4"
                style={{ background: `${RED}10`, border: `1px solid ${RED}44` }}>
                <Coins className="w-8 h-8 shrink-0" style={{ color: RED }} />
                <div>
                  <p className="font-black text-white">You're out of tokens</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(200,180,180,0.7)' }}>Buy a pack below to keep chatting.</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <TokenPackCard
                id="tokens-100" name="100 Tokens" price="$1.99"
                buyBtnId={BUY_BTNS['tokens-100']}
                includes={['100 chat messages', 'Never expires']}
                activeKey={tokenLoadingKey}
                currentBalance={wallet.loading ? 0 : wallet.balance}
                onQuickPay={handleTokenQuickPay}
              />
              <TokenPackCard
                id="tokens-550" name="550 Tokens" price="$7.99"
                badge="Best Value" badgeEmoji="🔥"
                buyBtnId={BUY_BTNS['tokens-550']}
                includes={['500 + 50 bonus tokens', 'Never expires']}
                activeKey={tokenLoadingKey}
                currentBalance={wallet.loading ? 0 : wallet.balance}
                onQuickPay={handleTokenQuickPay}
              />
              <TokenPackCard
                id="tokens-1150" name="1,150 Tokens" price="$14.99"
                badge="Popular" badgeEmoji="💯"
                buyBtnId={BUY_BTNS['tokens-1150']}
                includes={['1,000 + 150 bonus tokens', 'Never expires']}
                activeKey={tokenLoadingKey}
                currentBalance={wallet.loading ? 0 : wallet.balance}
                onQuickPay={handleTokenQuickPay}
              />
              <TokenPackCard
                id="tokens-6000" name="6,000 Tokens" price="$59.99"
                badge="Mega Pack" badgeEmoji="👑"
                buyBtnId={BUY_BTNS['tokens-6000']}
                includes={['5,000 + 1,000 bonus tokens', 'Never expires', 'Best per-token price']}
                activeKey={tokenLoadingKey}
                currentBalance={wallet.loading ? 0 : wallet.balance}
                onQuickPay={handleTokenQuickPay}
              />
            </div>

            {/* ── Referral Section ─────────────────────────────────────── */}
            {user && <ReferralSection userId={user.id} />}

            <div className="p-5 rounded-2xl mt-8" style={{ background: 'hsl(224 15% 7%)', border: '1px solid rgba(100,120,200,0.14)' }}>
              <p className="text-sm font-black text-white mb-4" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>💡 Token Cost Guide</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Chat message',     cost: '1 token', color: GREEN },
                  { label: 'Image generation', cost: '50–100',  color: GREEN },
                  { label: 'Short video',      cost: '10 tokens', color: GOLD },
                  { label: 'Premium video',    cost: '50 tokens', color: RED },
                ].map(({ label, cost, color }) => (
                  <div key={label} className="p-3 rounded-xl text-center"
                    style={{ background: `${color}08`, border: `1px solid ${color}33` }}>
                    <p className="text-xl font-black" style={{ color }}>{cost}</p>
                    <p className="text-[11px] mt-1" style={{ color: 'rgba(160,180,220,0.55)' }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>
            <PaymentBadges />
          </div>
        )}

        {/* ── BUILDER CREDITS ───────────────────────────────────────────────── */}
        {tab === 'builder' && (
          <div>
            <div className="mb-8">
              <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: VIOLET }}>Builder Credits</p>
              <h2 className="text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Keep Building. <span style={{ color: VIOLET }}>Never Stop.</span>
              </h2>
              <p className="text-sm mt-1" style={{ color: 'rgba(160,180,220,0.5)' }}>
                New users get 3,000 free credits. Credits power the Website Builder Studio.
              </p>
            </div>

            {builderCredits === 0 && (
              <div className="mb-6 p-5 rounded-2xl flex items-center gap-4"
                style={{ background: `${VIOLET}10`, border: `1px solid ${VIOLET}44` }}>
                <Building2 className="w-8 h-8 shrink-0" style={{ color: VIOLET }} />
                <div>
                  <p className="font-black text-white">Builder credits empty</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(190,180,220,0.7)' }}>Add more credits to keep building.</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <BuilderCard id="builder-5k" name="5K Credits" price="$4.99"
                includes={['5,000 builder credits', '~10 static websites', 'Never expires']}
                loading={loadingId === 'builder-5k'} onBuy={() => handleBuy('builder-5k')} />
              <BuilderCard id="builder-15k" name="15K Credits" price="$12.99"
                badge="Best Value" badgeEmoji="🔥"
                includes={['15,000 builder credits', '~16 React apps', 'Never expires']}
                loading={loadingId === 'builder-15k'} onBuy={() => handleBuy('builder-15k')} />
              <BuilderCard id="builder-50k" name="50K Credits" price="$39.99"
                badge="Pro Pack" badgeEmoji="💎"
                includes={['50,000 builder credits', '~33 fullstack apps', 'Best per-credit price']}
                loading={loadingId === 'builder-50k'} onBuy={() => handleBuy('builder-50k')} />
            </div>

            <div className="p-5 rounded-2xl" style={{ background: 'hsl(224 15% 7%)', border: '1px solid rgba(100,120,200,0.14)' }}>
              <p className="text-sm font-black text-white mb-4" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>🏗️ Builder Credit Costs</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { label: 'Static website',        cost: 500 },
                  { label: 'React app',              cost: 900 },
                  { label: 'Fullstack starter',      cost: 1500 },
                  { label: 'AI edit request',        cost: 100 },
                  { label: 'Regenerate section',     cost: 150 },
                  { label: 'Export ZIP',             cost: 50 },
                  { label: 'Stripe scaffold',        cost: 350 },
                  { label: 'Supabase auth scaffold', cost: 350 },
                  { label: 'DB schema',              cost: 250 },
                ].map(({ label, cost }) => (
                  <div key={label} className="flex items-center justify-between p-2.5 rounded-xl"
                    style={{ background: `${VIOLET}08`, border: `1px solid ${VIOLET}22` }}>
                    <span className="text-xs" style={{ color: 'rgba(180,195,230,0.65)' }}>{label}</span>
                    <span className="text-xs font-black" style={{ color: VIOLET }}>{cost.toLocaleString()} cr</span>
                  </div>
                ))}
              </div>
            </div>
            <PaymentBadges />
          </div>
        )}

        {/* ── HISTORY ───────────────────────────────────────────────────────── */}
        {tab === 'history' && (
          <div>
            <div className="mb-6">
              <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: GREEN }}>Transaction History</p>
              <h2 className="text-2xl font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Every Move. <span style={{ color: GREEN }}>Tracked.</span>
              </h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Coins className="w-4 h-4" style={{ color: GREEN }} />
                  <h3 className="text-sm font-black text-white">Token Ledger</h3>
                  <span className="ml-auto text-xs font-black px-2 py-0.5 rounded-full"
                    style={{ background: `${GREEN}18`, color: GREEN }}>
                    {wallet.loading ? '…' : wallet.balance.toLocaleString()} bal
                  </span>
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {ledger.length === 0
                    ? <p className="text-center py-8 text-xs" style={{ color: 'rgba(130,150,190,0.4)' }}>No token transactions yet.</p>
                    : ledger.map(row => (
                      <div key={row.id} className="flex items-center gap-3 p-3 rounded-xl"
                        style={{ background: 'hsl(224 15% 7%)', border: '1px solid rgba(100,120,200,0.1)' }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm"
                          style={{ background: row.amount > 0 ? `${GREEN}18` : `${RED}18` }}>
                          {row.amount > 0 ? '↑' : '↓'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{row.reason}</p>
                          <p className="text-[10px] mt-0.5" style={{ color: 'rgba(130,150,190,0.5)' }}>{new Date(row.created_at).toLocaleString()}</p>
                        </div>
                        <span className="text-sm font-black shrink-0" style={{ color: row.amount > 0 ? GREEN : RED }}>
                          {row.amount > 0 ? '+' : ''}{row.amount}
                        </span>
                      </div>
                    ))
                  }
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-4 h-4" style={{ color: VIOLET }} />
                  <h3 className="text-sm font-black text-white">Builder Credit Ledger</h3>
                  <span className="ml-auto text-xs font-black px-2 py-0.5 rounded-full"
                    style={{ background: `${VIOLET}18`, color: VIOLET }}>
                    {builderCredits.toLocaleString()} bal
                  </span>
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {builderLedger.length === 0
                    ? <p className="text-center py-8 text-xs" style={{ color: 'rgba(130,150,190,0.4)' }}>No builder credit transactions yet.</p>
                    : builderLedger.map(row => (
                      <div key={row.id} className="flex items-center gap-3 p-3 rounded-xl"
                        style={{ background: 'hsl(224 15% 7%)', border: '1px solid rgba(100,120,200,0.1)' }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm"
                          style={{ background: row.amount > 0 ? `${VIOLET}18` : `${RED}18` }}>
                          {row.amount > 0 ? '↑' : '↓'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{row.reason}</p>
                          <p className="text-[10px] mt-0.5" style={{ color: 'rgba(130,150,190,0.5)' }}>{new Date(row.created_at).toLocaleString()}</p>
                        </div>
                        <span className="text-sm font-black shrink-0" style={{ color: row.amount > 0 ? VIOLET : RED }}>
                          {row.amount > 0 ? '+' : ''}{row.amount}
                        </span>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
            <PaymentBadges />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pb-20 md:pb-8 flex items-center justify-center gap-2 text-xs flex-wrap px-4"
        style={{ color: 'rgba(80,100,140,0.4)' }}>
        <Shield className="w-3.5 h-3.5" />
        Powered by Stripe · Cash App · Venmo · PayPal · MLTX © 2025
        <span>·</span>
        <a
          href="https://rajawins.vip"
          target="_blank"
          rel="noopener noreferrer"
          className="font-black transition-all"
          style={{ color: GOLD }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.textShadow = `0 0 10px ${GOLD}99`; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.textShadow = 'none'; }}
        >
          RAJAWINS.VIP
        </a>
      </div>
    </div>
  );
}
