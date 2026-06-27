import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Search, ChevronDown, ChevronUp, Sparkles, Zap, Globe,
  Brain, Rocket, Users, Code, GitBranch, BookOpen,
  ExternalLink, MessageSquare, Map, Clock, TrendingUp, Package,
  Lightbulb, Target, Award, Layers, Radio, Cpu, FlaskConical,
  HeartHandshake, DollarSign, Megaphone, FileText, HelpCircle,
  Building2, Crown, Coins, RefreshCw, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import logoImg from '@/assets/mockj-logo.png';
import {
  MOCKJ_CONTRACT, SEPOLIA_CHAIN_ID, getTotalSupply, formatMOCKJ,
  hasMetaMask, getChainId,
} from '@/lib/mockjToken';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BrandCard {
  title: string;
  icon: React.ElementType;
  desc: string;
}

interface ProductItem {
  name: string;
  logo: React.ElementType;
  status: 'Live' | 'Beta' | 'Coming Soon' | 'In Dev';
  desc: string;
  launch: string;
  color: string;
}

interface ExpandSection {
  key: string;
  icon: React.ElementType;
  label: string;
  content: string[];
}

// ── Data ──────────────────────────────────────────────────────────────────────

const MOREIRA_CARDS: BrandCard[] = [
  { title: 'Company Vision',   icon: Target,        desc: 'Building the future of AI-driven creativity and technology at scale.' },
  { title: 'Founder Story',    icon: Award,         desc: 'MoreiraJ — founder, builder, visionary — creating tools the world actually needs.' },
  { title: 'Current Ventures', icon: Rocket,        desc: 'MLTX, MockJ, Creator Tools, Universe CRM, and next-gen AI infrastructure.' },
  { title: 'Future Projects',  icon: Lightbulb,     desc: 'Universe Map, Creator Economy Tools, Partner Portal, and AI Agent Marketplace.' },
  { title: 'Community',        icon: Users,         desc: "A growing ecosystem of creators, builders, and early adopters shaping what's next." },
];

const MLTX_CARDS: BrandCard[] = [
  { title: 'Active Projects',     icon: Layers,       desc: 'MockJ 4, Universe CRM, MLTX Studio, Creator Tools platform.' },
  { title: 'AI Systems',          icon: Cpu,          desc: 'Proprietary inference stack, edge deployment, and real-time AI pipelines.' },
  { title: 'Development Roadmap', icon: GitBranch,    desc: 'Q3 2025: Agent System. Q4: Universe Map. 2026: Partner Portal launch.' },
  { title: 'Integrations',        icon: Code,         desc: 'Webhooks, REST APIs, SDK libraries, and deep third-party AI connectors.' },
  { title: 'Research Lab',        icon: FlaskConical, desc: 'Ongoing research in multimodal AI, voice synthesis, and autonomous agents.' },
];

const MOCKJ_CARDS: BrandCard[] = [
  { title: 'Features',        icon: Sparkles,  desc: 'Chat, Image Gen, Video Studio, TTS, Voice Input, Knowledge Base, Personas.' },
  { title: 'AI Models',       icon: Brain,     desc: 'Gemini 3, Sora 2, ElevenLabs TTS, Vision, and proprietary fine-tuned models.' },
  { title: 'Universe Memory', icon: Radio,     desc: 'Persistent context across sessions — MockJ remembers your projects and preferences.' },
  { title: 'Agent System',    icon: Cpu,       desc: 'Autonomous agents for web research, code generation, and task automation.' },
  { title: 'Updates',         icon: TrendingUp, desc: 'MockJ 4 is live. MockJ 5 (Agents + Long Context) in active development.' },
];

const PRODUCTS: ProductItem[] = [
  { name: 'MockJ 4',           logo: Brain,      status: 'Live',        desc: 'The intelligence engine — chat, image, video, voice AI copilot.',    launch: '2025',    color: 'hsl(265 80% 65%)' },
  { name: 'MockChat.pro',      logo: MessageSquare, status: 'Live',    desc: 'Professional AI chat platform — fast, smart, and built for power users.', launch: '2025', color: 'hsl(142 70% 55%)' },
  { name: 'MockJ.online',      logo: Zap,        status: 'Live',        desc: 'Lightning-fast MockJ interface — streamlined and mobile-first.',      launch: '2025',    color: 'hsl(191 97% 55%)' },
  { name: 'Camme.online',      logo: Globe,      status: 'Live',        desc: 'Creative AI media platform — images, video, and visual generation.',  launch: '2025',    color: 'hsl(38 95% 60%)' },
  { name: 'Moreiraj.online',   logo: Crown,      status: 'Live',        desc: 'The official MoreiraJ headquarters — brand, projects, and ecosystem.', launch: '2025',   color: 'hsl(38 95% 60%)' },
  { name: 'Mini MockJ',        logo: Cpu,        status: 'In Dev',      desc: 'Lightweight mobile-first AI assistant for everyday use.',             launch: 'Q4 2025', color: 'hsl(265 80% 65%)' },
  { name: 'MLTX Studio',       logo: Layers,     status: 'Beta',        desc: 'Professional creator suite — AI tools for visual and content work.',  launch: '2025',    color: 'hsl(310 80% 65%)' },
  { name: 'Universe CRM',      logo: Building2,  status: 'In Dev',      desc: 'AI-powered relationship and project management platform.',            launch: 'Q1 2026', color: 'hsl(142 70% 55%)' },
  { name: 'Creator Tools',     logo: Award,      status: 'Coming Soon', desc: 'Monetization, licensing, and distribution tools for AI creators.',   launch: 'Q2 2026', color: 'hsl(4 90% 58%)' },
  { name: 'Agent Marketplace', logo: Rocket,     status: 'Coming Soon', desc: 'Deploy, share, and monetize custom AI agents across the ecosystem.', launch: '2026',    color: 'hsl(265 80% 65%)' },
  { name: 'MLTX Pro',          logo: Zap,        status: 'Live',        desc: 'MoreiraJ flagship platform — MLTX Pro, built on the OnSpace infrastructure.', launch: '2025',  color: 'hsl(265 80% 65%)' },
];

const EXPAND_SECTIONS: ExpandSection[] = [
  { key: 'company',   icon: Building2,      label: 'Company Information',  content: ['MoreiraJ is an independent AI & technology company.', 'Founded with the mission to democratize advanced AI tools for creators and builders.', 'Headquartered digitally-first with a global distributed team.', 'All products are built under the MLTX technology division.', 'Official website: moreiraj.online', 'MockJ platform: mockj.online · mockchat.pro', 'Creative AI media: camme.online'] },
  { key: 'roadmap',   icon: Map,            label: 'Roadmaps',             content: ['Q3 2025 — MockJ Agent System (autonomous tasks)', 'Q4 2025 — Universe Map (interactive ecosystem explorer)', 'Q4 2025 — Mini MockJ (lightweight mobile app)', 'Q1 2026 — Universe CRM (AI-powered project management)', 'Q2 2026 — Creator Tools (monetization & licensing platform)', '2026 — Partner Portal & Agent Marketplace'] },
  { key: 'docs',      icon: BookOpen,       label: 'Documentation',        content: ['MockJ API — access chat, image, and video via REST API.', 'MLTX SDK — JavaScript and Python libraries for integration.', 'Edge Function Docs — serverless AI pipeline documentation.', 'Webhook Guide — real-time event hooks for all platform events.'] },
  { key: 'pricing',   icon: DollarSign,     label: 'Pricing',              content: ['Free Tier: 10 chats / 3 images / 1 video per day.', 'MockJ Pro: $50.99/month — unlimited everything + advanced tools.', 'MLTX Studio: Contact for enterprise licensing.', 'Creator License: Commercial use included with all Pro tiers.'] },
  { key: 'ai',        icon: Cpu,            label: 'AI Systems',           content: ['Chat: Google Gemini 3 Flash (streaming, 128K context)', 'Images: Gemini 2.5 Flash Image with custom style guides', 'Video: OpenAI Sora 2 with cinematic enhancement pipeline', 'TTS: ElevenLabs (custom MoreiraJ voice model)', 'STT: Web Speech API for voice input', 'All models accessed via proprietary MockJ routing layer'] },
  { key: 'partners',  icon: HeartHandshake, label: 'Partner Programs',     content: ['Creator Partner: Revenue share for AI-generated content.', 'Tech Partner: API integration & co-marketing opportunities.', 'Reseller Program: White-label MockJ for enterprise teams.', 'Apply at: contact@mltxstudio.com'] },
  { key: 'notes',     icon: FileText,       label: 'Release Notes',        content: ['MockJ 4.0 — Full platform launch with streaming, image, video.', 'MockJ 4.1 — Mobile responsive UI, Image History, Video History.', 'MockJ 4.2 — Server-side rate limiting, Account page, Usage meters.', 'MockJ 4.3 — Universe Tab, Account Settings, advanced security.', 'MockJ 4.4 — MOCKJ Token wallet, Admin analytics, Knowledge base cloud sync.'] },
  { key: 'community', icon: Megaphone,      label: 'Community',            content: ['Join the MockJ community of builders and creators.', 'Share prompts, creations, and workflows.', 'Vote on upcoming features and roadmap priorities.', 'Early access to beta features for active community members.'] },
  { key: 'support',   icon: HelpCircle,     label: 'Support',              content: ['Email: contact@mltxstudio.com', 'Response time: 24–48 hours for Pro users, 72h for free tier.', 'Community support: Universe Discord server (coming Q4 2025).', 'Bug reports: GitHub Issues (coming soon).'] },
];

const QUICK_ASK_PROMPTS: Record<string, string[]> = {
  moreira: ['Who is MoreiraJ?', 'Show current projects', "What's next?"],
  mltx:    ['Explain MLTX', 'Show AI projects', "What's in development?"],
  mockj:   ['What can MockJ do?', 'Show latest features', 'Compare MockJ capabilities'],
};

const KNOWLEDGE_EXAMPLES = [
  'What is MLTX?',
  'Show all active products',
  'Explain the roadmap',
  'Tell me about MoreiraJ',
  'What products are launching next?',
];

// ── Galaxy Background ─────────────────────────────────────────────────────────

function GalaxyBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf: number;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);

    const N = 120;
    const particles = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.3,
      dx: (Math.random() - 0.5) * 0.18,
      dy: (Math.random() - 0.5) * 0.18,
      opacity: Math.random() * 0.6 + 0.2,
      color: ['hsl(265 80% 65%)', 'hsl(4 90% 58%)', 'hsl(191 97% 55%)', 'hsl(38 95% 60%)'][Math.floor(Math.random() * 4)],
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color.replace(')', ` / ${p.opacity})`).replace('hsl(', 'hsl(');
        ctx.fill();
        p.x += p.dx; p.y += p.dy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
      }
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 90) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `hsl(265 80% 65% / ${0.07 * (1 - dist / 90)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.7 }} />;
}

// ── MOCKJ Token Stats Component ───────────────────────────────────────────────

function MOCKJTokenStats() {
  const navigate = useNavigate();
  const [totalSupply, setTotalSupply] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [noProvider, setNoProvider] = useState(false);

  const fetchSupply = async () => {
    if (!hasMetaMask()) { setNoProvider(true); return; }
    const chain = await getChainId().catch(() => '0x0');
    if (chain.toLowerCase() !== SEPOLIA_CHAIN_ID.toLowerCase()) { setNoProvider(true); return; }
    setLoading(true); setNoProvider(false);
    try {
      const supply = await getTotalSupply();
      setTotalSupply(supply);
    } catch {
      setNoProvider(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSupply(); }, []);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center border shrink-0"
            style={{ background: 'hsl(38 95% 60% / 0.12)', borderColor: 'hsl(38 95% 60% / 0.35)', boxShadow: '0 0 20px hsl(38 95% 60% / 0.15)' }}
          >
            <Coins className="w-5 h-5" style={{ color: 'hsl(38 95% 60%)' }} />
          </div>
          <div>
            <h2 className="text-xl font-black" style={{ fontFamily: 'Space Grotesk, sans-serif', color: 'hsl(38 95% 60%)' }}>
              MOCKJ Token
            </h2>
            <p className="text-xs text-muted-foreground font-medium">ERC20 · Ethereum Sepolia · Live on-chain data</p>
          </div>
        </div>
        <button
          onClick={fetchSupply} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground hover:border-[hsl(38_95%_60%_/_0.4)] transition-all disabled:opacity-40"
        >
          <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Supply */}
        <div
          className="flex flex-col gap-3 p-5 rounded-2xl border bg-[hsl(224_15%_8%)] relative overflow-hidden"
          style={{ borderColor: 'hsl(38 95% 60% / 0.25)' }}
        >
          <div
            className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-30 pointer-events-none"
            style={{ background: 'hsl(38 95% 60% / 0.15)', transform: 'translate(30%, -30%)' }}
          />
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Supply</p>
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Fetching…</span>
            </div>
          ) : noProvider || totalSupply === null ? (
            <div>
              <p className="text-sm text-muted-foreground">
                {!hasMetaMask() ? 'MetaMask required' : 'Switch to Sepolia to load'}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Open MOCKJ Wallet to connect</p>
            </div>
          ) : (
            <div>
              <p className="text-2xl font-black" style={{ fontFamily: 'Space Grotesk, sans-serif', color: 'hsl(38 95% 60%)' }}>
                {formatMOCKJ(totalSupply)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">MOCKJ tokens minted</p>
            </div>
          )}
        </div>

        {/* Contract address */}
        <div className="flex flex-col gap-3 p-5 rounded-2xl border border-border bg-[hsl(224_15%_8%)]">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Contract</p>
          <code className="text-[11px] font-mono text-foreground/80 break-all leading-relaxed">{MOCKJ_CONTRACT}</code>
          <a
            href={`https://sepolia.etherscan.io/token/${MOCKJ_CONTRACT}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold mt-auto pt-1 transition-opacity hover:opacity-80"
            style={{ color: 'hsl(191 97% 55%)' }}
          >
            View on Etherscan <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Network + CTA */}
        <div className="flex flex-col gap-3 p-5 rounded-2xl border border-border bg-[hsl(224_15%_8%)]">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Network</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[hsl(142_70%_55%)] animate-pulse" />
              <span className="text-sm font-bold text-foreground">Ethereum Sepolia</span>
            </div>
            <p className="text-xs text-muted-foreground">Symbol: <span className="font-bold text-foreground">MOCKJ</span></p>
            <p className="text-xs text-muted-foreground">Decimals: <span className="font-bold text-foreground">18</span></p>
          </div>
          <button
            onClick={() => navigate('/', { state: { pendingPrompt: 'How do I get MOCKJ tokens and what can I use them for?' } })}
            className="mt-auto w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 hover:scale-[1.02]"
            style={{
              background: 'linear-gradient(135deg, hsl(38 95% 60%), hsl(38 95% 44%))',
              color: 'hsl(224 20% 6%)',
              boxShadow: '0 4px 16px hsl(38 95% 60% / 0.35)',
            }}
          >
            <Coins className="w-3.5 h-3.5" />
            Get MOCKJ
          </button>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground/50 text-center">
        {hasMetaMask() ? 'Live data via MetaMask · Sepolia testnet · MOCKJ has no real monetary value' : 'Install MetaMask + switch to Sepolia for live supply data'}
      </p>
    </section>
  );
}

// ── Brand Section ─────────────────────────────────────────────────────────────

function BrandSection({
  title, color, tagline, description, cards, quickAsks, icon: Icon, onAsk,
}: {
  id: string;
  title: string;
  color: string;
  tagline: string;
  description: string;
  cards: BrandCard[];
  quickAsks: string[];
  icon: React.ElementType;
  onAsk: (q: string) => void;
}) {
  return (
    <section className="space-y-5">
      <div className="flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border"
          style={{
            background: `${color.replace(')', ' / 0.12)')}`,
            borderColor: `${color.replace(')', ' / 0.35)')}`,
            boxShadow: `0 0 24px ${color.replace(')', ' / 0.15)')}`,
          }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <h2 className="text-xl font-black text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif', color }}>
            {title}
          </h2>
          <p className="text-xs text-muted-foreground font-medium">{tagline}</p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed pl-16">{description}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map(card => (
          <div
            key={card.title}
            className="flex items-start gap-3 p-4 rounded-xl border border-border transition-all duration-200 bg-[hsl(224_15%_8%)] cursor-default"
            onMouseEnter={e => (e.currentTarget.style.borderColor = color.replace(')', ' / 0.4)'))}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '')}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: `${color.replace(')', ' / 0.1)')}`, border: `1px solid ${color.replace(')', ' / 0.25)')}` }}
            >
              <card.icon className="w-3.5 h-3.5" style={{ color }} />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">{card.title}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{card.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {quickAsks.map(q => (
          <button
            key={q}
            onClick={() => onAsk(q)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 hover:scale-105 active:scale-95"
            style={{ background: `${color.replace(')', ' / 0.08)')}`, borderColor: `${color.replace(')', ' / 0.35)')}`, color }}
          >
            <MessageSquare className="w-3 h-3" />
            {q}
          </button>
        ))}
      </div>
    </section>
  );
}

// ── Status colors ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ProductItem['status'], string> = {
  Live:          'hsl(142 70% 55%)',
  Beta:          'hsl(38 95% 60%)',
  'Coming Soon': 'hsl(191 97% 55%)',
  'In Dev':      'hsl(265 80% 65%)',
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UniversePage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  const toggleSection = (key: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleAsk = (q: string) => navigate('/', { state: { pendingPrompt: q } });
  const handleSearchAsk = () => { if (searchQuery.trim()) handleAsk(searchQuery.trim()); };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Bar */}
      <header className="flex items-center gap-3 px-6 py-4 border-b border-border bg-[hsl(224_20%_5%)] shrink-0">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
          <ArrowLeft className="w-4 h-4" />
          Back to MockJ
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg overflow-hidden">
            <img src={logoImg} alt="MockJ" className="w-full h-full object-cover" />
          </div>
          <span className="font-bold text-sm text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            MockJ <span style={{ color: 'hsl(4 90% 58%)' }}>Universe</span>
          </span>
        </div>
      </header>

      {/* Hero Banner */}
      <div className="relative overflow-hidden" style={{ minHeight: '260px', background: 'hsl(224 20% 5%)' }}>
        <GalaxyBackground />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl opacity-20"
            style={{ background: 'radial-gradient(ellipse, hsl(265 80% 65%), transparent 70%)' }} />
          <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full blur-3xl opacity-10"
            style={{ background: 'radial-gradient(ellipse, hsl(4 90% 58%), transparent 70%)' }} />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full blur-3xl opacity-10"
            style={{ background: 'radial-gradient(ellipse, hsl(191 97% 55%), transparent 70%)' }} />
        </div>
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 py-16 gap-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-[hsl(265_80%_65%_/_0.3)] bg-[hsl(265_80%_65%_/_0.08)]">
            <Globe className="w-3 h-3 text-[hsl(265_80%_65%)]" />
            <span className="text-[10px] font-bold text-[hsl(265_80%_65%)] uppercase tracking-widest">MoreiraJ Ecosystem</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Welcome to the{' '}
            <span style={{ background: 'linear-gradient(135deg, hsl(265 80% 65%), hsl(191 97% 55%))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              MoreiraJ Universe
            </span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
            Explore brands, projects, AI systems, products, roadmaps, and community resources powering the future of intelligent creation.
          </p>
          <div className="flex items-center gap-6 mt-2">
            {[
              { label: 'MoreiraJ', color: 'hsl(38 95% 60%)',  icon: Crown },
              { label: 'MLTX',     color: 'hsl(191 97% 55%)', icon: Cpu },
              { label: 'MockJ',    color: 'hsl(265 80% 65%)', icon: Brain },
            ].map(({ label, color, icon: Icon }) => (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center border animate-pulse"
                  style={{ background: `${color.replace(')', ' / 0.12)')}`, borderColor: `${color.replace(')', ' / 0.4)')}`, boxShadow: `0 0 18px ${color.replace(')', ' / 0.25)')}`, animationDuration: '3s' }}
                >
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <span className="text-[10px] font-bold text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-10 space-y-16">

        {/* ── MoreiraJ ─────────────────────────────────────────────────────── */}
        <BrandSection
          id="moreira" title="MoreiraJ" color="hsl(38 95% 60%)"
          tagline="Black + Gold · Parent Ecosystem"
          description="The parent creative and technology ecosystem behind MLTX, MockJ, and future ventures. Built on bold vision, relentless execution, and a commitment to building tools the world actually needs."
          cards={MOREIRA_CARDS} quickAsks={QUICK_ASK_PROMPTS.moreira} icon={Crown} onAsk={handleAsk}
        />

        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* ── MLTX ─────────────────────────────────────────────────────────── */}
        <BrandSection
          id="mltx" title="MLTX" color="hsl(191 97% 55%)"
          tagline="Electric Blue · Technology Division"
          description="Technology, automation, AI infrastructure, and innovation division. MLTX builds the systems that power the entire MoreiraJ ecosystem — from edge inference to developer APIs and creator tooling."
          cards={MLTX_CARDS} quickAsks={QUICK_ASK_PROMPTS.mltx} icon={Cpu} onAsk={handleAsk}
        />

        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* ── MockJ ─────────────────────────────────────────────────────────── */}
        <BrandSection
          id="mockj" title="MockJ" color="hsl(265 80% 65%)"
          tagline="Purple + Neon · Intelligence Engine"
          description="The intelligence engine of the ecosystem. MockJ powers chat, image generation, video creation, voice synthesis, and agent automation — all through a single, voice-controlled AI copilot interface."
          cards={MOCKJ_CARDS} quickAsks={QUICK_ASK_PROMPTS.mockj} icon={Brain} onAsk={handleAsk}
        />

        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* ── MOCKJ Token Stats ─────────────────────────────────────────────── */}
        <MOCKJTokenStats />

        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* ── Products Grid ─────────────────────────────────────────────────── */}
        <section className="space-y-6">
          <div>
            <h2 className="text-xl font-black text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Products</h2>
            <p className="text-xs text-muted-foreground mt-1">Every tool in the MoreiraJ ecosystem</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PRODUCTS.map(product => (
              <div
                key={product.name}
                className="flex flex-col gap-3 p-5 rounded-2xl border border-border bg-[hsl(224_15%_8%)] transition-all duration-200 group relative overflow-hidden"
                onMouseEnter={e => (e.currentTarget.style.borderColor = product.color.replace(')', ' / 0.4)'))}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '')}
              >
                <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: product.color.replace(')', ' / 0.08)'), transform: 'translate(30%, -30%)' }} />
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                    style={{ background: `${product.color.replace(')', ' / 0.12)')}`, borderColor: `${product.color.replace(')', ' / 0.3)')}` }}>
                    <product.logo className="w-4 h-4" style={{ color: product.color }} />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                    style={{ color: STATUS_COLORS[product.status], borderColor: STATUS_COLORS[product.status].replace(')', ' / 0.35)'), background: STATUS_COLORS[product.status].replace(')', ' / 0.08)') }}>
                    {product.status}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{product.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{product.desc}</p>
                </div>
                <div className="flex items-center justify-between mt-auto pt-1">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">{product.launch}</span>
                  </div>
                  <button onClick={() => handleAsk(`Tell me about ${product.name}`)}
                    className="flex items-center gap-1 text-[10px] font-semibold hover:opacity-80 transition-all"
                    style={{ color: product.color }}>
                    Learn More <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* ── Knowledge Center ──────────────────────────────────────────────── */}
        <section className="space-y-6">
          <div>
            <h2 className="text-xl font-black text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Knowledge Center</h2>
            <p className="text-xs text-muted-foreground mt-1">Ask anything about the Universe</p>
          </div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearchAsk()}
              placeholder="Ask anything about MoreiraJ, MLTX, or MockJ..."
              className="w-full bg-[hsl(224_15%_9%)] border border-border rounded-xl pl-11 pr-24 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-[hsl(265_80%_65%_/_0.5)] transition-all"
            />
            <button onClick={handleSearchAsk} disabled={!searchQuery.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
              style={{ background: 'hsl(265 80% 65%)', color: 'white' }}>
              <Sparkles className="w-3 h-3" /> Ask MockJ
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {KNOWLEDGE_EXAMPLES.map(ex => (
              <button key={ex} onClick={() => handleAsk(ex)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-[hsl(265_80%_65%_/_0.4)] hover:bg-[hsl(265_80%_65%_/_0.04)] transition-all duration-150">
                <Sparkles className="w-2.5 h-2.5" />
                {ex}
              </button>
            ))}
          </div>
        </section>

        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* ── Expandable Sections ───────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="mb-5">
            <h2 className="text-xl font-black text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Deep Dive</h2>
            <p className="text-xs text-muted-foreground mt-1">Tap any section to expand</p>
          </div>
          {EXPAND_SECTIONS.map(sec => (
            <div key={sec.key}
              className={cn('rounded-2xl border transition-all duration-200 overflow-hidden bg-[hsl(224_15%_8%)]',
                openSections.has(sec.key) ? 'border-[hsl(265_80%_65%_/_0.35)]' : 'border-border')}>
              <button onClick={() => toggleSection(sec.key)} className="w-full flex items-center justify-between px-5 py-4 text-left">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: openSections.has(sec.key) ? 'hsl(265 80% 65% / 0.15)' : 'hsl(224 15% 14%)',
                      border: openSections.has(sec.key) ? '1px solid hsl(265 80% 65% / 0.4)' : '1px solid transparent',
                    }}>
                    <sec.icon className="w-3.5 h-3.5" style={{ color: openSections.has(sec.key) ? 'hsl(265 80% 65%)' : 'hsl(215 16% 47%)' }} />
                  </div>
                  <span className={cn('text-sm font-semibold transition-colors', openSections.has(sec.key) ? 'text-foreground' : 'text-muted-foreground')}>
                    {sec.label}
                  </span>
                </div>
                {openSections.has(sec.key)
                  ? <ChevronUp className="w-4 h-4 text-[hsl(265_80%_65%)] shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
              </button>
              {openSections.has(sec.key) && (
                <div className="px-5 pb-5 space-y-2 border-t border-[hsl(265_80%_65%_/_0.15)]">
                  {sec.content.map((line, i) => (
                    <div key={i} className="flex items-start gap-2.5 pt-2">
                      <div className="w-1 h-1 rounded-full bg-[hsl(265_80%_65%_/_0.6)] mt-1.5 shrink-0" />
                      <p className="text-sm text-muted-foreground leading-relaxed">{line}</p>
                    </div>
                  ))}
                  <button onClick={() => handleAsk(`Tell me more about ${sec.label.toLowerCase()}`)}
                    className="flex items-center gap-1.5 mt-3 text-xs font-semibold text-[hsl(265_80%_65%)] hover:opacity-80 transition-opacity">
                    <MessageSquare className="w-3 h-3" />
                    Ask MockJ about {sec.label}
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>

        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* ── Quick Actions ─────────────────────────────────────────────────── */}
        <section className="space-y-5">
          <div>
            <h2 className="text-xl font-black text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Quick Actions</h2>
            <p className="text-xs text-muted-foreground mt-1">Jump right in</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Ask MockJ About This', icon: MessageSquare, color: 'hsl(265 80% 65%)', q: 'Tell me everything about the MoreiraJ Universe ecosystem' },
              { label: 'Explore Products',      icon: Package,       color: 'hsl(4 90% 58%)',   q: 'Show me all MockJ and MLTX products and their current status' },
              { label: 'View Roadmap',          icon: Map,           color: 'hsl(191 97% 55%)', q: 'What is the full MoreiraJ product roadmap for 2025 and 2026?' },
              { label: 'Contact Team',          icon: Megaphone,     color: 'hsl(38 95% 60%)',  q: 'How do I contact the MoreiraJ team or get support?' },
              { label: 'Join Community',        icon: Users,         color: 'hsl(142 70% 55%)', q: 'How do I join the MockJ or MoreiraJ community?' },
              { label: 'Launch Countdown',      icon: Rocket,        color: 'hsl(265 80% 65%)', q: 'What products are launching next and when?' },
            ].map(action => (
              <button key={action.label} onClick={() => handleAsk(action.q)}
                className="flex items-center gap-3 p-4 rounded-xl border border-border bg-[hsl(224_15%_8%)] text-left transition-all duration-200 active:scale-[0.97] group"
                onMouseEnter={e => (e.currentTarget.style.borderColor = action.color.replace(')', ' / 0.4)'))}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '')}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-all"
                  style={{ background: `${action.color.replace(')', ' / 0.1)')}`, borderColor: `${action.color.replace(')', ' / 0.25)')}` }}>
                  <action.icon className="w-3.5 h-3.5" style={{ color: action.color }} />
                </div>
                <span className="text-xs font-semibold text-foreground group-hover:text-white transition-colors leading-tight">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Ecosystem Links ─────────────────────────────────────────────── */}
        <section className="space-y-5">
          <div>
            <h2 className="text-xl font-black text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>🌐 MoreiraJ Ecosystem</h2>
            <p className="text-xs text-muted-foreground mt-1">All official sites in the MLTX universe</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { name: 'moreiraj.online',  desc: 'Official MoreiraJ HQ — brand, projects & ecosystem overview', color: 'hsl(38 95% 60%)',   url: 'https://moreiraj.online' },
              { name: 'mockj.online',     desc: 'MockJ lightning interface — fast, mobile-first AI chat',       color: 'hsl(191 97% 55%)', url: 'https://mockj.online' },
              { name: 'camme.online',     desc: 'Creative AI media — images, video, and visual generation',    color: 'hsl(38 95% 60%)',   url: 'https://camme.online' },
              { name: 'mockchat.pro',     desc: 'Professional AI chat for power users and creators',           color: 'hsl(142 70% 55%)', url: 'https://mockchat.pro' },
              { name: 'MLTX Pro',        desc: 'MLTX Pro — MoreiraJ flagship platform powered by MLTX Studio',  color: 'hsl(265 80% 65%)', url: 'https://react-9b62xw.onspace.build/' },
            ].map(site => (
              <a
                key={site.name}
                href={site.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col gap-3 p-5 rounded-2xl border border-border bg-[hsl(224_15%_8%)] transition-all duration-200 group hover:scale-[1.02] active:scale-[0.98]"
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = site.color.replace(')', ' / 0.45)'); (e.currentTarget as HTMLAnchorElement).style.boxShadow = `0 0 20px ${site.color.replace(')', ' / 0.1)')}`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = ''; (e.currentTarget as HTMLAnchorElement).style.boxShadow = ''; }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border"
                    style={{ background: `${site.color.replace(')', ' / 0.12)')}`, borderColor: `${site.color.replace(')', ' / 0.3)')}` }}
                  >
                    <Globe className="w-4 h-4" style={{ color: site.color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-foreground truncate" style={{ fontFamily: 'Space Grotesk, sans-serif', color: site.color }}>{site.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'hsl(142 70% 55%)' }} />
                      <span className="text-[9px] font-bold" style={{ color: 'hsl(142 70% 55%)' }}>LIVE</span>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-70 transition-opacity shrink-0" style={{ color: site.color }} />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{site.desc}</p>
              </a>
            ))}
          </div>
        </section>

        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* Footer note */}
        <div className="text-center py-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-lg overflow-hidden">
              <img src={logoImg} alt="MockJ" className="w-full h-full object-cover" />
            </div>
            <span className="text-xs font-bold text-muted-foreground">MockJ Universe · Powered by MoreiraJ & MLTX Studio</span>
          </div>
          <p className="text-[11px] text-muted-foreground/50">Everything you need to know about the ecosystem, in one place.</p>
          <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
            {[
              { label: 'moreiraj.online', url: 'https://moreiraj.online' },
              { label: 'mockj.online',     url: 'https://mockj.online' },
              { label: 'camme.online',     url: 'https://camme.online' },
              { label: 'mockchat.pro',     url: 'https://mockchat.pro' },
              { label: 'MLTX Pro',         url: 'https://react-9b62xw.onspace.build/' },
            ].map(({ label, url }) => (
              <a key={label} href={url} target="_blank" rel="noopener noreferrer"
                className="text-[10px] font-bold hover:opacity-80 transition-opacity"
                style={{ color: 'hsl(142 70% 55%)' }}>{label}</a>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
