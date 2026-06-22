
import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, Loader2, KeyRound, CheckCircle2, MessageSquare, Image, Volume2, Zap, ChevronDown, ChevronUp, X, AlertTriangle, ExternalLink, Clock, RefreshCw, Inbox } from 'lucide-react';
// Google OAuth removed — not configured for production domain
import { cn } from '@/lib/utils';
import logoImg from '@/assets/mockj-logo.png';

const GREEN  = 'hsl(142 70% 55%)';
const GREEN2 = 'hsl(142 70% 40%)';
const RED    = 'hsl(4 90% 58%)';
import { useAuthActions } from '@/hooks/useAuthActions';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

// ── SMTP Setup Banner ─────────────────────────────────────────────────────
const SMTP_BANNER_KEY = 'mockj_smtp_banner_dismissed';

function SmtpSetupBanner() {
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem(SMTP_BANNER_KEY) === 'true'
  );
  const [expanded, setExpanded] = useState(false);

  const handleDismiss = () => {
    localStorage.setItem(SMTP_BANNER_KEY, 'true');
    setDismissed(true);
  };

  if (dismissed) return null;

  const AMBER = 'hsl(38 95% 60%)';

  const steps = [
    { num: 1, text: 'Go to resend.com → Sign up free (100 emails/day)' },
    { num: 2, text: 'Create an API key in your Resend dashboard' },
    { num: 3, text: 'In OnSpace Cloud → Emails → configure custom SMTP:' },
    { num: 4, text: 'Host: smtp.resend.com · Port: 465 · User: resend · Password: your-api-key' },
    { num: 5, text: 'Set sender address (e.g. noreply@yourdomain.com)' },
  ];

  return (
    <div
      className="mb-5 rounded-2xl overflow-hidden"
      style={{
        background: 'hsl(38 95% 60% / 0.06)',
        border: '1px solid hsl(38 95% 60% / 0.35)',
        boxShadow: '0 0 20px hsl(38 95% 60% / 0.08)',
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${AMBER}18`, border: `1px solid ${AMBER}44` }}
        >
          <AlertTriangle className="w-4 h-4" style={{ color: AMBER }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black" style={{ color: AMBER }}>
            Email not arriving? Fix OTP delivery
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: `${AMBER}88` }}>
            Default Supabase SMTP has 3 emails/hour limit — set up Resend for free
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-6 h-6 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: `${AMBER}88` }}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleDismiss}
            className="w-6 h-6 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: `${AMBER}66` }}
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4" style={{ borderTop: '1px solid hsl(38 95% 60% / 0.18)' }}>
          <p className="text-[11px] font-semibold mt-3 mb-2" style={{ color: `${AMBER}cc` }}>
            Setup steps:
          </p>
          <ol className="space-y-2">
            {steps.map(({ num, text }) => (
              <li key={num} className="flex items-start gap-2.5">
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5"
                  style={{ background: `${AMBER}22`, color: AMBER, border: `1px solid ${AMBER}44` }}
                >
                  {num}
                </span>
                <span className="text-[11px] leading-relaxed" style={{ color: `${AMBER}aa` }}>
                  {text}
                </span>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap gap-2 mt-3">
            <a
              href="https://resend.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black transition-all"
              style={{
                background: `${AMBER}18`,
                border: `1px solid ${AMBER}55`,
                color: AMBER,
              }}
            >
              <ExternalLink className="w-3 h-3" />
              Open Resend.com
            </a>
            <button
              onClick={handleDismiss}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all"
              style={{
                background: 'transparent',
                border: '1px solid hsl(224 15% 20%)',
                color: 'hsl(210 20% 45%)',
              }}
            >
              Already configured — hide this
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const WELCOME_FEATURES = [
  {
    icon: MessageSquare,
    label: 'AI Chat',
    sub: '10 messages / day free',
    color: 'hsl(191 97% 55%)',
  },
  {
    icon: Image,
    label: 'Image Studio',
    sub: '3 generations / day free',
    color: 'hsl(265 80% 65%)',
  },
  {
    icon: Volume2,
    label: 'Voice AI',
    sub: 'Hey Mock — hands-free',
    color: 'hsl(4 90% 58%)',
  },
];

// ── Email provider deep-link ─────────────────────────────────────────────
interface EmailProvider {
  label: string;
  url: string;
  color: string;
  icon: string;
}

function detectEmailProvider(email: string): EmailProvider | null {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return { label: 'Open Gmail', url: 'https://mail.google.com', color: '#EA4335', icon: '📧' };
  }
  if (['outlook.com','hotmail.com','live.com','msn.com','windowslive.com'].includes(domain)) {
    return { label: 'Open Outlook', url: 'https://outlook.live.com', color: '#0078D4', icon: '📬' };
  }
  if (domain === 'yahoo.com' || domain === 'ymail.com') {
    return { label: 'Open Yahoo Mail', url: 'https://mail.yahoo.com', color: '#6001D2', icon: '📮' };
  }
  if (['icloud.com','me.com','mac.com'].includes(domain)) {
    return { label: 'Open iCloud Mail', url: 'https://www.icloud.com/mail', color: '#3A7BD5', icon: '🍎' };
  }
  if (domain.includes('proton') || domain.includes('pm.me')) {
    return { label: 'Open ProtonMail', url: 'https://mail.proton.me', color: '#6D4AFF', icon: '🔒' };
  }
  return null;
}

function InboxButton({ email }: { email: string }) {
  const provider = detectEmailProvider(email);
  if (!provider) return null;
  return (
    <a
      href={provider.url}
      target="_blank"
      rel="noopener noreferrer"
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all active:scale-[0.97]"
      style={{
        background: `${provider.color}14`,
        border: `1px solid ${provider.color}55`,
        color: provider.color,
        boxShadow: `0 0 14px ${provider.color}18`,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = `0 0 22px ${provider.color}38`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = `0 0 14px ${provider.color}18`; }}
    >
      <Inbox className="w-3.5 h-3.5" />
      {provider.icon} {provider.label}
      <ExternalLink className="w-3 h-3 opacity-60" />
    </a>
  );
}

// ── OTP Countdown + Resend ────────────────────────────────────────────────
const OTP_EXPIRY_SECS  = 600;  // 10-minute display window
const RESEND_COOLDOWN  = 60;   // 60-second resend cooldown

function OtpCountdown({
  sentAt,
  onResend,
  resendLoading,
}: {
  sentAt: number;
  onResend: () => void;
  resendLoading: boolean;
}) {
  const CYAN = 'hsl(191 97% 55%)';
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsed, setElapsed] = useState(Math.floor((Date.now() - sentAt) / 1000));

  useEffect(() => {
    tickRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - sentAt) / 1000));
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [sentAt]);

  const remaining   = Math.max(0, OTP_EXPIRY_SECS - elapsed);
  const cooldownLeft = Math.max(0, RESEND_COOLDOWN - elapsed);
  const canResend   = cooldownLeft === 0 && !resendLoading;
  const expired     = remaining === 0;

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  const timerColor = expired
    ? 'hsl(4 90% 58%)'
    : remaining < 60
    ? 'hsl(38 95% 60%)'
    : CYAN;

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl"
      style={{
        background: expired ? 'hsl(4 90% 58% / 0.06)' : 'hsl(191 97% 55% / 0.06)',
        border: `1px solid ${timerColor.replace(')', ' / 0.25)').replace('hsl(', 'hsl(')}`,
      }}
    >
      {/* Timer display */}
      <div className="flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: timerColor }} />
        {expired ? (
          <span className="text-xs font-semibold" style={{ color: timerColor }}>
            Code expired — request a new one
          </span>
        ) : (
          <span className="text-xs" style={{ color: `${timerColor}cc` }}>
            Code expires in{' '}
            <span className="font-black tabular-nums" style={{ color: timerColor, fontVariantNumeric: 'tabular-nums' }}>
              {mm}:{ss}
            </span>
          </span>
        )}
      </div>

      {/* Resend button */}
      <button
        type="button"
        onClick={onResend}
        disabled={!canResend}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        style={{
          background: canResend ? `${CYAN}18` : 'transparent',
          border: `1px solid ${canResend ? `${CYAN}55` : `${CYAN}22`}`,
          color: canResend ? CYAN : `${CYAN}66`,
        }}
      >
        {resendLoading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <RefreshCw className="w-3 h-3" />
        )}
        {resendLoading
          ? 'Sending…'
          : cooldownLeft > 0
          ? `Resend (${cooldownLeft}s)`
          : 'Resend code'
        }
      </button>
    </div>
  );
}

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  // Welcome step — shown before the auth form for new visitors
  const [step, setStep] = useState<'welcome' | 'auth'>(() =>
    searchParams.get('reset') === 'true' ? 'auth' : 'welcome'
  );
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'reset'>(() =>
    searchParams.get('reset') === 'true' ? 'reset' : 'login'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [otp, setOtp] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  // Forgot password state
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  // Reset password (after clicking email link) state
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const { sendOtp, verifyOtpAndSetPassword, signInWithPassword, loading, otpSent, setOtpSent } =
    useAuthActions();
  const [otpSentAt, setOtpSentAt] = useState<number | null>(null);

  // If the URL gains ?reset=true after a PASSWORD_RECOVERY redirect, switch to reset mode
  useEffect(() => {
    if (searchParams.get('reset') === 'true') {
      setMode('reset');
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await signInWithPassword(email, password, rememberMe);
  };

  const handleSignupStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendOtp(email);
    setOtpSentAt(Date.now());
  };

  const handleResendOtp = async () => {
    await sendOtp(email);
    setOtpSentAt(Date.now());
  };

  const handleSignupStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    await verifyOtpAndSetPassword(email, otp, password, username);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { toast.error('Enter your email first'); return; }
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth?reset=true`,
    });
    setForgotLoading(false);
    if (error) {
      // Detect Supabase rate-limit error and show a friendly message
      const isRateLimit =
        error.message.toLowerCase().includes('rate limit') ||
        error.message.toLowerCase().includes('too many') ||
        error.message.toLowerCase().includes('email rate limit exceeded') ||
        error.status === 429;
      toast.error(isRateLimit
        ? 'Too many attempts — wait a few minutes before trying again 🕐'
        : error.message
      );
    } else {
      setForgotSent(true);
      toast.success('Reset link sent! Check your email 📬');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmNewPassword) { toast.error('Passwords do not match'); return; }
    setResetLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setResetLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Password updated! You are now signed in 🔥');
      setMode('login');
      setNewPassword('');
      setConfirmNewPassword('');
    }
  };

  const headingText = {
    login: 'Welcome back 👋',
    signup: 'Join MockJ 🔥',
    forgot: 'Reset Password 🔑',
    reset: 'New Password 🔒',
  }[mode];

  const subtitleText = {
    login: 'Sign in to your MockJ account',
    signup: 'Create your account to get started',
    forgot: 'We\'ll send you a reset link',
    reset: 'Choose a new password',
  }[mode];

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#020a04' }}>
      {/* Background glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl" style={{ background: `${GREEN}09` }} />
        <div className="absolute bottom-1/4 left-1/3 w-64 h-64 rounded-full blur-3xl" style={{ background: `${GREEN2}07` }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-48 pointer-events-none" style={{ background: `radial-gradient(ellipse at top, ${GREEN}0e 0%, transparent 70%)` }} />
        <div className="absolute bottom-0 right-1/4 w-80 h-48 pointer-events-none" style={{ background: `radial-gradient(ellipse at bottom, ${RED}08 0%, transparent 70%)` }} />
      </div>

      <div className="relative w-full max-w-md">
        {/* ── Welcome Step ─────────────────────────────────────────── */}
        {step === 'welcome' && (
          <div className="animate-message-in">
            {/* Brand card */}
            <div
              className="relative flex flex-col items-center gap-5 px-6 pt-8 pb-6 rounded-3xl border overflow-hidden"
              style={{
                background: `linear-gradient(160deg, hsl(142 20% 5%) 0%, ${GREEN}08 100%)`,
                borderColor: `${GREEN}44`,
                boxShadow: `0 0 40px ${GREEN}12, 0 2px 60px ${GREEN}08`,
              }}
            >
              {/* Top radial glow */}
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at top, ${GREEN}25 0%, transparent 70%)` }}
              />

              {/* Logo */}
              <Link to="/">
                <div
                  className="relative w-20 h-20 rounded-2xl overflow-hidden cursor-pointer hover:scale-105 transition-transform"
                  style={{ boxShadow: `0 0 30px ${GREEN}55, 0 0 60px ${GREEN}22`, border: `2px solid ${GREEN}77` }}
                >
                  <img src="/mockj-icon.png" alt="MockJ" className="w-full h-full object-cover object-top" />
                </div>
              </Link>

              {/* Heading */}
              <div className="text-center space-y-1.5">
                <div className="flex items-center justify-center gap-1.5">
                  <span className="font-black text-2xl" style={{ fontFamily: 'Space Grotesk, sans-serif', background: `linear-gradient(135deg, ${GREEN}, hsl(142 70% 42%), ${RED})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>MockJ</span>
                  <span className="text-xl font-black" style={{ color: RED, textShadow: `0 0 12px ${RED}99` }}>4</span>
                  <span
                    className="text-[9px] font-black px-2 py-0.5 rounded-full ml-1"
                    style={{ background: `${GREEN}18`, color: GREEN, border: `1px solid ${GREEN}44` }}
                  >
                    FREE
                  </span>
                </div>
                <p className="text-xs font-semibold" style={{ color: `${GREEN}99` }}>Built Different. Wired for Greatness. 🔥</p>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto pt-1">
                  Your voice-powered AI that chats, creates images, generates videos, and remembers everything.
                </p>
              </div>

              {/* Feature highlights */}
              <div className="w-full space-y-2">
                {WELCOME_FEATURES.map(({ icon: Icon, label, sub, color }) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                    style={{ background: 'hsl(224 15% 11%)', border: '1px solid hsl(224 15% 17%)' }}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: color.replace(')', ' / 0.12)').replace('hsl(', 'hsl('),
                        border: `1px solid ${color.replace(')', ' / 0.3)').replace('hsl(', 'hsl(')}`,
                      }}
                    >
                      <Icon className="w-3.5 h-3.5" style={{ color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground leading-none">{label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">{sub}</p>
                    </div>
                    <div className="ml-auto">
                      <Zap className="w-3 h-3" style={{ color }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Primary CTA */}
              <button
                onClick={() => setStep('auth')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all active:scale-[0.97] relative overflow-hidden shine-sweep"
                style={{
                  background: `linear-gradient(135deg, hsl(142 70% 28%), hsl(142 70% 22%))`,
                  border: `1px solid ${GREEN}66`,
                  color: '#fff',
                  boxShadow: `0 4px 24px ${GREEN}44, 0 0 40px ${GREEN}18`,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 32px ${GREEN}66, 0 0 60px ${GREEN}28`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 24px ${GREEN}44, 0 0 40px ${GREEN}18`; }}
              >
                <Mail className="w-4 h-4" />
                Continue with Email
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Social proof */}
              <div
                className="flex items-center justify-center gap-3 w-full px-2 py-2 rounded-xl border text-[9px] font-semibold text-muted-foreground"
                style={{ background: 'hsl(224 15% 7%)', borderColor: 'hsl(224 15% 13%)' }}
              >
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[hsl(142_70%_55%)] animate-pulse inline-block" />
                  No credit card
                </span>
                <span className="w-px h-3 bg-border" />
                <span>Cancel anytime</span>
                <span className="w-px h-3 bg-border" />
                <span>Instant access</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Auth Step (existing form) ───────────────────────────────── */}
        {step === 'auth' && (
          <>
            {/* Logo */}
            <div className="flex flex-col items-center mb-8">
              <Link to="/">
                <div className="w-16 h-16 rounded-2xl overflow-hidden mb-4 cursor-pointer hover:scale-105 transition-transform"
                  style={{ border: `2px solid ${GREEN}66`, boxShadow: `0 0 24px ${GREEN}55` }}>
                  <img src="/mockj-icon.png" alt="MockJ" className="w-full h-full object-cover object-top" />
                </div>
              </Link>
              <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                {headingText}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{subtitleText}</p>
            </div>

            {/* SMTP setup banner — helps admins fix email delivery */}
            <SmtpSetupBanner />

          {/* Card */}
            <div className="rounded-2xl p-6 shadow-xl" style={{ background: 'hsl(142 15% 5%)', border: `1px solid ${GREEN}33`, boxShadow: `0 0 40px ${GREEN}0a` }}>
              {/* Mode Toggle — hide on forgot/reset */}
              {mode !== 'forgot' && mode !== 'reset' && (
                <div className="flex rounded-xl border border-border p-1 mb-6 bg-[hsl(224_20%_5%)]">
                  {(['login', 'signup'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => { setMode(m); setOtpSent(false); }}
                      className="flex-1 py-2 rounded-lg text-sm font-bold transition-all duration-200"
                      style={{
                        background: mode === m ? GREEN : 'transparent',
                        color: mode === m ? '#000' : 'rgba(150,180,160,0.5)',
                        boxShadow: mode === m ? `0 0 16px ${GREEN}44` : 'none',
                      }}
                    >
                      {m === 'login' ? 'Sign In' : 'Sign Up'}
                    </button>
                  ))}
                </div>
              )}

              {/* Login Form */}
              {mode === 'login' && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <InputField
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    icon={<Mail className="w-4 h-4" />}
                    placeholder="you@example.com"
                    required
                  />
                  <InputField
                    label="Password"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={setPassword}
                    icon={<Lock className="w-4 h-4" />}
                    placeholder="Your password"
                    required
                    suffix={
                      <button type="button" onClick={() => setShowPass(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    }
                  />
                  {/* Remember Me + Forgot Password row */}
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer select-none group">
                      <button
                        type="button"
                        onClick={() => setRememberMe(v => !v)}
                        className={cn(
                          'w-9 h-5 rounded-full transition-all duration-200 relative shrink-0',
                          rememberMe ? 'bg-[hsl(191_97%_55%)]' : 'bg-[hsl(224_15%_18%)]'
                        )}
                      >
                        <span className={cn(
                          'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200 shadow-sm',
                          rememberMe ? 'left-[18px]' : 'left-0.5'
                        )} />
                      </button>
                      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                        Remember me
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => { setForgotSent(false); setMode('forgot'); }}
                      className="text-xs text-muted-foreground hover:text-[hsl(191_97%_55%)] transition-colors underline-offset-2 hover:underline"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <SubmitButton loading={loading} label="Sign In" />
                </form>
              )}

              {/* Forgot Password Form */}
              {mode === 'forgot' && (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  {!forgotSent ? (
                    <>
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-[hsl(191_97%_55%_/_0.06)] border border-[hsl(191_97%_55%_/_0.2)]">
                        <KeyRound className="w-4 h-4 text-[hsl(191_97%_55%)] shrink-0" />
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Enter your email and we'll send you a link to reset your password.
                        </p>
                      </div>
                      <InputField
                        label="Email"
                        type="email"
                        value={email}
                        onChange={setEmail}
                        icon={<Mail className="w-4 h-4" />}
                        placeholder="you@example.com"
                        required
                      />
                      <SubmitButton loading={forgotLoading} label="Send Reset Link" />
                      <button
                        type="button"
                        onClick={() => setMode('login')}
                        className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        ← Back to Sign In
                      </button>
                    </>
                  ) : (
                    <div className="text-center space-y-4 py-2">
                      <div className="w-12 h-12 rounded-2xl bg-[hsl(142_70%_55%_/_0.1)] border border-[hsl(142_70%_55%_/_0.3)] flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-6 h-6 text-[hsl(142_70%_55%)]" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Check your inbox</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          We sent a reset link to <strong>{email}</strong>.
                          Click the link in the email to set a new password.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMode('login')}
                        className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        ← Back to Sign In
                      </button>
                    </div>
                  )}
                </form>
              )}

              {/* Reset Password Form — shown after clicking email link */}
              {mode === 'reset' && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-[hsl(265_80%_65%_/_0.06)] border border-[hsl(265_80%_65%_/_0.2)]">
                    <KeyRound className="w-4 h-4 text-[hsl(265_80%_65%)] shrink-0" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      You're verified. Choose a strong new password for your MockJ account.
                    </p>
                  </div>
                  <InputField
                    label="New Password (min. 6 characters)"
                    type={showNewPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={setNewPassword}
                    icon={<Lock className="w-4 h-4" />}
                    placeholder="Enter new password"
                    required
                    suffix={
                      <button type="button" onClick={() => setShowNewPass(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
                        {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    }
                  />
                  <InputField
                    label="Confirm New Password"
                    type="password"
                    value={confirmNewPassword}
                    onChange={setConfirmNewPassword}
                    icon={<Lock className="w-4 h-4" />}
                    placeholder="Repeat new password"
                    required
                  />
                  {newPassword && confirmNewPassword && newPassword !== confirmNewPassword && (
                    <p className="text-[11px] text-destructive flex items-center gap-1.5">
                      ✗ Passwords do not match
                    </p>
                  )}
                  <SubmitButton loading={resetLoading} label="Update Password" />
                </form>
              )}

              {/* Signup Form — Step 1: Email */}
              {mode === 'signup' && !otpSent && (
                <form onSubmit={handleSignupStep1} className="space-y-4">
                  <InputField
                    label="Username"
                    type="text"
                    value={username}
                    onChange={setUsername}
                    icon={<User className="w-4 h-4" />}
                    placeholder="Your username"
                  />
                  <InputField
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    icon={<Mail className="w-4 h-4" />}
                    placeholder="you@example.com"
                    required
                  />
                  <InputField
                    label="Password"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={setPassword}
                    icon={<Lock className="w-4 h-4" />}
                    placeholder="Min. 6 characters"
                    required
                    suffix={
                      <button type="button" onClick={() => setShowPass(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    }
                  />
                  <SubmitButton loading={loading} label="Send Verification Code" />
                </form>
              )}

              {/* Signup Form — Step 2: OTP */}
              {mode === 'signup' && otpSent && (
                <form onSubmit={handleSignupStep2} className="space-y-4">
                  <div className="p-3 rounded-lg bg-[hsl(191_97%_55%_/_0.08)] border border-[hsl(191_97%_55%_/_0.25)] text-sm text-[hsl(191_97%_75%)]">
                    OTP sent to <strong>{email}</strong>. Check your inbox 📬
                  </div>

                  {/* Smart inbox deeplink */}
                  <InboxButton email={email} />

                  {/* Countdown + Resend */}
                  {otpSentAt && (
                    <OtpCountdown
                      sentAt={otpSentAt}
                      onResend={handleResendOtp}
                      resendLoading={loading}
                    />
                  )}

                  <InputField
                    label="Verification Code (4 digits)"
                    type="text"
                    value={otp}
                    onChange={setOtp}
                    icon={<Lock className="w-4 h-4" />}
                    placeholder="Enter 4-digit code"
                    required
                    maxLength={4}
                    autoFocus
                    inputMode="numeric"
                    pattern="[0-9]*"
                  />
                  <SubmitButton loading={loading} label="Verify & Create Account" />
                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ← Back
                  </button>
                </form>
              )}
            </div>

            <p className="text-center text-xs text-muted-foreground mt-4">
              By continuing, you agree to MockJ's terms of service.
            </p>

            {/* Back to welcome */}
            {mode !== 'reset' && (
              <button
                type="button"
                onClick={() => setStep('welcome')}
                className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
              >
                ← Back
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function InputField({
  label, type, value, onChange, icon, placeholder, required, suffix, maxLength, autoFocus, inputMode, pattern,
}: {
  label: string; type: string; value: string; onChange: (v: string) => void;
  icon: React.ReactNode; placeholder: string; required?: boolean; suffix?: React.ReactNode;
  maxLength?: number; autoFocus?: boolean; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; pattern?: string;
}) {
  const G = 'hsl(142 70% 55%)';
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      // Small delay to let the form render fully before focusing
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: `${G}99` }}>{label}</label>
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2.5 transition-all duration-150"
        style={{ background: 'hsl(142 15% 6%)', border: `1px solid ${G}28` }}
        onFocus={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `${G}55`; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 12px ${G}18`; }}
        onBlur={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `${G}28`; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
      >
        <span className="shrink-0" style={{ color: `${G}77` }}>{icon}</span>
        <input
          ref={inputRef}
          type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} required={required} maxLength={maxLength}
          inputMode={inputMode} pattern={pattern}
          className="flex-1 bg-transparent text-sm text-white outline-none placeholder:opacity-40"
          style={{ caretColor: G }}
        />
        {suffix}
      </div>
    </div>
  );
}

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  const G = 'hsl(142 70% 55%)';
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 font-black py-3 rounded-xl text-sm transition-all duration-200 active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed mt-2 relative overflow-hidden shine-sweep"
      style={{ background: 'linear-gradient(135deg, hsl(142 70% 28%), hsl(142 70% 22%))', border: `1px solid ${G}66`, color: '#fff', boxShadow: `0 4px 24px ${G}44` }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 32px ${G}66`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 24px ${G}44`; }}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{label} <ArrowRight className="w-4 h-4" /></>}
    </button>
  );
}
