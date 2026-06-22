/**
 * MetaPreviewPage.tsx
 * Route: /meta-preview
 * Internal tool — shows simulated X, LinkedIn, Discord link preview cards
 * so the team can verify og:image / og:title / og:description before sharing.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Copy, Check, RefreshCw, ExternalLink, Globe,
  Eye, AlertCircle, CheckCircle2, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Meta values pulled directly from index.html ───────────────────────────
const META = {
  title:       'MockJ — AI Copilot for Creators & Power Users',
  description: 'MockJ is your ride-or-die AI copilot. Chat, generate images & videos, trade smarter, analyze the Florida Lottery, and earn MOCKJ tokens. Built by MoreiraJ × MLTX Studio.',
  image:       '/og-image.jpg',
  imageAlt:    'MockJ — AI Copilot · Built Different. Chat, generate images & videos, earn tokens.',
  url:         'https://mockk.online',
  siteName:    'MockJ',
  twitterCard: 'summary_large_image',
  twitterSite: '@mockjAI',
};

// Cache-bust so the preview always shows the latest image
const IMG_SRC = `${META.image}?v=${Date.now()}`;

// ── X (Twitter) card ──────────────────────────────────────────────────────
function XCard() {
  return (
    <div className="font-sans">
      {/* Outer X post mockup */}
      <div className="rounded-2xl border border-[#2f3336] bg-black overflow-hidden">
        {/* Post header */}
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <div className="w-10 h-10 rounded-full bg-[#1da1f2] flex items-center justify-center shrink-0">
            <span className="text-white font-black text-sm">M</span>
          </div>
          <div>
            <p className="text-white text-sm font-bold leading-tight">MockJ AI</p>
            <p className="text-[#536471] text-xs">@mockjAI</p>
          </div>
        </div>
        {/* Tweet text */}
        <div className="px-4 pb-3">
          <p className="text-white text-sm leading-relaxed">
            🔥 MockJ 4 is live — the AI copilot built different. Voice-first, image studio, unlimited chat. Try it free 👇
          </p>
        </div>
        {/* Link card — X summary_large_image format */}
        <div className="mx-4 mb-4 rounded-2xl border border-[#2f3336] overflow-hidden">
          <div className="relative w-full" style={{ paddingBottom: '52.5%' }}>
            <img
              src={IMG_SRC}
              alt={META.imageAlt}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
          <div className="px-3 py-2.5 bg-black border-t border-[#2f3336]">
            <p className="text-[#536471] text-xs mb-0.5">mockk.online</p>
            <p className="text-white text-sm font-semibold leading-snug line-clamp-1">{META.title}</p>
            <p className="text-[#536471] text-xs mt-0.5 line-clamp-2 leading-relaxed">{META.description}</p>
          </div>
        </div>
        {/* Engagement row */}
        <div className="flex items-center gap-6 px-4 pb-3 text-[#536471] text-xs">
          <span>💬 42</span>
          <span>🔁 128</span>
          <span>❤️ 847</span>
          <span className="ml-auto">📊 12.4K</span>
        </div>
      </div>
    </div>
  );
}

// ── LinkedIn card ─────────────────────────────────────────────────────────
function LinkedInCard() {
  return (
    <div className="font-sans">
      {/* Outer LinkedIn post mockup */}
      <div className="rounded-xl border border-[#e0e0e0] bg-white overflow-hidden shadow-sm">
        {/* Post header */}
        <div className="flex items-start gap-3 px-4 pt-4 pb-2">
          <div className="w-12 h-12 rounded-full bg-[#0a66c2] flex items-center justify-center shrink-0">
            <span className="text-white font-black text-base">M</span>
          </div>
          <div>
            <p className="text-[#1d2226] text-sm font-semibold leading-tight">MockJ AI</p>
            <p className="text-[#666d74] text-xs">AI Copilot Platform · 847 followers</p>
            <p className="text-[#666d74] text-xs">2h · 🌐</p>
          </div>
          <button className="ml-auto text-[#0a66c2] text-sm font-semibold border border-[#0a66c2] px-3 py-1 rounded-full hover:bg-[#0a66c2]/5 transition-colors">
            + Follow
          </button>
        </div>
        {/* Post text */}
        <div className="px-4 pb-3">
          <p className="text-[#1d2226] text-sm leading-relaxed">
            Excited to share MockJ 4 — the AI copilot built for creators and developers. 🚀
            <br /><br />
            ✅ Voice-powered commands<br />
            ✅ Image & video generation<br />
            ✅ Project memory across sessions<br />
            ✅ Token economy + referral rewards
          </p>
        </div>
        {/* Link card — LinkedIn format: image top, text below */}
        <div className="border-t border-[#e0e0e0] overflow-hidden">
          <div className="relative w-full" style={{ paddingBottom: '52.5%' }}>
            <img
              src={IMG_SRC}
              alt={META.imageAlt}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
          <div className="px-4 py-3 bg-[#f3f2ef]">
            <p className="text-[#1d2226] text-sm font-semibold leading-snug line-clamp-1">{META.title}</p>
            <p className="text-[#666d74] text-xs mt-0.5 line-clamp-2 leading-relaxed">{META.description}</p>
            <p className="text-[#666d74] text-[11px] mt-1 uppercase tracking-wide">mockk.online</p>
          </div>
        </div>
        {/* Reactions row */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[#e0e0e0] text-[#666d74] text-xs">
          <span>👍❤️🔥 <span className="ml-1">214</span></span>
          <span>48 comments · 12 reposts</span>
        </div>
        {/* Action buttons */}
        <div className="flex items-center px-2 pb-2 gap-1">
          {['👍 Like', '💬 Comment', '🔁 Repost', '📨 Send'].map(a => (
            <button key={a} className="flex-1 py-2 text-xs font-semibold text-[#666d74] hover:bg-[#e0e0e0]/60 rounded-lg transition-colors">{a}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Discord embed card ────────────────────────────────────────────────────
function DiscordCard() {
  return (
    <div className="font-sans">
      {/* Discord channel message */}
      <div className="bg-[#313338] rounded-xl p-4">
        {/* Message */}
        <div className="flex gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-[hsl(4_90%_58%)] flex items-center justify-center shrink-0 text-white font-black text-sm">M</div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-white text-sm font-semibold">MockJ Bot</span>
              <span className="text-[#989aa2] text-[10px]">Today at 4:20 PM</span>
            </div>
            <p className="text-[#dbdee1] text-sm mt-0.5 leading-relaxed">
              🔥 MockJ 4 just dropped — <span className="text-[#00aff4] hover:underline cursor-pointer">https://mockk.online</span>
            </p>
          </div>
        </div>

        {/* Discord embed — left border accent style */}
        <div className="ml-13 flex rounded overflow-hidden" style={{ marginLeft: '52px' }}>
          {/* Left accent bar */}
          <div className="w-1 shrink-0 rounded-l" style={{ background: 'hsl(4 90% 58%)' }} />
          {/* Embed body */}
          <div className="flex-1 bg-[#2b2d31] px-4 py-3 rounded-r">
            {/* Site name */}
            <p className="text-[#989aa2] text-[11px] font-semibold mb-1.5">mockk.online</p>
            {/* Title */}
            <p className="text-[#00aff4] text-sm font-semibold leading-snug hover:underline cursor-pointer mb-1.5">
              {META.title}
            </p>
            {/* Description */}
            <p className="text-[#dbdee1] text-xs leading-relaxed mb-3 line-clamp-3">
              {META.description}
            </p>
            {/* Thumbnail image */}
            <div className="rounded-md overflow-hidden" style={{ maxWidth: '400px' }}>
              <img
                src={IMG_SRC}
                alt={META.imageAlt}
                className="w-full object-cover"
                style={{ maxHeight: '220px' }}
              />
            </div>
          </div>
        </div>

        {/* Emoji reactions */}
        <div className="flex items-center gap-1.5 mt-3 ml-13" style={{ marginLeft: '52px' }}>
          {[['🔥', 42], ['🚀', 18], ['👑', 11]].map(([emoji, count]) => (
            <div key={String(emoji)} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#404249] border border-[#5865f2]/30 text-[11px] cursor-pointer hover:bg-[#5865f2]/20 transition-colors">
              <span>{emoji}</span>
              <span className="text-[#dbdee1] font-medium">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Meta tag checklist ─────────────────────────────────────────────────────
const TAG_CHECKS = [
  { tag: 'og:title',          value: META.title,           required: true  },
  { tag: 'og:description',    value: META.description,     required: true  },
  { tag: 'og:image',          value: `${META.url}${META.image}?v=2`, required: true  },
  { tag: 'og:image:width',    value: '1200',               required: true  },
  { tag: 'og:image:height',   value: '630',                required: true  },
  { tag: 'og:image:type',     value: 'image/jpeg',         required: true  },
  { tag: 'og:image:alt',      value: META.imageAlt,        required: true  },
  { tag: 'og:url',            value: META.url,             required: true  },
  { tag: 'og:type',           value: 'website',            required: true  },
  { tag: 'og:site_name',      value: META.siteName,        required: false },
  { tag: 'twitter:card',      value: META.twitterCard,     required: true  },
  { tag: 'twitter:title',     value: META.title,           required: true  },
  { tag: 'twitter:description', value: META.description,  required: true  },
  { tag: 'twitter:image',     value: `${META.url}${META.image}?v=2`, required: true  },
  { tag: 'twitter:site',      value: META.twitterSite,     required: false },
  { tag: 'twitter:creator',   value: META.twitterSite,     required: false },
];

// ── Platform tab definition ───────────────────────────────────────────────
type Platform = 'x' | 'linkedin' | 'discord';

const PLATFORMS: { id: Platform; label: string; color: string; bg: string; icon: string }[] = [
  { id: 'x',        label: 'X (Twitter)', color: 'hsl(0 0% 95%)',     bg: '#000000', icon: '𝕏' },
  { id: 'linkedin', label: 'LinkedIn',    color: 'hsl(210 90% 45%)',   bg: '#f3f2ef', icon: 'in' },
  { id: 'discord',  label: 'Discord',     color: 'hsl(235 86% 65%)',   bg: '#313338', icon: '🎮' },
];

// ── Page ──────────────────────────────────────────────────────────────────
export default function MetaPreviewPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Platform>('x');
  const [imgKey, setImgKey] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [showTags, setShowTags] = useState(false);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(META.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefreshImg = () => setImgKey(Date.now());

  const activePlatform = PLATFORMS.find(p => p.id === tab)!;

  return (
    <div className="min-h-screen bg-[hsl(224_20%_4%)] text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[hsl(224_20%_5%)] border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2.5 flex-1">
            <div className="w-7 h-7 rounded-lg bg-[hsl(4_90%_58%_/_0.12)] border border-[hsl(4_90%_58%_/_0.3)] flex items-center justify-center">
              <Eye className="w-3.5 h-3.5 text-[hsl(4_90%_58%)]" />
            </div>
            <div>
              <h1 className="font-black text-sm text-foreground leading-none" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Social Preview
              </h1>
              <p className="text-[10px] text-muted-foreground mt-0.5">Verify og:image before sharing</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshImg}
              title="Force-refresh the og:image"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-all"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh image
            </button>
            <a
              href={META.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-all"
            >
              <ExternalLink className="w-3 h-3" />
              Open site
            </a>
          </div>
        </div>

        {/* Platform tabs */}
        <div className="max-w-4xl mx-auto px-4 pb-0 flex gap-1">
          {PLATFORMS.map(p => (
            <button
              key={p.id}
              onClick={() => setTab(p.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all duration-200',
                tab === p.id
                  ? 'border-current'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
              style={tab === p.id ? { color: p.color, borderColor: p.color } : undefined}
            >
              <span className="text-sm leading-none">{p.icon}</span>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* Info banner */}
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-[hsl(191_97%_55%_/_0.2)] bg-[hsl(191_97%_55%_/_0.05)]">
          <Info className="w-4 h-4 text-[hsl(191_97%_55%)] shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-foreground">Internal preview tool</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              These cards simulate how <strong className="text-foreground">mockk.online</strong> appears when pasted on each platform.
              Social platforms cache og:images for 24–48h — use <code className="text-[hsl(191_97%_55%)] bg-[hsl(191_97%_55%_/_0.1)] px-1 rounded">?v=2</code> or their
              debug tools to force a re-scrape after image updates.
            </p>
          </div>
        </div>

        {/* Two-column layout: preview + metadata */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

          {/* Left: Card preview */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                {activePlatform.label} Preview
              </h2>
              <span className="text-[10px] text-muted-foreground px-2 py-1 rounded-full bg-[hsl(224_15%_12%)] border border-border">
                ~{tab === 'discord' ? '400px' : tab === 'linkedin' ? '520px' : '504px'} wide
              </span>
            </div>

            {/* Platform-accurate background */}
            <div
              className="p-6 rounded-2xl border border-border transition-colors duration-300"
              style={{ background: tab === 'x' ? '#15202b' : tab === 'linkedin' ? '#f3f2ef' : '#1e1f22' }}
            >
              {tab === 'x'        && <XCard key={imgKey} />}
              {tab === 'linkedin' && <LinkedInCard key={imgKey} />}
              {tab === 'discord'  && <DiscordCard key={imgKey} />}
            </div>

            {/* Platform-specific notes */}
            <div className="space-y-2">
              {tab === 'x' && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-[hsl(224_15%_9%)] border border-border">
                  <AlertCircle className="w-3.5 h-3.5 text-[hsl(38_95%_60%)] shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    X uses <strong className="text-foreground">twitter:card = summary_large_image</strong> → full-width image above title.
                    Image must be ≥ 300×157px, ≤ 5MB. Card validator:{' '}
                    <a href="https://cards-dev.twitter.com/validator" target="_blank" rel="noopener" className="text-[hsl(191_97%_55%)] hover:underline">
                      cards-dev.twitter.com/validator
                    </a>
                  </p>
                </div>
              )}
              {tab === 'linkedin' && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-[hsl(224_15%_9%)] border border-border">
                  <AlertCircle className="w-3.5 h-3.5 text-[hsl(38_95%_60%)] shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    LinkedIn reads standard <strong className="text-foreground">og: tags</strong>. Recommended 1200×627. Cache is 7 days.
                    Force refresh:{' '}
                    <a href="https://www.linkedin.com/post-inspector/" target="_blank" rel="noopener" className="text-[hsl(191_97%_55%)] hover:underline">
                      Post Inspector
                    </a>
                  </p>
                </div>
              )}
              {tab === 'discord' && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-[hsl(224_15%_9%)] border border-border">
                  <AlertCircle className="w-3.5 h-3.5 text-[hsl(38_95%_60%)] shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Discord reads <strong className="text-foreground">og: tags</strong> and picks the dominant color for the embed accent bar.
                    The red bar here matches MockJ's <code className="text-[hsl(191_97%_55%)] bg-[hsl(191_97%_55%_/_0.1)] px-1 rounded">hsl(4 90% 58%)</code> brand.
                    Cache is ~30min.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right: Meta tag status + raw image */}
          <div className="space-y-6">
            {/* og:image direct view */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  og:image Direct View
                </h2>
                <span className="text-[10px] text-muted-foreground">1200 × 630px</span>
              </div>
              <div className="rounded-xl overflow-hidden border border-border relative group">
                <img
                  key={imgKey}
                  src={`/og-image.jpg?v=${imgKey}`}
                  alt={META.imageAlt}
                  className="w-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href="/og-image.jpg"
                    target="_blank"
                    rel="noopener"
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 text-white text-[10px] font-semibold backdrop-blur-sm"
                  >
                    <ExternalLink className="w-3 h-3" /> Open raw
                  </a>
                </div>
              </div>
            </div>

            {/* URL + copy */}
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Canonical URL
              </h2>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[hsl(224_15%_9%)] border border-border min-w-0">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground font-mono truncate">{META.url}</span>
                </div>
                <button
                  onClick={handleCopyUrl}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95',
                    copied
                      ? 'bg-[hsl(142_70%_55%)] text-[hsl(224_20%_6%)]'
                      : 'bg-[hsl(224_15%_14%)] border border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Meta tag checklist toggle */}
            <div className="space-y-2">
              <button
                onClick={() => setShowTags(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[hsl(224_15%_9%)] border border-border hover:border-[hsl(224_15%_22%)] transition-all"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[hsl(142_70%_55%)]" />
                  <span className="text-xs font-bold text-foreground">Meta Tag Checklist</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(142_70%_55%_/_0.15)] text-[hsl(142_70%_55%)] font-bold">
                    {TAG_CHECKS.length}/{TAG_CHECKS.length} ✓
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">{showTags ? 'Hide' : 'Show'}</span>
              </button>

              {showTags && (
                <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                  {TAG_CHECKS.map(({ tag, value }) => (
                    <div key={tag} className="flex items-start gap-3 px-4 py-3 bg-[hsl(224_15%_8%)] hover:bg-[hsl(224_15%_10%)] transition-colors">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(142_70%_55%)] shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-mono font-bold text-[hsl(191_97%_55%)]">{tag}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 break-all leading-relaxed">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Debug links */}
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Platform Debug Tools
              </h2>
              <div className="space-y-1.5">
                {[
                  {
                    label: 'X Card Validator',
                    url: 'https://cards-dev.twitter.com/validator',
                    desc: 'Paste URL to test Twitter card rendering',
                    color: 'hsl(0 0% 85%)',
                  },
                  {
                    label: 'LinkedIn Post Inspector',
                    url: `https://www.linkedin.com/post-inspector/inspect/${encodeURIComponent(META.url)}`,
                    desc: 'Force LinkedIn to re-scrape og: tags',
                    color: 'hsl(210 90% 45%)',
                  },
                  {
                    label: 'Facebook Sharing Debugger',
                    url: `https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(META.url)}`,
                    desc: 'Also works for WhatsApp previews',
                    color: 'hsl(215 80% 55%)',
                  },
                  {
                    label: 'opengraph.xyz Preview',
                    url: `https://www.opengraph.xyz/url/${encodeURIComponent(META.url)}`,
                    desc: 'Multi-platform preview tool',
                    color: 'hsl(265 80% 65%)',
                  },
                ].map(({ label, url, desc, color }) => (
                  <a
                    key={label}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[hsl(224_15%_9%)] border border-border hover:border-[hsl(224_15%_22%)] hover:bg-[hsl(224_15%_11%)] transition-all group"
                  >
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground group-hover:text-[hsl(191_97%_55%)] transition-colors">{label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                    <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-foreground shrink-0 transition-colors" />
                  </a>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
