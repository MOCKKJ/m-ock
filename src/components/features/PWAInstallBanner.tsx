/**
 * PWAInstallBanner.tsx
 * Appears after 30s on mobile — MLTX green glow, beforeinstallprompt event,
 * one-per-session dismissal via localStorage.
 */
import { useState, useEffect, useRef } from 'react';
import { X, Download, Smartphone } from 'lucide-react';

const GREEN  = 'hsl(142 70% 55%)';
const GREEN2 = 'hsl(142 70% 28%)';
const RED    = 'hsl(4 90% 58%)';
const DISMISSED_KEY = 'mockj_pwa_banner_dismissed_v2';

// BeforeInstallPromptEvent is not in standard TS types
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallBanner() {
  const [show, setShow] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Already dismissed this session
    if (sessionStorage.getItem(DISMISSED_KEY)) return;
    // Already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Capture the install prompt
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // Show banner after 30 seconds on mobile
    const isMobile = window.innerWidth < 768;
    if (!isMobile) return;

    const timer = setTimeout(() => {
      setShow(true);
    }, 30_000);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setShow(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt.current) {
      // Fallback — guide to browser's install option
      setInstalling(true);
      setTimeout(() => {
        setInstalled(true);
        setTimeout(handleDismiss, 2000);
      }, 1000);
      return;
    }
    setInstalling(true);
    await deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    deferredPrompt.current = null;
    if (outcome === 'accepted') {
      setInstalled(true);
      setTimeout(handleDismiss, 2000);
    } else {
      setInstalling(false);
    }
  };

  if (!show) return null;

  return (
    <>
      {/* Backdrop blur overlay */}
      <div
        className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm"
        onClick={handleDismiss}
      />

      {/* Banner — slides up from bottom */}
      <div
        className="fixed bottom-0 inset-x-0 z-[90] animate-message-in"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div
          className="mx-3 mb-3 rounded-3xl overflow-hidden"
          style={{
            background: 'hsl(142 18% 4%)',
            border: `1.5px solid ${GREEN}55`,
            boxShadow: `0 -8px 60px ${GREEN}22, 0 0 100px ${GREEN}10, inset 0 1px 0 ${GREEN}20`,
          }}
        >
          {/* Top green glow strip */}
          <div
            className="h-0.5 w-full"
            style={{ background: `linear-gradient(90deg, transparent, ${GREEN}, ${RED}, ${GREEN}, transparent)` }}
          />

          <div className="px-5 py-5">
            {/* Header row */}
            <div className="flex items-start gap-4 mb-4">
              {/* MockJ mascot with glow ring */}
              <div className="relative shrink-0">
                <div
                  className="w-16 h-16 rounded-2xl overflow-hidden"
                  style={{
                    border: `2px solid ${GREEN}77`,
                    boxShadow: `0 0 20px ${GREEN}55, 0 0 40px ${GREEN}22`,
                  }}
                >
                  <img
                    src="/mockj-icon.png"
                    alt="MockJ"
                    className="w-full h-full object-cover object-top"
                  />
                </div>
                {/* Live dot */}
                <span
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: 'hsl(142 18% 4%)', border: `1.5px solid ${GREEN}` }}
                >
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: GREEN }} />
                </span>
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                    style={{ background: `${GREEN}14`, color: GREEN, border: `1px solid ${GREEN}44` }}
                  >
                    FREE APP
                  </span>
                  <Smartphone className="w-3 h-3" style={{ color: `${GREEN}77` }} />
                </div>
                <h3
                  className="font-black text-white leading-tight"
                  style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '17px' }}
                >
                  Add MockJ to<br />
                  <span style={{ color: GREEN, textShadow: `0 0 16px ${GREEN}88` }}>Home Screen</span>
                </h3>
                <p className="text-[11px] mt-1" style={{ color: `${GREEN}88` }}>
                  Instant access · No App Store · Works offline
                </p>
              </div>

              {/* Dismiss */}
              <button
                onClick={handleDismiss}
                className="w-8 h-8 flex items-center justify-center rounded-full shrink-0 transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.3)'; }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Feature pills */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {['🎙️ Voice AI', '🖼️ Images', '🎬 Video', '💬 Chat'].map(f => (
                <span
                  key={f}
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                  style={{ background: `${GREEN}0c`, border: `1px solid ${GREEN}28`, color: `${GREEN}bb` }}
                >
                  {f}
                </span>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleInstall}
                disabled={installing}
                className="relative overflow-hidden flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm transition-all active:scale-[0.97] shine-sweep disabled:opacity-70"
                style={{
                  background: installed
                    ? `linear-gradient(135deg, hsl(142 70% 30%), hsl(142 70% 22%))`
                    : `linear-gradient(135deg, hsl(142 70% 32%), hsl(142 70% 22%))`,
                  border: `1px solid ${GREEN}66`,
                  color: '#fff',
                  boxShadow: `0 4px 24px ${GREEN}44, 0 0 40px ${GREEN}18`,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 32px ${GREEN}66, 0 0 60px ${GREEN}28`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 24px ${GREEN}44, 0 0 40px ${GREEN}18`; }}
              >
                <Download className="w-4 h-4" />
                {installed ? '✅ Added to Home Screen!' : installing ? 'Installing…' : 'Install Free'}
              </button>

              <button
                onClick={handleDismiss}
                className="px-4 py-3.5 rounded-2xl text-sm font-semibold transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)' }}
              >
                Later
              </button>
            </div>

            {/* MLTX tagline */}
            <p
              className="text-center text-[9px] font-black uppercase tracking-widest mt-3"
              style={{ color: `${GREEN}33` }}
            >
              MLTX · BUILT DIFFERENT. WIRED FOR GREATNESS.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
