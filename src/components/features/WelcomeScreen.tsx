import { useNavigate } from 'react-router-dom';
import { useTokenWallet } from '@/hooks/useTokenWallet';
import { Flame, X } from 'lucide-react';
import { useState } from 'react';

interface WelcomeScreenProps {
  onSuggestion: (text: string) => void;
  onOpenImageStudio?: () => void;
  userName?: string;
}

const GREEN  = 'hsl(142 70% 55%)';
const GREEN2 = 'hsl(142 70% 40%)';
const RED    = 'hsl(4 90% 58%)';

/** MockJ MLTX mascot hero with green glow ring */
function MockJMascot() {
  return (
    <div className="relative flex flex-col items-center gap-3">
      {/* Outer glow rings */}
      <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
        {/* Ambient outer glow */}
        <div
          className="absolute inset-0 rounded-full animate-green-pulse"
          style={{ background: `radial-gradient(circle, ${GREEN}18 0%, transparent 70%)`, transform: 'scale(1.6)' }}
        />
        {/* Spinning gradient ring */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from 0deg, ${GREEN}, ${GREEN2}, ${RED}, ${GREEN2}, ${GREEN})`,
            animation: 'orb-rotate 4s linear infinite',
            padding: '2.5px',
            borderRadius: '50%',
          }}
        >
          <div className="w-full h-full rounded-full" style={{ background: 'hsl(142 20% 5%)' }} />
        </div>

        {/* Pulse ring */}
        <div
          className="absolute rounded-full"
          style={{
            inset: '-4px',
            border: `1px solid ${GREEN}44`,
            animation: 'orb-pulse 2.8s ease-in-out infinite',
          }}
        />

        {/* Mascot image */}
        <div
          className="relative w-[100px] h-[100px] rounded-full overflow-hidden z-10"
          style={{
            border: `2px solid ${GREEN}88`,
            boxShadow: `0 0 24px ${GREEN}55, 0 0 48px ${GREEN}22, inset 0 0 16px ${GREEN}0a`,
          }}
        >
          <img
            src="/mockj-icon.png"
            alt="MockJ — The MLTX AI Mascot"
            className="w-full h-full object-cover object-top"
          />
        </div>
      </div>

      {/* MLTX tagline badge */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black"
        style={{
          background: `${GREEN}10`,
          border: `1px solid ${GREEN}44`,
          color: GREEN,
          boxShadow: `0 0 12px ${GREEN}20`,
        }}
      >
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: GREEN }} />
        MLTX · BUILT DIFFERENT. WIRED FOR GREATNESS.
      </div>
    </div>
  );
}

export default function WelcomeScreen({ onSuggestion: _onSuggestion, onOpenImageStudio: _onOpenImageStudio, userName: _userName }: WelcomeScreenProps) {
  const navigate = useNavigate();
  const { wallet } = useTokenWallet();
  const [streakDismissed, setStreakDismissed] = useState(false);

  const showStreakChip =
    !streakDismissed &&
    !wallet.loading &&
    wallet.streak.current > 0 &&
    wallet.streak.canClaimToday;

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-8 overflow-y-auto">
      <div className="w-full max-w-xl flex flex-col items-center gap-5">

        {/* MockJ MLTX mascot with green glow */}
        <MockJMascot />

        {/* Streak chip */}
        {showStreakChip && (
          <button
            onClick={() => navigate('/tokens?tab=earn')}
            className="relative flex items-center gap-2.5 px-4 py-2.5 rounded-full transition-all duration-150 active:scale-[0.97]"
            style={{
              background: 'hsl(38 95% 60% / 0.1)',
              border: '1px solid hsl(38 95% 60% / 0.5)',
              boxShadow: '0 0 18px hsl(38 95% 60% / 0.18)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 30px hsl(38 95% 60% / 0.4)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(38 95% 60% / 0.9)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 18px hsl(38 95% 60% / 0.18)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(38 95% 60% / 0.5)';
            }}
          >
            <Flame className="w-4 h-4 animate-pulse shrink-0" style={{ color: 'hsl(38 95% 60%)' }} />
            <span className="text-sm font-bold" style={{ color: 'hsl(38 95% 72%)' }}>
              🔥 Day {wallet.streak.current} streak — claim +{wallet.streak.todayReward} tokens
            </span>
            <span className="w-1.5 h-1.5 rounded-full animate-ping shrink-0" style={{ background: 'hsl(38 95% 60%)' }} />
            <span
              role="button"
              onClick={e => { e.stopPropagation(); setStreakDismissed(true); }}
              className="ml-1 w-5 h-5 rounded-full flex items-center justify-center hover:bg-[hsl(38_95%_60%_/_0.2)] transition-colors shrink-0"
              style={{ color: 'hsl(38 95% 60% / 0.6)' }}
            >
              <X className="w-3 h-3" />
            </span>
          </button>
        )}

        {/* Footer tagline */}
        <p
          className="text-[10px] font-black uppercase tracking-widest mt-1"
          style={{ color: `${GREEN}33`, textShadow: `0 0 12px ${GREEN}20` }}
        >
          MockJ 4 · MLTX · Voice · Images · Video · Code
        </p>
      </div>
    </div>
  );
}
