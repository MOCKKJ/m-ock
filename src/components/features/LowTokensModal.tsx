/**
 * LowTokensModal.tsx
 * Shown when a user runs out of tokens mid-session.
 * Offers: buy token packs (one-time) OR get a subscription.
 */

import { useState } from 'react';
import {
  Coins, Zap, Crown, Flame, X, ShoppingCart, ArrowRight,
  Sparkles, Gift,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import logoImg from '@/assets/mockj-logo.png';

interface LowTokensModalProps {
  /** How many tokens were required for the blocked action */
  required?: number;
  /** The user's current balance (could be 0) */
  balance?: number;
  onClose: () => void;
  onOpenPricing: () => void;
}

const QUICK_PACKS = [
  {
    id: 'starter',
    name: 'Starter Pack',
    tokens: 500,
    price: '$4.99',
    badge: null,
    highlight: false,
  },
  {
    id: 'creator',
    name: 'Creator Pack',
    tokens: 1500,
    price: '$9.99',
    badge: '⭐ Most Popular',
    highlight: true,
  },
  {
    id: 'pro_pack',
    name: 'Pro Pack',
    tokens: 5000,
    price: '$24.99',
    badge: '🔥 Best Value',
    highlight: false,
  },
];

export default function LowTokensModal({
  required,
  balance = 0,
  onClose,
  onOpenPricing,
}: LowTokensModalProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'tokens' | 'subscribe'>('tokens');

  const shortfall = required ? Math.max(0, required - balance) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-[hsl(224_20%_7%)] border border-[hsl(4_90%_58%_/_0.35)] rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
        style={{ boxShadow: '0 0 60px hsl(4 90% 58% / 0.15)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden ring-2 ring-[hsl(4_90%_58%_/_0.5)] shrink-0">
              <img src={logoImg} alt="MockJ" className="w-full h-full object-cover" />
            </div>
            <div>
              <h2
                className="font-black text-base text-foreground leading-tight"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                {balance === 0 ? "You're out of tokens 🪫" : 'Not enough tokens'}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {shortfall
                  ? `Need ${shortfall} more tokens — you have ${balance}`
                  : `Balance: ${balance} tokens`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center border border-border text-muted-foreground hover:text-foreground transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-0 border-b border-border">
          {([
            { id: 'tokens', icon: Coins, label: 'Buy Tokens' },
            { id: 'subscribe', icon: Crown, label: 'Go Unlimited' },
          ] as const).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-all border-b-2',
                tab === id
                  ? id === 'subscribe'
                    ? 'border-[hsl(191_97%_55%)] text-[hsl(191_97%_55%)]'
                    : 'border-[hsl(38_95%_60%)] text-[hsl(38_95%_60%)]'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab: Buy Tokens */}
        {tab === 'tokens' && (
          <div className="p-4 space-y-3">
            <p className="text-[11px] text-muted-foreground px-0.5">
              One-time purchase — tokens never expire. Use for chat, images, videos, and voice.
            </p>
            {QUICK_PACKS.map(pack => (
              <button
                key={pack.id}
                onClick={() => {
                  onClose();
                  navigate('/tokens?tab=shop');
                }}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all duration-200 text-left group hover:scale-[1.01] active:scale-[0.99]',
                  pack.highlight
                    ? 'border-[hsl(38_95%_60%_/_0.5)] bg-[hsl(38_95%_60%_/_0.06)] shadow-[0_0_20px_hsl(38_95%_60%_/_0.08)]'
                    : 'border-border bg-[hsl(224_15%_9%)] hover:border-[hsl(38_95%_60%_/_0.35)]'
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                      pack.highlight
                        ? 'bg-[hsl(38_95%_60%_/_0.15)] border border-[hsl(38_95%_60%_/_0.4)]'
                        : 'bg-[hsl(224_15%_13%)] border border-border'
                    )}
                  >
                    <Coins className={cn('w-4 h-4', pack.highlight ? 'text-[hsl(38_95%_60%)]' : 'text-muted-foreground')} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground">{pack.name}</span>
                      {pack.badge && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[hsl(38_95%_60%)] text-[hsl(224_20%_6%)]">
                          {pack.badge}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {pack.tokens.toLocaleString()} tokens
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={cn(
                      'text-base font-black',
                      pack.highlight ? 'text-[hsl(38_95%_60%)]' : 'text-foreground'
                    )}
                  >
                    {pack.price}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                </div>
              </button>
            ))}

            {/* View all packs CTA */}
            <button
              onClick={() => { onClose(); navigate('/tokens?tab=shop'); }}
              className="w-full py-3 rounded-xl border border-[hsl(38_95%_60%_/_0.3)] text-xs font-bold text-[hsl(38_95%_60%)] hover:bg-[hsl(38_95%_60%_/_0.08)] transition-all flex items-center justify-center gap-1.5"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              View all token packs
            </button>

            {/* Earn free tokens */}
            <button
              onClick={() => { onClose(); navigate('/tokens?tab=earn'); }}
              className="w-full py-2.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground transition-all flex items-center justify-center gap-1.5"
            >
              <Gift className="w-3.5 h-3.5" />
              Earn free tokens instead →
            </button>
          </div>
        )}

        {/* Tab: Subscribe */}
        {tab === 'subscribe' && (
          <div className="p-4 space-y-3">
            <p className="text-[11px] text-muted-foreground px-0.5">
              Unlimited chat, images, videos, and voice — no token counting, ever.
            </p>

            {/* Intro plan — Flash deal */}
            <div
              className="relative rounded-xl border p-4 flex flex-col gap-3"
              style={{
                borderColor: 'hsl(4 90% 58% / 0.5)',
                background: 'hsl(4 90% 58% / 0.05)',
                boxShadow: '0 0 24px hsl(4 90% 58% / 0.1)',
              }}
            >
              <div className="absolute -top-2.5 left-4 px-2.5 py-0.5 rounded-full text-[9px] font-black bg-[hsl(4_90%_58%)] text-[hsl(224_20%_6%)]">
                🔥 Flash Deal — Limited Time
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-[hsl(4_90%_58%)]" />
                    <span className="text-sm font-black text-foreground">MockJ Intro</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Full Pro access — cancel anytime</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-[hsl(4_90%_58%)]">$2.99</span>
                  <p className="text-[10px] text-muted-foreground">/mo</p>
                </div>
              </div>
              <ul className="space-y-1">
                {['Unlimited chat, images & video', 'ElevenLabs voice output', 'Deep Reasoning mode', 'Priority AI models'].map(f => (
                  <li key={f} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Sparkles className="w-3 h-3 text-[hsl(4_90%_58%)] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => { onClose(); onOpenPricing(); }}
                className="w-full py-3 rounded-xl text-sm font-black transition-all active:scale-95 flex items-center justify-center gap-2"
                style={{
                  background: 'hsl(4 90% 58%)',
                  color: 'hsl(224 20% 6%)',
                  boxShadow: '0 4px 20px hsl(4 90% 58% / 0.35)',
                }}
              >
                <Zap className="w-4 h-4" />
                Upgrade Now — $2.99/mo
              </button>
            </div>

            {/* Pro plan */}
            <div
              className="rounded-xl border border-[hsl(191_97%_55%_/_0.3)] bg-[hsl(191_97%_55%_/_0.04)] p-4 flex items-center justify-between gap-4 cursor-pointer hover:border-[hsl(191_97%_55%_/_0.5)] transition-all"
              onClick={() => { onClose(); onOpenPricing(); }}
            >
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-[hsl(191_97%_55%)]" />
                <div>
                  <span className="text-sm font-bold text-foreground">MockJ Pro</span>
                  <p className="text-[10px] text-muted-foreground">Same unlimited features</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-base font-black text-[hsl(191_97%_55%)]">$50.99/mo</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </div>
          </div>
        )}

        {/* Bottom safe area spacer on mobile */}
        <div className="h-safe-bottom sm:hidden" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>
    </div>
  );
}
