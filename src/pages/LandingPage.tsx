
/**
 * MockJ 4 — Main Marketing Landing Page
 * Route: /landing
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mic, Code2, Brain, Globe, FileText, Zap, Bot, Image, Video,
  ChevronDown, ChevronUp, ArrowRight, Check, Crown, Star,
  MessageSquare, Cpu, Volume2, TrendingUp, Users,
} from 'lucide-react';
import logoImg from '@/assets/mockj-logo.png';
import heroBg from '@/assets/mocka-hero-bg.jpg';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

const RED    = 'hsl(4 90% 58%)';
const GREEN  = 'hsl(142 70% 55%)';
const GREEN2 = 'hsl(142 70% 40%)';
const VIOLET = 'hsl(265 80% 65%)';
const PINK   = 'hsl(310 80% 70%)';
const GOLD   = 'hsl(38 95% 65%)';

// ── Luxury sparkle field for hero ────────────────────────────────────────
const SPARKLE_COLORS = [GREEN, PINK, VIOLET, GOLD, 'rgba(255,255,255,0.9)', GREEN2, RED];
const HERO_SPARKLES = Array.from({ length: 55 }, (_, i) => ({
  id: i,
  left: `${(i * 1.85 + Math.sin(i * 0.7) * 12) % 100}%`,
  top:  `${(i * 2.1  + Math.cos(i * 0.9) * 18) % 100}%`,
  size: (i % 4 === 0) ? 4 : (i % 3 === 0) ? 3 : 2,
  dur:  `${3.5 + (i % 6)}s`,
  delay:`${(i * 0.38) % 8}s`,
  color: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
  isStar: i % 7 === 0,
}));

function HeroSparkles() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {HERO_SPARKLES.map(s => (
        <div
          key={s.id}
          className={s.isStar ? 'sparkle-star' : 'sparkle'}
          style={{
            left: s.left, top: s.top,
            width: s.size, height: s.size,
            background: s.color,
            boxShadow: `0 0 ${s.size * 5}px ${s.color}, 0 0 ${s.size * 10}px ${s.color}55`,
            animation: s.isStar
              ? `sparkle-twinkle ${s.dur} ease-in-out infinite`
              : `sparkle-drift ${s.dur} ease-in-out infinite`,
            animationDelay: s.delay,
          }}
        />
      ))}
    </div>
  );
}

// ─── Data ────────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: Mic, label: 'Voice Commands', desc: 'Speak naturally — MockJ executes. Create images, write code, or ask questions hands-free with our advanced voice recognition engine.', color: 'red' },
  { icon: Brain, label: 'Project Memory', desc: 'MockJ remembers your projects, preferences, and context across sessions. No more re-explaining who you are or what you\'re building.', color: 'violet' },
  { icon: Code2, label: 'Code Generation', desc: 'Generate, refactor, debug, and explain code in any language. From quick scripts to full applications — your AI pair programmer.', color: 'red' },
  { icon: Globe, label: 'Website Building', desc: 'Describe your idea and get a complete website structure, copy, and technical spec. Integrated with your favorite frameworks.', color: 'violet' },
  { icon: FileText, label: 'Document Analysis', desc: 'Upload PDFs, docs, or pastes — MockJ reads, summarizes, extracts data, and answers questions about any document in seconds.', color: 'red' },
  { icon: Zap, label: 'Task Automation', desc: 'Define workflows, schedule tasks, and let MockJ handle repetitive work. From daily reports to multi-step research pipelines.', color: 'violet' },
  { icon: Image, label: 'Image Generation', desc: 'Create professional visuals, edit with image-to-image tools, maintain character consistency, and export with commercial license.', color: 'red' },
  { icon: Bot, label: 'Autonomous Agents', desc: 'Deploy AI agents that browse the web, analyze data, write files, and execute multi-step plans without constant supervision.', color: 'violet' },
];

const USE_CASES = [
  { role: 'Developer', desc: 'Scaffold apps, review PRs, generate tests, debug errors — all in one chat.' },
  { role: 'Designer', desc: 'Generate reference images, create variations, and build moodboards with voice control.' },
  { role: 'Content Creator', desc: 'Write blogs, scripts, captions, and social posts 10× faster with AI ghostwriting.' },
  { role: 'Entrepreneur', desc: 'Analyze markets, write pitch decks, build landing pages, and automate outreach.' },
  { role: 'Student', desc: 'Break down complex topics, summarize papers, write essays, and study smarter.' },
  { role: 'Researcher', desc: 'Upload documents, extract insights, cross-reference sources, and synthesize findings.' },
];

const FAQS = [
  {
    q: 'What is MockJ 4?',
    a: 'MockJ 4 is an advanced AI copilot platform that combines voice control, image generation, code assistance, project memory, and document analysis in a single, always-on workspace.',
  },
  {
    q: 'How does the voice command feature work?',
    a: 'MockJ uses browser-native Web Speech API combined with ElevenLabs for natural voice output. Speak your request — MockJ responds in real-time, reads answers aloud, and can execute tasks like generating images or writing code based on what you say.',
  },
  {
    q: 'What is Project Memory?',
    a: 'Project Memory (powered by the ProjectBrain system) lets MockJ retain knowledge about your projects, code bases, team members, and preferences. You define what it knows via the Knowledge Base editor — MockJ automatically injects this context into every response.',
  },
  {
    q: 'Is MockJ 4 free to use?',
    a: 'Yes — MockJ offers a free tier with 10 chat messages, 3 image generations, and 1 video per day. MockJ Pro (from $50.99/mo) gives you unlimited access to all features including voice, advanced image tools, and priority AI models.',
  },
  {
    q: 'Can I use generated images commercially?',
    a: 'MockJ Pro includes commercial image licensing. Free tier images are for personal use only.',
  },
  {
    q: 'What AI models power MockJ 4?',
    a: 'MockJ 4 uses the latest Gemini and GPT models for chat and reasoning, Sora 2 for video generation, and proprietary OnSpace AI models for image generation and editing.',
  },
];

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    highlight: false,
    features: ['10 chat messages / day', '3 image generations / day', '1 video / day', 'Basic voice input', 'Project Brain (read-only)', 'Community support'],
  },
  {
    name: 'Pro',
    price: '$50.99',
    period: '/mo',
    highlight: true,
    badge: 'Most Popular',
    features: ['Unlimited chat messages', 'Unlimited image generations', 'Unlimited video generations', 'ElevenLabs voice output', 'Full Project Memory & editing', 'Commercial image license', 'Advanced creator tools', 'Priority AI models', 'Priority support'],
  },
  {
    name: 'Intro',
    price: '$2.99',
    period: '/mo',
    highlight: false,
    badge: '🔥 Flash Deal',
    features: ['Everything in Pro', 'Limited-time flash pricing', 'Perfect to try full feature set', 'Cancel anytime'],
  },
];

// ─── Social Proof Widget ─────────────────────────────────────────────────────

function useSocialProof() {
  const [tokensToday, setTokensToday] = useState<number | null>(null);
  const [activeNow, setActiveNow] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = async () => {
    try {
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const last5min = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

      const [earnedRes, activeRes] = await Promise.all([
        // Tokens earned today (positive transactions in last 24h)
        supabase
          .from('token_transactions')
          .select('amount')
          .gt('amount', 0)
          .gte('created_at', last24h),
        // Users active in last 5 minutes (distinct users with recent transactions)
        supabase
          .from('token_transactions')
          .select('user_id')
          .gte('created_at', last5min),
      ]);

      const totalEarned = (earnedRes.data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
      // Count distinct active users
      const distinctActive = new Set((activeRes.data ?? []).map(r => r.user_id)).size;

      setTokensToday(totalEarned);
      // Add a small floor so it never shows 0 (there's always the platform itself)
      setActiveNow(Math.max(distinctActive, 1));
    } catch {
      // Fail silently — social proof is non-critical
    }
  };

  useEffect(() => {
    fetchStats();
    timerRef.current = setInterval(fetchStats, 60_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // The error message indicated an issue with 'react-hooks/exhaustive-deps' rule,
  // which is typically a linter rule, not a syntax error.
  // Removing the `eslint-disable-next-line` comment to prevent false positives if the linter setup is incorrect,
  // or if the dependencies for `fetchStats` actually need to be included.
  // However, `fetchStats` itself has no external dependencies beyond `supabase`
  // which is a global/module-level import, so it's stable.
  // The current dependency array `[]` is correct for a one-time setup of an interval.
  }, []);

  return { tokensToday, activeNow };
}

function SocialProofWidget() {
  const { tokensToday, activeNow } = useSocialProof();

  if (tokensToday === null && activeNow === null) return null;

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  return (
    <div className="flex items-center gap-3 flex-wrap justify-center">
      {tokensToday !== null && (
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold"
          style={{
            background: 'hsl(142 70% 50% / 0.08)',
            border: '1px solid hsl(142 70% 50% / 0.25)',
            color: 'hsl(142 70% 65%)',
          }}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>
            <strong>{formatTokens(tokensToday)}</strong> tokens earned today
          </span>
        </div>
      )}
      {activeNow !== null && (
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold"
          style={{
            background: 'hsl(191 97% 55% / 0.08)',
            border: '1px solid hsl(191 97% 55% / 0.25)',
            color: 'hsl(191 97% 65%)',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[hsl(191_97%_55%)] animate-pulse shrink-0" />
          <Users className="w-3.5 h-3.5" />
          <span>
            <strong>{activeNow}</strong> {activeNow === 1 ? 'user' : 'users'} earning right now
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Components ─────────────────────────────────────────────────────────────

function NavBar() {
  const navigate = useNavigate();
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center gap-4 px-6 py-3 border-b border-white/5 backdrop-blur-xl bg-[hsl(224_20%_4%_/_0.92)]">
      <a href="/landing" className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg overflow-hidden ring-1" style={{ ringColor: RED }}>
          <img src={logoImg} alt="MockJ" className="w-full h-full object-cover" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-black text-base text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            MockJ <span style={{ color: RED }}>4</span>
          </span>
          <span className="hidden sm:block text-[8px] font-bold uppercase tracking-widest" style={{ color: 'hsl(142 70% 55% / 0.6)' }}>Your Digital Plug</span>
        </div>
      </a>
      <div className="flex-1" />
      <div className="hidden sm:flex items-center gap-5 text-sm text-muted-foreground">
        <a href="#features" className="hover:text-foreground transition-colors">Features</a>
        <a href="#use-cases" className="hover:text-foreground transition-colors">Use Cases</a>
        <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
        <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
      </div>
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-95"
        style={{ background: RED, color: '#fff', boxShadow: `0 0 16px hsl(4 90% 58% / 0.3)` }}
      >
        Launch MockJ 4
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </nav>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/[0.06]">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-4 py-5 text-left text-sm font-semibold text-foreground hover:text-[hsl(4_90%_68%)] transition-colors"
      >
        <span>{q}</span>
        {open ? <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />}
      </button>
      {open && <p className="pb-5 text-sm text-muted-foreground leading-relaxed">{a}</p>}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[hsl(224_20%_4%)] text-foreground" style={{ fontFamily: 'Inter, sans-serif' }}>
      <NavBar />

      {/* Hero */}
      <section className="relative pt-36 pb-24 px-6 overflow-hidden flex flex-col items-center text-center">
        <div
          className="absolute inset-0 opacity-[0.07] bg-cover bg-center"
          style={{ backgroundImage: `url(${heroBg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[hsl(224_20%_4%_/_0.6)] to-[hsl(224_20%_4%)]" />
        {/* Dual radial glow — red + green */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] pointer-events-none" style={{ background: 'radial-gradient(ellipse at center top, hsl(4 90% 58% / 0.10) 0%, transparent 65%)' }} />
        <div className="absolute top-0 left-1/4 w-[600px] h-[300px] pointer-events-none" style={{ background: `radial-gradient(ellipse at top left, ${GREEN}08 0%, transparent 60%)` }} />
        <div className="absolute top-1/3 right-0 w-[500px] h-[400px] pointer-events-none" style={{ background: `radial-gradient(ellipse at right, ${VIOLET}05 0%, transparent 60%)` }} />
        {/* Luxury sparkles */}
        <HeroSparkles />

        <div className="relative z-10 max-w-4xl">
          {/* Version pill */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-6 text-xs font-bold" style={{ borderColor: 'hsl(4 90% 58% / 0.3)', color: RED, background: 'hsl(4 90% 58% / 0.07)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: RED }} />
            MockJ 4 — Now Live
          </div>

          {/* Digital Plug hero tagline */}
          <div className="mb-3">
            <span
              className="inline-block text-4xl sm:text-5xl font-black tracking-tight"
              style={{
                fontFamily: 'Space Grotesk, sans-serif',
                background: `linear-gradient(135deg, ${GREEN}, hsl(142 70% 72%), ${GREEN})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                textShadow: 'none',
                letterSpacing: '-0.01em',
              }}
            >
              Your Digital Plug.
            </span>
          </div>

          {/* 3-day free trial hero badge */}
          <div className="inline-flex items-center gap-2.5 mb-5 px-5 py-2.5 rounded-2xl" style={{ background: `${GREEN}0e`, border: `1.5px solid ${GREEN}66`, boxShadow: `0 0 28px ${GREEN}22` }}>
            <span className="text-lg">🎉</span>
            <div className="text-left">
              <p className="text-sm font-black" style={{ color: GREEN }}>3-Day FREE Trial — No Credit Card</p>
              <p className="text-[10px]" style={{ color: `${GREEN}88` }}>Full Pro access · Auto-cancels · Zero risk</p>
            </div>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full ml-1" style={{ background: `${GREEN}18`, border: `1px solid ${GREEN}55`, color: GREEN }}>NEW</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight mb-5" style={{ fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1.05 }}>
            <span style={{ color: RED, textShadow: `0 0 30px hsl(4 90% 58% / 0.5)` }}>I Got You.</span>{' '}Meet MockJ —
            <br />Your Street-Smart AI
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-3 leading-relaxed">
            Bet. MockJ builds websites, generates images, writes code, and
            drops strategy — all from a text or a voice command. No fluff, just moves.
          </p>
          <p className="text-base max-w-xl mx-auto mb-10 font-semibold" style={{ color: 'rgba(200,210,240,0.4)' }}>
            "Don't overthink it. Just tell Mock what you need and he'll handle it."
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {/* Primary CTA — MLTX green glow */}
            <button
              onClick={() => navigate('/')}
              className="relative overflow-hidden flex items-center gap-2 px-8 py-3.5 rounded-2xl text-base font-black transition-all active:scale-95 hover:scale-[1.03] shine-sweep"
              style={{
                background: `linear-gradient(135deg, hsl(142 70% 28%), hsl(142 70% 20%))`,
                color: '#fff',
                border: `1px solid ${GREEN}66`,
                boxShadow: `0 4px 30px ${GREEN}44, 0 0 60px ${GREEN}18`,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 40px ${GREEN}66, 0 0 80px ${GREEN}28`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 30px ${GREEN}44, 0 0 60px ${GREEN}18`; }}
            >
              <Cpu className="w-5 h-5" />
              Say Less — Start Free
            </button>
            {/* Secondary CTA */}
            <a
              href="#features"
              className="flex items-center gap-2 px-8 py-3.5 rounded-2xl text-base font-semibold transition-all hover:scale-[1.02]"
              style={{ background: `${GREEN}0b`, border: `1px solid ${GREEN}33`, color: `${GREEN}cc` }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = `${GREEN}66`; (e.currentTarget as HTMLAnchorElement).style.boxShadow = `0 0 20px ${GREEN}18`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = `${GREEN}33`; (e.currentTarget as HTMLAnchorElement).style.boxShadow = 'none'; }}
            >
              See the Moves
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          {/* Feature pills */}
          <div className="flex items-center justify-center gap-6 mt-8 flex-wrap">
            {["Voice-Controlled", "Builds Real Stuff", "3-Day Free Trial"].map((t, i) => (
              <div key={t} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="w-3.5 h-3.5" style={{ color: i === 1 ? GREEN : RED }} />
                {t}
              </div>
            ))}
          </div>

          {/* Real-time social proof */}
          <div className="mt-6">
            <SocialProofWidget />
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: RED }}>Capabilities</p>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Here's the Move.<br /><span style={{ color: RED }}>One Tool. Everything.</span>
            </h2>
            <p className="text-muted-foreground mt-4 max-w-xl mx-auto text-lg">
              MockJ doesn't just chat — he builds, creates, debugs, and strategizes. Real output, not just words.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map(({ icon: Icon, label, desc, color }) => {
              const accent = color === 'red' ? RED : VIOLET;
              return (
                <div
                  key={label}
                  className="group flex flex-col gap-4 p-5 rounded-2xl border transition-all duration-200 hover:scale-[1.02] cursor-default"
                  style={{ background: 'hsl(224 15% 7%)', borderColor: 'hsl(224 15% 13%)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `${accent.replace(')', ' / 0.35)')}` }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'hsl(224 15% 13%)' }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${accent.replace(')', ' / 0.1)')}`, border: `1px solid ${accent.replace(')', ' / 0.25)')}` }}>
                    <Icon className="w-5 h-5" style={{ color: accent }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground mb-1.5" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{label}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section id="use-cases" className="py-24 px-6 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: VIOLET }}>Who It's For</p>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Who's Mock For? <span style={{ color: RED }}>You.</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {USE_CASES.map(({ role, desc }, i) => (
              <div
                key={role}
                className="p-5 rounded-2xl border"
                style={{ background: 'hsl(224 15% 7%)', borderColor: 'hsl(224 15% 12%)' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black" style={{ background: i % 2 === 0 ? 'hsl(4 90% 58% / 0.15)' : 'hsl(265 80% 65% / 0.15)', color: i % 2 === 0 ? RED : VIOLET, border: `1px solid ${i % 2 === 0 ? 'hsl(4 90% 58% / 0.3)' : 'hsl(265 80% 65% / 0.3)'}` }}>
                    {role[0]}
                  </div>
                  <h3 className="font-bold text-foreground text-sm" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{role}</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: RED }}>Pricing</p>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              No Cap Pricing. <span style={{ color: RED }}>Go Unlimited.</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {PLANS.map(plan => (
              <div
                key={plan.name}
                className={cn('relative flex flex-col gap-5 p-6 rounded-2xl border transition-all', plan.highlight && 'scale-[1.02]')}
                style={{
                  background: plan.highlight ? 'hsl(224 15% 9%)' : 'hsl(224 15% 7%)',
                  borderColor: plan.highlight ? 'hsl(4 90% 58% / 0.45)' : 'hsl(224 15% 13%)',
                  boxShadow: plan.highlight ? '0 0 40px hsl(4 90% 58% / 0.12)' : undefined,
                }}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-black px-3 py-1 rounded-full" style={{ background: plan.highlight ? RED : VIOLET, color: '#fff' }}>
                    {plan.badge}
                  </span>
                )}
                {plan.highlight && <Crown className="w-5 h-5" style={{ color: RED }} />}
                <div>
                  <h3 className="font-black text-lg text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-black" style={{ color: plan.highlight ? RED : 'inherit' }}>{plan.price}</span>
                    <span className="text-muted-foreground text-sm">{plan.period}</span>
                  </div>
                </div>
                <ul className="space-y-2 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: plan.highlight ? RED : 'hsl(142 70% 55%)' }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate(plan.name === 'Free' ? '/' : '/?pricing=open')}
                  className="w-full py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
                  style={plan.highlight
                    ? { background: `linear-gradient(135deg, ${RED}, hsl(20 90% 55%))`, color: '#fff', boxShadow: `0 0 20px hsl(4 90% 58% / 0.3)` }
                    : { background: 'hsl(224 15% 14%)', color: 'hsl(210 20% 80%)', border: '1px solid hsl(224 15% 20%)' }
                  }
                >
                  {plan.name === 'Free' ? 'Get Started Free' : 'Start 3-Day Free Trial'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 px-6 border-t border-white/[0.04]">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: RED }}>FAQ</p>
            <h2 className="text-4xl font-black tracking-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Real Talk — FAQ
            </h2>
          </div>
          {FAQS.map(item => <FAQItem key={item.q} {...item} />)}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-24 px-6 border-t border-white/[0.04] overflow-hidden">
        {/* Subtle sparkles */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {HERO_SPARKLES.filter((_, i) => i % 3 === 0).map(s => (
            <div key={s.id} className="sparkle" style={{
              left: s.left, top: s.top, width: s.size, height: s.size,
              background: s.color,
              boxShadow: `0 0 ${s.size * 4}px ${s.color}`,
              animation: `sparkle-twinkle ${s.dur} ease-in-out infinite`,
              animationDelay: s.delay, opacity: 0.45,
            }} />
          ))}
        </div>
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <div
            className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full border text-xs font-bold"
            style={{ borderColor: `${GREEN}44`, color: GREEN, background: `${GREEN}09`, boxShadow: `0 0 16px ${GREEN}14` }}
          >
            <Star className="w-3.5 h-3.5" />
            Built Different. No Cap. 🔥
          </div>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tight mb-4" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Don't Overthink It.
            <br /><span style={{ color: GREEN, textShadow: `0 0 30px ${GREEN}55` }}>Just Do This First.</span>
          </h2>
          <p className="text-muted-foreground text-lg mb-2">Say less. Start free. No credit card, no cap.</p>
          <p className="text-sm font-bold mb-10" style={{ color: 'rgba(200,210,240,0.4)' }}>
            "That's the clean fix." — MockJ 🔥
          </p>
          <button
            onClick={() => navigate('/')}
            className="relative overflow-hidden inline-flex items-center gap-2 px-10 py-4 rounded-2xl text-lg font-black transition-all active:scale-95 hover:scale-[1.03] shine-sweep"
            style={{ background: `linear-gradient(135deg, hsl(142 70% 28%), hsl(142 70% 20%))`, color: '#fff', border: `1px solid ${GREEN}66`, boxShadow: `0 6px 40px ${GREEN}44, 0 0 80px ${GREEN}18` }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 6px 50px ${GREEN}66, 0 0 100px ${GREEN}28`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 6px 40px ${GREEN}44, 0 0 80px ${GREEN}18`; }}
          >
            <Cpu className="w-5 h-5" />
            Let's Get It — Launch MockJ Free
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded overflow-hidden">
              <img src={logoImg} alt="MockJ" className="w-full h-full object-cover" />
            </div>
          <div className="flex flex-col items-start">
            <span className="font-black text-sm" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              MockJ <span style={{ color: RED }}>4</span>
            </span>
            <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: 'hsl(142 70% 55% / 0.55)' }}>Your Digital Plug</span>
          </div>
          </div>
          <nav className="flex items-center gap-5 text-xs text-muted-foreground">
            <a href="/ai-copilot" className="hover:text-foreground transition-colors">AI Copilot</a>
            <a href="/ai-voice-assistant" className="hover:text-foreground transition-colors">Voice AI</a>
            <a href="/ai-image-generator" className="hover:text-foreground transition-colors">Image AI</a>
            <a href="/ai-coding-assistant" className="hover:text-foreground transition-colors">Code AI</a>
          </nav>
          <div className="flex items-center gap-4 text-xs text-muted-foreground/50">
            <a href="/terms" className="hover:text-foreground transition-colors">Terms of Service</a>
            <span className="opacity-40">·</span>
            <a href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</a>
            <span className="opacity-40">·</span>
            <span>© 2025 MockJ · Built Different 🔥</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
