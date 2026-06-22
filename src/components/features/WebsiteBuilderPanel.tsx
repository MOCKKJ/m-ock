/**
 * WebsiteBuilderPanel.tsx
 * MockJ Website Builder — AI-powered full UI studio
 * Generates gorgeous, complete websites with live preview, edit, download
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Globe, Sparkles, Download, Eye, Code2, Loader2, X,
  Zap, Monitor, Smartphone, Tablet, Wand2, FileText,
  Palette, ChevronDown, ExternalLink, Save, FolderOpen,
  Play, RefreshCw, Copy, Check, Layers, LayoutTemplate,
  Cpu, Star, Crown, Flame, ArrowRight, Search, Maximize2, Minimize2, ArrowLeft,
  Share2, RotateCcw, Clock, Link,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { getDeviceId } from '@/lib/deviceFingerprint';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────
type ViewMode = 'preview' | 'code';
type Viewport = 'desktop' | 'tablet' | 'mobile';
type BuildStatus = 'idle' | 'generating' | 'completed' | 'failed';

interface HtmlVersion {
  html: string;
  label: string;
  timestamp: Date;
}

interface StyleOption {
  id: string;
  label: string;
  emoji: string;
  desc: string;
  accent: string;
  preview: string; // CSS gradient for preview swatch
}

interface SavedProject {
  id: string;
  name: string;
  prompt: string;
  style: string;
  created_at: string;
  generated_html?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const GREEN  = 'hsl(142 70% 55%)';
const VIOLET = 'hsl(265 80% 65%)';
const CYAN   = 'hsl(191 97% 55%)';
const GOLD   = 'hsl(38 95% 60%)';
const RED    = 'hsl(4 90% 58%)';
const PINK   = 'hsl(310 80% 65%)';

const STYLES: StyleOption[] = [
  { id: 'futuristic',    label: 'Futuristic',    emoji: '🚀', desc: 'Neon glow, dark glass, AI aesthetic',      accent: VIOLET, preview: 'linear-gradient(135deg, hsl(265 80% 25%), hsl(191 97% 25%))' },
  { id: 'luxury',        label: 'Luxury',        emoji: '✨', desc: 'Gold accents, elegance, premium feel',     accent: GOLD,   preview: 'linear-gradient(135deg, hsl(38 95% 25%), hsl(30 80% 25%))' },
  { id: 'minimal',       label: 'Minimal',       emoji: '⬜', desc: 'Clean whitespace, pure typography',        accent: CYAN,   preview: 'linear-gradient(135deg, hsl(220 15% 25%), hsl(220 15% 35%))' },
  { id: 'neon-cyber',    label: 'Neon Cyber',    emoji: '🌈', desc: 'Cyberpunk, vibrant, bold contrasts',       accent: PINK,   preview: 'linear-gradient(135deg, hsl(310 80% 25%), hsl(265 80% 25%))' },
  { id: 'real-estate',   label: 'Real Estate',   emoji: '🏡', desc: 'Professional, trustworthy, property-focused', accent: GREEN,  preview: 'linear-gradient(135deg, hsl(142 50% 20%), hsl(160 40% 25%))' },
  { id: 'ai-saas',       label: 'AI SaaS',       emoji: '🤖', desc: 'Tech startup, gradient hero, features',    accent: CYAN,   preview: 'linear-gradient(135deg, hsl(191 97% 20%), hsl(230 60% 25%))' },
  { id: 'creator-brand', label: 'Creator Brand', emoji: '🎨', desc: 'Bold personality, portfolio, influencer',  accent: RED,    preview: 'linear-gradient(135deg, hsl(4 90% 25%), hsl(25 85% 25%))' },
  { id: 'dark-glass',    label: 'Dark Glass',    emoji: '🔮', desc: 'Glassmorphism, blur layers, modern UI',    accent: VIOLET, preview: 'linear-gradient(135deg, hsl(224 20% 15%), hsl(240 25% 20%))' },
  { id: 'retro-bold',    label: 'Retro Bold',    emoji: '🕹️', desc: 'Pixel art energy, bold colors, nostalgic', accent: GOLD,   preview: 'linear-gradient(135deg, hsl(50 90% 25%), hsl(200 80% 20%))' },
  { id: 'nature-eco',    label: 'Nature/Eco',    emoji: '🌿', desc: 'Organic, earthy tones, wellness feel',     accent: GREEN,  preview: 'linear-gradient(135deg, hsl(120 40% 20%), hsl(80 35% 25%))' },
];

const EXAMPLE_PROMPTS = [
  { label: 'AI Copilot SaaS',      prompt: 'A futuristic AI copilot SaaS landing page with neon hero section, animated particle background, pricing tiers, feature grid, and testimonials. Dark theme with purple and cyan accents.' },
  { label: 'Real Estate Agency',   prompt: 'A professional real estate agency website with featured property listings as cards, mortgage calculator form, agent team section, neighborhood guides, and lead capture contact form.' },
  { label: 'Luxury Fashion Brand', prompt: 'A high-end luxury fashion brand homepage with editorial full-bleed hero image, product showcase in a grid, brand story section, and newsletter signup. Elegant serif typography, gold accents.' },
  { label: 'Mobile App Landing',   prompt: 'A mobile app landing page with animated phone mockup, feature highlights with icons, App Store and Google Play download buttons, user reviews, and a FAQ accordion.' },
  { label: 'Dev Portfolio',        prompt: 'A dark-mode developer portfolio with animated hero name reveal, skills section with progress bars, featured project cards with tech stack tags, GitHub stats, and contact form.' },
  { label: 'Restaurant Website',   prompt: 'A restaurant website with hero video background, scrolling food menu by category, reservation form, chef profile, gallery grid, hours, and location map embed placeholder.' },
  { label: 'Crypto/Web3 Project',  prompt: 'A Web3 crypto project landing page with animated tokenomics chart, roadmap timeline, team section with wallet addresses, whitepaper download button, and presale countdown timer.' },
  { label: 'Fitness / Wellness',   prompt: 'A fitness coaching website with transformation before/after gallery, program cards with pricing, trainer bio, client testimonials as a carousel, and a free trial CTA with form.' },
];

const BUILD_STEPS = [
  { label: 'Analyzing prompt…', icon: '🧠' },
  { label: 'Designing layout…', icon: '📐' },
  { label: 'Applying styles…',  icon: '🎨' },
  { label: 'Adding content…',   icon: '✍️' },
  { label: 'Building animations…', icon: '✨' },
  { label: 'Finalizing code…',  icon: '🔧' },
];

const VIEWPORT_CONFIG: Record<Viewport, { width: string; icon: typeof Monitor; label: string }> = {
  desktop: { width: '100%',   icon: Monitor,    label: 'Desktop' },
  tablet:  { width: '768px',  icon: Tablet,     label: 'Tablet' },
  mobile:  { width: '390px',  icon: Smartphone, label: 'Mobile' },
};

// ── System prompt for website generation ────────────────────────────────────
function buildWebsiteSystemPrompt(style: string, pages: string[]): string {
  const styleGuides: Record<string, string> = {
    'futuristic':    'Dark background (#0a0a1a), neon purple/cyan glow effects, glassmorphism cards, animated gradients, glowing borders, particle/star background animation, Space Grotesk font for headings, Inter for body. CSS custom properties for colors. Button glow on hover.',
    'luxury':        'Deep dark navy or black background, gold (#d4af37) and champagne accents, serif headings (Playfair Display), generous whitespace, subtle shimmer animations, elegant card shadows, thin gold borders, premium photography placeholders.',
    'minimal':       'Pure white or near-white background, maximum whitespace, one accent color (deep teal or coral), large bold typography, subtle hover transitions, no decorative elements—let the content breathe. Clean borders and shadows.',
    'neon-cyber':    'Pure black background, neon pink/purple/green color combinations, grid line overlays, glitch text animations, scanline effects, bold pixel-like fonts (use Orbitron), ultra-bright neon glow shadows, cyberpunk energy throughout.',
    'real-estate':   'Clean professional white/gray background, trust-building green or blue accent, strong photography placeholders, card-based property listings, professional sans-serif typography, clear call-to-actions, financial confidence.',
    'ai-saas':       'Dark or white option, gradient hero (blue to purple to teal), feature icon cards, pricing toggle, testimonial section with avatars, integration logos grid, smooth scroll animations, modern SaaS feel like Linear or Vercel.',
    'creator-brand': 'Bold personality colors matching the brand, editorial large typography, full-bleed sections, strong CTAs, social proof numbers, personality-forward copy tone, link in bio section, content grid.',
    'dark-glass':    'Dark (#0f0f1a) background, frosted glass panels with backdrop-blur, gradient borders, depth-layered cards, soft purple/blue tinting on glass, elegant animations, modern minimalist feel.',
    'retro-bold':    'Bold primary colors (red, yellow, blue), thick black borders, slight rotation on elements for energy, chunky typography (use Poppins 900), bold shadows, flat design with subtle gradients, fun retro UI.',
    'nature-eco':    'Earth tones (forest green, warm beige, brown), organic rounded shapes, leaf/nature imagery placeholders, clean readable body text, trust-building layout, warm wooden textures via CSS, eco-friendly feel.',
  };

  const styleGuide = styleGuides[style] ?? styleGuides['futuristic'];

  return `You are MockJ Website Builder — the most elite AI web designer on the planet.

Generate a COMPLETE, STUNNING, production-quality HTML website that will AMAZE the user when they see it.

DESIGN STYLE: ${style}
VISUAL GUIDE: ${styleGuide}
PAGES/SECTIONS: ${pages.join(', ')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY REQUIREMENTS — THE WEBSITE MUST BE EXCEPTIONAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. MUST include in <head>:
   - <link rel="preconnect" href="https://fonts.googleapis.com">
   - <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
   - Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
   - <script> block configuring Tailwind with custom colors matching the style
   - Full SEO meta tags (title, description, og:image, viewport, charset)

2. LAYOUT — make it visually stunning and COMPLETE:
   - Fixed glassmorphism navbar with logo, nav links, and CTA button
   - Dramatic hero section with: large headline, subheadline, CTA buttons, visual element (animated gradient, 3D-style card, or particle effect via CSS/JS)
   - Smooth scrolling sections matching the pages requested
   - Professional footer with links, social icons (Font Awesome or inline SVG), copyright
   - ALL sections must have real content — no placeholders like "Lorem ipsum" for main copy

3. ANIMATIONS — every great website has these:
   - CSS keyframe animations for hero elements (fade-in, slide-up, float)
   - Hover effects on buttons (scale, glow, color shift)
   - Scroll reveal animation using Intersection Observer API (vanilla JS, no library)
   - Hover cards with lift effect (translateY + shadow)
   - Gradient animations on hero background or CTA buttons
   - Smooth transitions on all interactive elements (0.2s-0.4s ease)

4. RESPONSIVE — mobile-first throughout:
   - Hamburger menu for mobile (functional with JS toggle)
   - Grid and flex layouts that adapt perfectly at 640px, 768px, 1024px, 1280px
   - Touch-friendly buttons (min 44px touch targets)
   - Proper font scaling with clamp() for fluid typography

5. CONTENT — use REAL, compelling copy:
   - Compelling, specific hero headlines (not generic)
   - Real feature descriptions that make sense for the website type
   - Realistic pricing numbers and feature lists
   - Real testimonial names and quotes that feel authentic
   - Meaningful statistics/social proof numbers

6. JAVASCRIPT — must be functional:
   - Mobile hamburger menu toggle
   - Scroll reveal animations (Intersection Observer)
   - Smooth scroll for nav links (scrollIntoView)
   - Form submission shows success toast notification (not browser alert)
   - Any interactive element (tabs, accordions, toggles) must work

7. VISUAL ELEMENTS to include based on style:
   - For dark themes: CSS gradient backgrounds, glow effects via box-shadow, subtle particle animation
   - Gradient text using background-clip: text
   - Cards with proper shadows and hover states
   - Icon elements using inline SVG or emoji where appropriate
   - Background patterns or textures via CSS (dots, grid, waves)

8. QUALITY BAR — this website should look like it was built by a senior designer:
   - Consistent spacing system (use Tailwind spacing)
   - Proper color hierarchy (primary, secondary, muted text)
   - Visual rhythm and clear content hierarchy
   - Professional-looking without being boring
   - Could actually be used as a real business website

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — CRITICAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY a complete, valid HTML document. 
- Start with <!DOCTYPE html> on the very first line
- End with </html> as the very last line
- NO markdown code fences (no triple backticks)
- NO explanation text before or after the HTML
- NO "Here is your website:" introduction
- The HTML must be self-contained and work when opened in any browser
- Inline all CSS in <style> tags and all JS in <script> tags
- Do NOT use external libraries other than Tailwind CDN and Google Fonts

Make this website GENUINELY BEAUTIFUL. The user should gasp when they see it.`;
}

// ── API call ─────────────────────────────────────────────────────────────────
async function callWebsiteBuilderAI(
  prompt: string,
  style: string,
  pages: string[],
  editInstruction?: string,
  currentHtml?: string
): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const { data: { session } } = await supabase.auth.getSession();
  const authToken = session?.access_token ?? supabaseKey;

  const systemPrompt = buildWebsiteSystemPrompt(style, pages);

  let userMessage = `Build this website: ${prompt}`;
  if (editInstruction && currentHtml) {
    userMessage = `I need you to edit and improve this website. 

EDIT INSTRUCTION: ${editInstruction}

ORIGINAL INTENT: ${prompt}

Apply the edit while keeping the same overall structure and style. Return the complete updated HTML file.

CURRENT HTML (first 6000 chars for context):
${currentHtml.slice(0, 6000)}`;
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/mocka-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      'apikey': supabaseKey,
      'x-device-id': getDeviceId(),
    },
    body: JSON.stringify({
      type: 'chat',
      messages: [{ role: 'user', content: userMessage }],
      stream: false,
      systemOverride: systemPrompt,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    // Try to parse JSON body for structured errors (e.g. website gate)
    let errMsg = text || `Generation failed: ${response.status}`;
    let parsed: Record<string, unknown> | null = null;
    try { parsed = JSON.parse(text); } catch { /* ignore */ }
    if (parsed) {
      if (parsed.websiteGateLimitExceeded) {
        const err = new Error(parsed.error as string || errMsg) as Error & { websiteGateLimitExceeded: boolean; ownerType: string };
        err.websiteGateLimitExceeded = true;
        err.ownerType = (parsed.ownerType as string) || 'user';
        throw err;
      }
      if (parsed.error) errMsg = parsed.error as string;
    }
    throw new Error(errMsg);
  }

  const data = await response.json();
  let content: string = data?.content ?? data?.choices?.[0]?.message?.content ?? '';

  // Strip markdown code fences if present
  content = content.trim();
  content = content.replace(/^```html\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  content = content.replace(/^```\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  // Find the actual HTML start
  const doctypeIdx = content.indexOf('<!DOCTYPE');
  const htmlIdx = content.indexOf('<html');
  const startIdx = doctypeIdx !== -1 ? doctypeIdx : htmlIdx !== -1 ? htmlIdx : -1;

  if (startIdx === -1) {
    throw new Error('AI returned invalid HTML. Try a more specific prompt.');
  }

  return content.slice(startIdx);
}

function downloadHtml(html: string, name: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/\s+/g, '-').toLowerCase() || 'website'}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success('Downloaded! Open the .html file in your browser 🔥');
}

function openInNewTab(html: string) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function WebsiteBuilderPanel() {
  const { user } = useAuth();

  // Website gate modal
  const [showGateModal, setShowGateModal] = useState<{ ownerType: 'guest' | 'user' } | null>(null);
  // Mobile sidebar toggle
  const [showMobileSidebar, setShowMobileSidebar] = useState(true);
  // Mobile full-screen preview
  const [mobileFullscreen, setMobileFullscreen] = useState(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Form
  const [prompt, setPrompt]             = useState('');
  const [style, setStyle]               = useState('futuristic');
  const [projectName, setProjectName]   = useState('');
  const [selectedPages, setSelectedPages] = useState(['home', 'features', 'pricing', 'contact']);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [showExamples, setShowExamples] = useState(false);

  // Build
  const [status, setStatus]             = useState<BuildStatus>('idle');
  const [buildStep, setBuildStep]       = useState(0);
  const [generatedHtml, setGeneratedHtml] = useState('');
  const [versions, setVersions]             = useState<HtmlVersion[]>([]);
  const [showVersions, setShowVersions]     = useState(false);
  const [shareUrl, setShareUrl]             = useState<string | null>(null);
  const [shareLoading, setShareLoading]     = useState(false);
  const [shareCopied, setShareCopied]       = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [errorMsg, setErrorMsg]         = useState('');

  // UI
  const [viewMode, setViewMode]         = useState<ViewMode>('preview');
  const [viewport, setViewport]         = useState<Viewport>('desktop');
  const [editInstruction, setEditInstruction] = useState('');
  const [isEditing, setIsEditing]       = useState(false);
  const [codeCopied, setCodeCopied]     = useState(false);
  const [showProjects, setShowProjects] = useState(false);

  // Projects
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const buildStepRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Version history helpers ────────────────────────────────────────────────
  const pushVersion = useCallback((html: string, label: string) => {
    if (!html) return;
    setVersions(prev => [{ html, label, timestamp: new Date() }, ...prev].slice(0, 5));
  }, []);

  const handleUndo = useCallback((version: HtmlVersion) => {
    setVersions(prev => [{ html: generatedHtml, label: `Snapshot ${new Date().toLocaleTimeString()}`, timestamp: new Date() }, ...prev].slice(0, 5));
    setGeneratedHtml(version.html);
    setShareUrl(null);
    setShowVersions(false);
    toast.success(`Reverted to: ${version.label}`);
  }, [generatedHtml]);

  // ── Share preview helpers ──────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    if (!generatedHtml) return;
    setShareLoading(true);
    try {
      const fileName = `previews/${crypto.randomUUID()}.html`;
      const blob = new Blob([generatedHtml], { type: 'text/html;charset=utf-8' });
      const { error } = await supabase.storage
        .from('generated-images')
        .upload(fileName, blob, { contentType: 'text/html', upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage
        .from('generated-images')
        .getPublicUrl(fileName);
      setShareUrl(urlData.publicUrl);
      toast.success('Share link ready — copy it below!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Share failed');
    } finally {
      setShareLoading(false);
    }
  }, [generatedHtml]);

  const handleCopyShareUrl = useCallback(() => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
      toast.success('Link copied!');
    });
  }, [shareUrl]);

  // Close versions panel on outside click
  useEffect(() => {
    if (!showVersions) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-versions-panel]')) setShowVersions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showVersions]);

  // Load projects
  const loadProjects = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('website_projects')
      .select('id, name, prompt, style, created_at, generated_html')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(12);
    if (data) setSavedProjects(data as SavedProject[]);
  }, [user?.id]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // Animate build steps
  useEffect(() => {
    if (status === 'generating') {
      setBuildStep(0);
      let step = 0;
      buildStepRef.current = setInterval(() => {
        step = (step + 1) % BUILD_STEPS.length;
        setBuildStep(step);
      }, 1800);
    } else {
      if (buildStepRef.current) clearInterval(buildStepRef.current);
    }
    return () => { if (buildStepRef.current) clearInterval(buildStepRef.current); };
  }, [status]);

  // Inject HTML into iframe
  useEffect(() => {
    if (!generatedHtml || viewMode !== 'preview') return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(generatedHtml);
    doc.close();
  }, [generatedHtml, viewMode]);

  const selectedStyle = STYLES.find(s => s.id === style) ?? STYLES[0];

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error('Describe the website you want'); return; }
    setStatus('generating');
    setErrorMsg('');
    // Capture session ID for guest tracking BEFORE async calls
    const guestSessionId = getDeviceId();

    // Deduct builder credits before generation
    const CREDIT_COST = 900; // static website generation cost
    if (user) {
      const { error: deductError } = await supabase.rpc('deduct_builder_credits', {
        p_user_id: user.id,
        p_amount: CREDIT_COST,
        p_reason: `Website Builder: ${prompt.slice(0, 60)}`,
      });
      if (deductError) {
        // Check if it's an insufficient credits error
        const msg = deductError.message ?? '';
        if (msg.includes('INSUFFICIENT_BUILDER_CREDITS') || msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('credit')) {
          setErrorMsg('Not enough builder credits. Purchase more credits to continue building.');
          setStatus('failed');
          toast.error('Not enough builder credits — buy more in the Token Shop.');
          return;
        }
        // Non-fatal: log and continue (don't block generation on deduct failure)
        console.warn('[WebsiteBuilder] builder credit deduction failed (non-fatal):', msg);
      } else {
        // Refresh local builder credit display
        supabase.from('user_profiles').select('builder_credits').eq('id', user.id).single()
          .then(({ data }) => { /* UI refresh handled by parent if needed */ });
      }
    }

    try {
      const html = await callWebsiteBuilderAI(prompt, style, selectedPages);
      if (generatedHtml) pushVersion(generatedHtml, `Build: ${prompt.slice(0, 30)}…`);
      setShareUrl(null);
      setGeneratedHtml(html);
      setCurrentPrompt(prompt);
      setStatus('completed');
      setViewMode('preview');

      const name = projectName.trim() || prompt.split(' ').slice(0, 5).join(' ');
      setProjectName(name);

      // Save to DB
      if (user) {
        await supabase.from('website_projects').insert({
          user_id: user.id,
          name,
          prompt,
          style,
          pages: selectedPages,
          generated_html: html,
          status: 'completed',
          credit_cost: CREDIT_COST,
          owner_session_id: guestSessionId,
        });
        loadProjects();
      }
      toast.success('🔥 Website built! Looking fire.');
      // Auto-enter full-screen preview on mobile
      if (window.innerWidth < 768) {
        setMobileFullscreen(true);
        setShowMobileSidebar(false);
      }
    } catch (err) {
      const errObj = err as Error & { websiteGateLimitExceeded?: boolean; ownerType?: string };
      const msg = errObj.message || 'Generation failed — try again';
      // Check for website gate limit (403 from backend)
      if (msg.includes('websiteGateLimitExceeded') || errObj.websiteGateLimitExceeded) {
        const ownerType = errObj.ownerType ?? (user ? 'user' : 'guest');
        setShowGateModal({ ownerType: ownerType as 'guest' | 'user' });
        setStatus('idle');
        return;
      }
      // Also check the JSON error body pattern
      if (msg.includes("You've used your free website")) {
        setShowGateModal({ ownerType: user ? 'user' : 'guest' });
        setStatus('idle');
        return;
      }
      setErrorMsg(msg);
      setStatus('failed');
      toast.error(msg);
    }
  };

  const handleEdit = async () => {
    if (!editInstruction.trim() || !generatedHtml) return;
    setIsEditing(true);
    try {
      const updated = await callWebsiteBuilderAI(
        currentPrompt,
        style,
        selectedPages,
        editInstruction,
        generatedHtml
      );
      pushVersion(generatedHtml, `Before: ${editInstruction.slice(0, 32)}`);
      setShareUrl(null);
      setGeneratedHtml(updated);
      setEditInstruction('');
      toast.success('Updated! Check the preview 👀');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Edit failed');
    } finally {
      setIsEditing(false);
    }
  };

  const handleLoadProject = async (project: SavedProject) => {
    if (project.generated_html) {
      setGeneratedHtml(project.generated_html);
      setCurrentPrompt(project.prompt);
      setPrompt(project.prompt);
      setStyle(project.style);
      setProjectName(project.name);
      setStatus('completed');
      setViewMode('preview');
      setShowProjects(false);
      toast.success(`Loaded: ${project.name}`);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(generatedHtml).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
      toast.success('Code copied!');
    });
  };

  const PAGE_OPTIONS = [
    { id: 'home',       label: 'Hero' },
    { id: 'features',   label: 'Features' },
    { id: 'pricing',    label: 'Pricing' },
    { id: 'testimonials', label: 'Reviews' },
    { id: 'about',      label: 'About' },
    { id: 'portfolio',  label: 'Portfolio' },
    { id: 'blog',       label: 'Blog' },
    { id: 'contact',    label: 'Contact' },
    { id: 'faq',        label: 'FAQ' },
    { id: 'team',       label: 'Team' },
    { id: 'gallery',    label: 'Gallery' },
    { id: 'services',   label: 'Services' },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#020a04' }}>

      {/* ── Mobile Full-Screen Preview Overlay ──────────────────────────── */}
      {mobileFullscreen && status === 'completed' && (
        <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: '#000' }}>
          {/* Top micro-bar */}
          <div
            className="flex items-center gap-2 px-3 py-2 shrink-0"
            style={{ background: 'rgba(2,8,3,0.97)', borderBottom: `1px solid ${GREEN}22`, paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
          >
            <button
              onClick={() => setMobileFullscreen(false)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all"
              style={{ background: `${GREEN}0c`, border: `1px solid ${GREEN}33`, color: GREEN }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />Back
            </button>
            <div className="flex-1 min-w-0 px-2">
              <span className="text-[11px] font-semibold truncate block" style={{ color: `${GREEN}66` }}>
                {projectName || 'Your Website'}
              </span>
            </div>
            <div className="flex items-center gap-1 rounded-full px-1" style={{ background: 'rgba(10,15,10,0.7)', border: `1px solid ${GREEN}18` }}>
              {(['desktop','tablet','mobile'] as Viewport[]).map(vp => {
                const Icon = VIEWPORT_CONFIG[vp].icon;
                return (
                  <button
                    key={vp}
                    onClick={() => setViewport(vp)}
                    className="w-7 h-7 flex items-center justify-center rounded-full transition-all"
                    style={{ background: viewport === vp ? `${GREEN}18` : 'transparent', color: viewport === vp ? GREEN : `${GREEN}44` }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* iframe fills remaining space */}
          <div className="flex-1 overflow-hidden flex items-start justify-center" style={{ background: 'hsl(224 20% 6%)' }}>
            <div
              className="flex flex-col h-full transition-all duration-300 overflow-hidden"
              style={{
                width: VIEWPORT_CONFIG[viewport].width,
                maxWidth: '100%',
                minWidth: '320px',
              }}
            >
              <iframe
                ref={iframeRef}
                className="flex-1 w-full"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                title="Website Preview Fullscreen"
                style={{ background: '#fff' }}
              />
            </div>
          </div>

          {/* Floating bottom toolbar */}
          <div
            className="shrink-0 flex items-center justify-center gap-3 px-4 py-3"
            style={{
              background: 'rgba(2,8,3,0.97)',
              borderTop: `1px solid ${GREEN}22`,
              paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Edit button */}
            <button
              onClick={() => { setMobileFullscreen(false); setShowMobileSidebar(true); }}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-black transition-all active:scale-95"
              style={{ background: `${VIOLET}14`, border: `1px solid ${VIOLET}44`, color: VIOLET, minWidth: 90 }}
            >
              <Wand2 className="w-4 h-4" />Edit
            </button>

            {/* Open in new tab */}
            <button
              onClick={() => openInNewTab(generatedHtml)}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-black transition-all active:scale-95"
              style={{ background: `${CYAN}0c`, border: `1px solid ${CYAN}44`, color: CYAN, minWidth: 90 }}
            >
              <ExternalLink className="w-4 h-4" />Open
            </button>

            {/* Download */}
            <button
              onClick={() => downloadHtml(generatedHtml, projectName)}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-black transition-all active:scale-95 shine-sweep relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, hsl(142 70% 28%), hsl(142 70% 20%))`,
                border: `1px solid ${GREEN}55`,
                color: '#fff',
                boxShadow: `0 2px 16px ${GREEN}33`,
                minWidth: 110,
              }}
            >
              <Download className="w-4 h-4" />Download
            </button>
          </div>
        </div>
      )}

      {/* ── Mobile top bar ─────────────────────────────────────────────── */}
      <div className="flex md:hidden items-center gap-2 px-3 py-2 shrink-0" style={{ background: 'rgba(3,10,5,0.98)', borderBottom: `1px solid ${GREEN}20` }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${GREEN}14`, border: `1px solid ${GREEN}44` }}>
          <LayoutTemplate className="w-3.5 h-3.5" style={{ color: GREEN }} />
        </div>
        <p className="text-xs font-black text-white flex-1 truncate" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>AI Website Builder</p>
        {status === 'completed' && (
          <>
            <button
              onClick={() => { setMobileFullscreen(true); setShowMobileSidebar(false); }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all active:scale-95"
              style={{ background: `${GREEN}18`, border: `1px solid ${GREEN}55`, color: GREEN, boxShadow: `0 0 10px ${GREEN}22` }}
            >
              <Maximize2 className="w-3 h-3" />Preview
            </button>
            <button onClick={() => downloadHtml(generatedHtml, projectName)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-black" style={{ background: `linear-gradient(135deg, ${GREEN}40, ${GREEN}25)`, border: `1px solid ${GREEN}55`, color: '#fff' }}>
              <Download className="w-3 h-3" />Save
            </button>
          </>
        )}
        <button onClick={() => setShowMobileSidebar(v => !v)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all" style={{ background: showMobileSidebar ? `${GREEN}18` : 'rgba(10,15,10,0.9)', border: `1px solid ${showMobileSidebar ? `${GREEN}55` : `${GREEN}22`}`, color: showMobileSidebar ? GREEN : `${GREEN}77` }}>
          <Sparkles className="w-3 h-3" />{showMobileSidebar ? 'Hide' : (status === 'completed' ? 'Edit' : 'Build')}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">

      {/* ── Website Gate Modal ─────────────────────────────────────── */}
      {showGateModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(14px)' }}
          onClick={() => setShowGateModal(null)}
        >
          <div
            className="relative w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ background: 'hsl(224 20% 7%)', border: `1.5px solid ${GREEN}55`, boxShadow: `0 0 80px ${GREEN}22, 0 32px 80px rgba(0,0,0,0.75)` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4" style={{ borderBottom: `1px solid ${GREEN}18` }}>
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0" style={{ background: `${GREEN}14`, border: `1px solid ${GREEN}44` }}>
                  🏗️
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: `${GREEN}88` }}>Website Limit Reached</p>
                  <h3 className="text-lg font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Upgrade to Build More</h3>
                  <p className="text-sm mt-1 leading-relaxed" style={{ color: 'rgba(180,200,190,0.7)' }}>
                    {showGateModal.ownerType === 'guest'
                      ? "You've used your 1 free website. Sign in and upgrade to MockJ Pro to create unlimited websites."
                      : "You've used your 1 free website. Upgrade to MockJ Pro to create unlimited websites."}
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 space-y-2.5">
              {showGateModal.ownerType === 'guest' ? (
                <>
                  <button
                    onClick={() => { window.location.href = '/auth'; }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-sm transition-all active:scale-[0.98]"
                    style={{ background: `linear-gradient(135deg, ${GREEN}dd, ${GREEN}aa)`, color: '#000', boxShadow: `0 4px 24px ${GREEN}44` }}
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => { window.location.href = '/tokens?tab=plans'; }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-sm transition-all active:scale-[0.98]"
                    style={{ background: `${GREEN}18`, border: `1px solid ${GREEN}55`, color: GREEN }}
                  >
                    Upgrade to Pro →
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { window.location.href = '/tokens?tab=plans'; }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-sm transition-all active:scale-[0.98]"
                  style={{ background: `linear-gradient(135deg, ${GREEN}dd, ${GREEN}aa)`, color: '#000', boxShadow: `0 4px 24px ${GREEN}44` }}
                >
                  Upgrade to MockJ Pro →
                </button>
              )}
              <button
                onClick={() => setShowGateModal(null)}
                className="w-full py-2.5 rounded-2xl text-sm font-semibold"
                style={{ background: 'rgba(100,120,200,0.07)', border: '1px solid rgba(100,120,200,0.18)', color: 'rgba(160,180,220,0.55)' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ LEFT SIDEBAR / MOBILE SHEET: Config ══════════════════════════ */}
      <div
        className={cn('flex-col shrink-0 overflow-y-auto transition-all duration-300', 'md:flex md:w-72', showMobileSidebar ? 'flex w-full' : 'hidden md:flex')}
        style={{ background: 'rgba(3, 10, 5, 0.98)', borderRight: `1px solid ${GREEN}20` }}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 shrink-0" style={{ borderBottom: `1px solid ${GREEN}18` }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${GREEN}14`, border: `1px solid ${GREEN}44`, boxShadow: `0 0 16px ${GREEN}22` }}
            >
              <LayoutTemplate className="w-4.5 h-4.5" style={{ color: GREEN, width: 18, height: 18 }} />
            </div>
            <div>
              <h2 className="text-sm font-black text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                AI Website Builder
              </h2>
              <p className="text-[10px]" style={{ color: `${GREEN}77` }}>Describe → Generate → Download</p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">

          {/* Prompt */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: `${GREEN}88` }}>
                What should I build?
              </label>
              <button
                onClick={() => setShowExamples(v => !v)}
                className="text-[9px] font-bold px-2 py-0.5 rounded-full transition-all"
                style={{ background: `${VIOLET}14`, color: VIOLET, border: `1px solid ${VIOLET}33` }}
              >
                Examples ▾
              </button>
            </div>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. A futuristic AI SaaS landing page with neon hero, pricing cards, testimonials, and animated background particles…"
              rows={4}
              className="w-full resize-none outline-none text-xs text-white/80 placeholder-white/20 rounded-xl px-3 py-2.5 leading-relaxed"
              style={{ background: 'rgba(10,15,10,0.9)', border: `1px solid ${GREEN}22`, caretColor: GREEN }}
              onFocus={e => { (e.currentTarget as HTMLTextAreaElement).style.borderColor = `${GREEN}55`; }}
              onBlur={e => { (e.currentTarget as HTMLTextAreaElement).style.borderColor = `${GREEN}22`; }}
            />

            {/* Examples dropdown */}
            {showExamples && (
              <div
                className="mt-1.5 rounded-xl overflow-hidden"
                style={{ background: 'rgba(5, 12, 6, 0.98)', border: `1px solid ${GREEN}22` }}
              >
                {EXAMPLE_PROMPTS.map(ex => (
                  <button
                    key={ex.label}
                    onClick={() => { setPrompt(ex.prompt); setShowExamples(false); }}
                    className="w-full text-left px-3 py-2.5 text-xs transition-all group"
                    style={{ borderBottom: `1px solid ${GREEN}0a` }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${GREEN}0a`; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                  >
                    <span className="font-bold" style={{ color: GREEN }}>{ex.label}</span>
                    <span className="text-white/40 ml-2 text-[10px]">→ use this</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Project name */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: `${GREEN}88` }}>
              Project Name
            </label>
            <input
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="My Awesome Website"
              className="w-full outline-none text-xs text-white/70 placeholder-white/20 rounded-xl px-3 py-2"
              style={{ background: 'rgba(10,15,10,0.9)', border: `1px solid ${GREEN}20`, caretColor: GREEN }}
            />
          </div>

          {/* Style picker */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: `${GREEN}88` }}>
              Visual Style
            </label>
            <button
              onClick={() => setShowStylePicker(v => !v)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all text-left"
              style={{
                background: `${selectedStyle.accent}0c`,
                border: `1px solid ${selectedStyle.accent}44`,
              }}
            >
              {/* Style swatch */}
              <div className="w-8 h-8 rounded-lg shrink-0" style={{ background: selectedStyle.preview, border: `1px solid ${selectedStyle.accent}55` }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-white leading-tight">{selectedStyle.emoji} {selectedStyle.label}</p>
                <p className="text-[9px] mt-0.5" style={{ color: `${selectedStyle.accent}88` }}>{selectedStyle.desc}</p>
              </div>
              <ChevronDown
                className="w-3.5 h-3.5 shrink-0 transition-transform"
                style={{ color: `${selectedStyle.accent}77`, transform: showStylePicker ? 'rotate(180deg)' : 'none' }}
              />
            </button>

            {showStylePicker && (
              <div
                className="mt-1.5 rounded-xl overflow-hidden grid grid-cols-2 gap-px p-1"
                style={{ background: 'rgba(5, 12, 6, 0.98)', border: `1px solid ${GREEN}20` }}
              >
                {STYLES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setStyle(s.id); setShowStylePicker(false); }}
                    className="flex items-center gap-2 p-2 rounded-lg transition-all text-left"
                    style={{
                      background: style === s.id ? `${s.accent}14` : 'transparent',
                      border: style === s.id ? `1px solid ${s.accent}44` : '1px solid transparent',
                    }}
                  >
                    <div className="w-6 h-6 rounded-md shrink-0" style={{ background: s.preview }} />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold truncate" style={{ color: style === s.id ? s.accent : 'rgba(200,220,210,0.6)' }}>
                        {s.emoji} {s.label}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sections */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: `${GREEN}88` }}>
              Include Sections
            </label>
            <div className="flex flex-wrap gap-1">
              {PAGE_OPTIONS.map(({ id, label }) => {
                const active = selectedPages.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => setSelectedPages(prev => active ? prev.filter(p => p !== id) : [...prev, id])}
                    className="px-2 py-1 rounded-full text-[10px] font-bold transition-all"
                    style={{
                      background: active ? `${GREEN}16` : 'transparent',
                      border: `1px solid ${active ? `${GREEN}55` : `${GREEN}1a`}`,
                      color: active ? GREEN : `${GREEN}55`,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || status === 'generating'}
            className="relative overflow-hidden w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-black transition-all disabled:opacity-40 active:scale-[0.98] shine-sweep"
            style={{
              background: `linear-gradient(135deg, hsl(142 70% 28%), hsl(142 70% 20%))`,
              border: `1.5px solid ${GREEN}66`,
              color: '#fff',
              boxShadow: `0 4px 30px ${GREEN}44, 0 0 60px ${GREEN}15`,
            }}
            onMouseEnter={e => { if (!e.currentTarget.disabled) (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 40px ${GREEN}66, 0 0 80px ${GREEN}25`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 30px ${GREEN}44, 0 0 60px ${GREEN}15`; }}
          >
            {status === 'generating' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Building… {BUILD_STEPS[buildStep]?.icon}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {status === 'completed' ? 'Rebuild Website' : 'Build Website'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Error */}
          {status === 'failed' && errorMsg && (
            <div className="px-3 py-2.5 rounded-xl flex items-start gap-2" style={{ background: `${RED}08`, border: `1px solid ${RED}33` }}>
              <X className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: RED }} />
              <p className="text-xs" style={{ color: `${RED}cc` }}>{errorMsg}</p>
            </div>
          )}

          {/* AI Edit — only after build */}
          {status === 'completed' && (
            <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(10,15,10,0.9)', border: `1px solid ${VIOLET}25` }}>
              <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${VIOLET}15` }}>
                <Wand2 className="w-3.5 h-3.5" style={{ color: VIOLET }} />
                <span className="text-[11px] font-black" style={{ color: VIOLET }}>AI Edit</span>
                <span className="text-[9px] ml-1" style={{ color: `${VIOLET}55` }}>Tell Mock what to change</span>
              </div>
              <div className="p-2.5 flex flex-col gap-2">
                <textarea
                  value={editInstruction}
                  onChange={e => setEditInstruction(e.target.value)}
                  placeholder={`e.g. "Make the hero more dramatic with a video background"\n"Add a testimonials carousel section"\n"Change theme to dark luxury with gold accents"\n"Make it more minimal and clean"`}
                  rows={3}
                  className="w-full bg-transparent resize-none outline-none text-xs text-white/60 placeholder-white/20 leading-relaxed"
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleEdit(); }}
                />
                <button
                  onClick={handleEdit}
                  disabled={!editInstruction.trim() || isEditing}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-all disabled:opacity-40"
                  style={{ background: `${VIOLET}18`, border: `1px solid ${VIOLET}44`, color: VIOLET }}
                >
                  {isEditing ? <><Loader2 className="w-3 h-3 animate-spin" />Editing…</> : <><Wand2 className="w-3 h-3" />Apply Edit</>}
                </button>
              </div>
            </div>
          )}

          {/* Saved projects */}
          {user && savedProjects.length > 0 && (
            <div>
              <button
                onClick={() => setShowProjects(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all"
                style={{ background: `${GREEN}08`, border: `1px solid ${GREEN}22`, color: `${GREEN}88` }}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                My Projects ({savedProjects.length})
                <ChevronDown className="w-3 h-3 ml-auto transition-transform" style={{ transform: showProjects ? 'rotate(180deg)' : 'none' }} />
              </button>

              {showProjects && (
                <div className="mt-1.5 space-y-1">
                  {savedProjects.map(p => {
                    const pStyle = STYLES.find(s => s.id === p.style);
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleLoadProject(p)}
                        className="w-full text-left px-3 py-2.5 rounded-xl transition-all group"
                        style={{ background: 'rgba(10,15,10,0.9)', border: `1px solid ${GREEN}15` }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = `${GREEN}44`; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = `${GREEN}15`; }}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          {pStyle && <div className="w-4 h-4 rounded shrink-0" style={{ background: pStyle.preview }} />}
                          <p className="text-xs font-bold text-white/80 truncate">{p.name}</p>
                        </div>
                        <p className="text-[9px] truncate" style={{ color: `${GREEN}55` }}>{p.prompt.slice(0, 45)}…</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Bottom spacer */}
          <div className="h-4" />
        </div>
      </div>

      {/* ══ MAIN AREA: Preview / Code ══════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Toolbar */}
        <div
          className="flex items-center gap-2 px-4 py-2.5 shrink-0"
          style={{ background: 'rgba(2, 8, 3, 0.96)', borderBottom: `1px solid ${GREEN}20` }}
        >
          {status === 'completed' ? (
            <>
              {/* View mode */}
              <div className="flex items-center rounded-xl overflow-hidden" style={{ border: `1px solid ${GREEN}25` }}>
                {([
                  { mode: 'preview' as ViewMode, icon: Eye,   label: 'Preview' },
                  { mode: 'code'    as ViewMode, icon: Code2, label: 'Code' },
                ] as const).map(({ mode, icon: Icon, label }) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold transition-all"
                    style={{
                      background: viewMode === mode ? `${GREEN}18` : 'transparent',
                      color: viewMode === mode ? GREEN : `${GREEN}55`,
                      borderRight: mode === 'preview' ? `1px solid ${GREEN}20` : 'none',
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />{label}
                  </button>
                ))}
              </div>

              {/* Viewport */}
              {viewMode === 'preview' && (
                <div className="flex items-center rounded-xl overflow-hidden" style={{ border: `1px solid ${GREEN}22` }}>
                  {(Object.entries(VIEWPORT_CONFIG) as [Viewport, typeof VIEWPORT_CONFIG[Viewport]][]).map(([vp, { icon: Icon, label }]) => (
                    <button
                      key={vp}
                      onClick={() => setViewport(vp)}
                      className="w-8 h-8 flex items-center justify-center transition-all"
                      title={label}
                      style={{
                        background: viewport === vp ? `${GREEN}18` : 'transparent',
                        color: viewport === vp ? GREEN : `${GREEN}44`,
                        borderRight: vp !== 'mobile' ? `1px solid ${GREEN}18` : 'none',
                      }}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
              )}

              {/* Project name */}
              <div className="flex-1 min-w-0 px-2">
                <span className="text-xs font-semibold truncate" style={{ color: `${GREEN}66` }}>
                  {projectName || 'Untitled Website'}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">

                {/* Version history */}
                {versions.length > 0 && (
                  <div className="relative" data-versions-panel>
                    <button
                      onClick={() => setShowVersions(v => !v)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                      style={{ background: showVersions ? `${GOLD}18` : `${GOLD}0a`, border: `1px solid ${showVersions ? `${GOLD}55` : `${GOLD}28`}`, color: GOLD }}
                      title="Version history"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span className="tabular-nums">{versions.length}</span>
                      <ChevronDown className="w-3 h-3 transition-transform" style={{ transform: showVersions ? 'rotate(180deg)' : 'none' }} />
                    </button>
                    {showVersions && (
                      <div
                        className="absolute right-0 top-9 w-64 rounded-2xl overflow-hidden z-50 shadow-2xl"
                        style={{ background: 'hsl(224 20% 7%)', border: `1px solid ${GOLD}33`, boxShadow: `0 16px 48px rgba(0,0,0,0.75), 0 0 24px ${GOLD}10` }}
                      >
                        <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: `1px solid ${GOLD}18` }}>
                          <Clock className="w-3 h-3" style={{ color: GOLD }} />
                          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: GOLD }}>Version History</span>
                          <span className="ml-auto text-[9px]" style={{ color: `${GOLD}55` }}>click to restore</span>
                        </div>
                        {versions.map((v, i) => (
                          <button
                            key={i}
                            onClick={() => handleUndo(v)}
                            className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-all"
                            style={{ borderBottom: `1px solid ${GOLD}0a` }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${GOLD}0a`; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                          >
                            <RotateCcw className="w-3 h-3 shrink-0 mt-0.5" style={{ color: `${GOLD}66` }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-semibold truncate" style={{ color: 'rgba(220,200,160,0.8)' }}>{v.label}</p>
                              <p className="text-[9px] mt-0.5" style={{ color: `${GOLD}55` }}>{v.timestamp.toLocaleTimeString()}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Share preview */}
                {shareUrl ? (
                  <div className="flex items-center gap-1">
                    <div
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold max-w-[120px]"
                      style={{ background: `${CYAN}0c`, border: `1px solid ${CYAN}33`, color: CYAN }}
                    >
                      <Link className="w-3 h-3 shrink-0" />
                      <span className="truncate text-[10px]">Link ready</span>
                    </div>
                    <button
                      onClick={handleCopyShareUrl}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-[11px] font-black transition-all active:scale-95"
                      style={{ background: shareCopied ? `${GREEN}18` : `${CYAN}14`, border: `1px solid ${shareCopied ? `${GREEN}55` : `${CYAN}44`}`, color: shareCopied ? GREEN : CYAN }}
                    >
                      {shareCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleShare}
                    disabled={shareLoading}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all disabled:opacity-50 active:scale-95"
                    style={{ background: `${CYAN}0c`, border: `1px solid ${CYAN}33`, color: CYAN }}
                    title="Upload HTML and get a shareable link"
                  >
                    {shareLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Share2 className="w-3 h-3" />}
                    {shareLoading ? 'Sharing…' : 'Share'}
                  </button>
                )}

                {viewMode === 'code' && (
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                    style={{ background: `${VIOLET}12`, border: `1px solid ${VIOLET}33`, color: VIOLET }}
                  >
                    {codeCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {codeCopied ? 'Copied!' : 'Copy'}
                  </button>
                )}
                <button
                  onClick={() => openInNewTab(generatedHtml)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
                  style={{ background: `${CYAN}0c`, border: `1px solid ${CYAN}33`, color: CYAN }}
                  title="Open in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => downloadHtml(generatedHtml, projectName)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black transition-all shine-sweep relative overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg, hsl(142 70% 28%), hsl(142 70% 20%))`,
                    border: `1px solid ${GREEN}55`,
                    color: '#fff',
                    boxShadow: `0 2px 16px ${GREEN}33`,
                  }}
                >
                  <Download className="w-3 h-3" />
                  Download
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: GREEN }} />
                <span className="text-xs font-semibold" style={{ color: `${GREEN}88` }}>
                  {status === 'generating' ? BUILD_STEPS[buildStep]?.label ?? 'Building…' : 'Ready to build'}
                </span>
              </div>
              <div className="flex-1" />
              <span className="text-[10px]" style={{ color: `${GREEN}44` }}>
                {selectedPages.length} sections · {selectedStyle.emoji} {selectedStyle.label}
              </span>
            </>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden relative">

          {/* ── IDLE STATE ─────────────────────────────────────────────── */}
          {status === 'idle' && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center px-8"
              style={{ background: 'rgba(2, 8, 3, 0.9)' }}
            >
              {/* Ambient glow */}
              <div className="absolute inset-0 pointer-events-none" style={{
                background: `radial-gradient(ellipse at 50% 30%, ${GREEN}06 0%, transparent 60%), radial-gradient(ellipse at 70% 70%, ${VIOLET}04 0%, transparent 50%)`
              }} />

              <div className="relative z-10 max-w-lg text-center space-y-8">
                {/* Icon */}
                <div className="relative flex items-center justify-center">
                  <div
                    className="w-24 h-24 rounded-3xl flex items-center justify-center"
                    style={{
                      background: `${GREEN}0c`,
                      border: `1.5px solid ${GREEN}33`,
                      boxShadow: `0 0 50px ${GREEN}18, 0 0 100px ${GREEN}0a`,
                    }}
                  >
                    <LayoutTemplate className="w-12 h-12" style={{ color: `${GREEN}77` }} />
                  </div>
                  {/* Floating style pills */}
                  {[
                    { label: 'Futuristic', color: VIOLET, pos: 'top-0 -left-16' },
                    { label: 'Luxury', color: GOLD, pos: 'top-0 -right-14' },
                    { label: 'AI SaaS', color: CYAN, pos: 'bottom-0 -left-14' },
                    { label: 'Portfolio', color: RED, pos: 'bottom-0 -right-16' },
                  ].map(p => (
                    <div
                      key={p.label}
                      className={`absolute ${p.pos} px-2 py-1 rounded-full text-[9px] font-black whitespace-nowrap hidden sm:block`}
                      style={{ background: `${p.color}14`, border: `1px solid ${p.color}33`, color: p.color }}
                    >
                      {p.label}
                    </div>
                  ))}
                </div>

                {/* Heading */}
                <div>
                  <h2
                    className="text-2xl font-black text-white mb-2"
                    style={{ fontFamily: 'Space Grotesk, sans-serif', textShadow: `0 0 30px ${GREEN}30` }}
                  >
                    Describe Your Website
                  </h2>
                  <p className="text-sm" style={{ color: `${GREEN}77` }}>
                    MockJ will build a complete, gorgeous website in seconds — with real animations, responsive design, and production-quality code.
                  </p>
                </div>

                {/* Feature pills */}
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    { icon: Sparkles, label: 'AI-Powered Design', color: VIOLET },
                    { icon: Zap, label: 'Live Preview', color: GREEN },
                    { icon: Smartphone, label: 'Mobile Responsive', color: CYAN },
                    { icon: Download, label: 'Download HTML', color: GOLD },
                    { icon: Wand2, label: 'AI Edit Anything', color: PINK },
                    { icon: Layers, label: '10 Visual Styles', color: RED },
                  ].map(({ icon: Icon, label, color }) => (
                    <div
                      key={label}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold"
                      style={{ background: `${color}0c`, border: `1px solid ${color}25`, color }}
                    >
                      <Icon className="w-3 h-3" />
                      {label}
                    </div>
                  ))}
                </div>

                {/* Quick-start examples */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider mb-3" style={{ color: `${GREEN}55` }}>
                    Quick Start — Click to Use
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {EXAMPLE_PROMPTS.slice(0, 4).map(ex => (
                      <button
                        key={ex.label}
                        onClick={() => { setPrompt(ex.prompt); }}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all"
                        style={{ background: 'rgba(10,15,10,0.9)', border: `1px solid ${GREEN}18` }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = `${GREEN}44`; (e.currentTarget as HTMLButtonElement).style.background = `${GREEN}0a`; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = `${GREEN}18`; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(10,15,10,0.9)'; }}
                      >
                        <Star className="w-3 h-3 shrink-0" style={{ color: GOLD }} />
                        <span className="text-[11px] font-semibold text-white/70">{ex.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── GENERATING STATE ───────────────────────────────────────── */}
          {status === 'generating' && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center z-20"
              style={{ background: 'rgba(2, 6, 3, 0.95)', backdropFilter: 'blur(10px)' }}
            >
              <div className="flex flex-col items-center gap-8 max-w-md text-center px-6">
                {/* Spinning icon */}
                <div className="relative w-24 h-24">
                  <div
                    className="absolute inset-0 rounded-3xl"
                    style={{
                      background: `conic-gradient(from 0deg, ${GREEN}, ${VIOLET}, ${CYAN}, ${PINK}, ${GREEN})`,
                      animation: 'orb-rotate 2.5s linear infinite',
                      padding: '2px',
                      borderRadius: '22px',
                    }}
                  >
                    <div className="w-full h-full rounded-[20px]" style={{ background: '#030f05' }} />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Globe className="w-10 h-10" style={{ color: GREEN, animation: 'orb-spin-inner 4s linear infinite' }} />
                  </div>
                  {/* Pulse ring */}
                  <div
                    className="absolute -inset-2 rounded-3xl"
                    style={{ border: `1px solid ${GREEN}33`, animation: 'green-pulse-glow 2s ease-in-out infinite' }}
                  />
                </div>

                {/* Status */}
                <div>
                  <p
                    className="text-xl font-black text-white mb-2"
                    style={{ fontFamily: 'Space Grotesk, sans-serif', textShadow: `0 0 20px ${GREEN}55` }}
                  >
                    Building Your Website
                  </p>
                  <p className="text-sm font-bold" style={{ color: GREEN }}>
                    {BUILD_STEPS[buildStep]?.icon} {BUILD_STEPS[buildStep]?.label}
                  </p>
                  <p className="text-xs mt-1" style={{ color: `${GREEN}55` }}>
                    {selectedStyle.emoji} {selectedStyle.label} style · {selectedPages.length} sections
                  </p>
                </div>

                {/* Progress steps */}
                <div className="w-full flex flex-col gap-2">
                  {BUILD_STEPS.map((step, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-500"
                      style={{
                        background: i === buildStep ? `${GREEN}12` : i < buildStep ? `${GREEN}06` : 'rgba(10,15,10,0.5)',
                        border: `1px solid ${i === buildStep ? `${GREEN}44` : i < buildStep ? `${GREEN}22` : `${GREEN}0a`}`,
                        opacity: i > buildStep ? 0.4 : 1,
                      }}
                    >
                      <span className="text-base">{step.icon}</span>
                      <span className="text-xs font-semibold flex-1 text-left" style={{ color: i === buildStep ? '#fff' : `${GREEN}77` }}>
                        {step.label}
                      </span>
                      {i < buildStep && <Check className="w-3.5 h-3.5" style={{ color: GREEN }} />}
                      {i === buildStep && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: GREEN }} />}
                    </div>
                  ))}
                </div>

                <p className="text-[10px]" style={{ color: `${GREEN}44` }}>
                  Using MockJ AI · Usually takes 15–30 seconds
                </p>
              </div>
            </div>
          )}

          {/* ── PREVIEW ────────────────────────────────────────────────── */}
          {status === 'completed' && viewMode === 'preview' && (
            <div
              className="flex items-start justify-center h-full overflow-auto p-4"
              style={{ background: 'hsl(224 20% 6%)' }}
            >
              {/* Browser chrome mockup */}
              <div
                className="flex flex-col transition-all duration-300 h-full overflow-hidden rounded-2xl shadow-2xl"
                style={{
                  width: VIEWPORT_CONFIG[viewport].width,
                  maxWidth: '100%',
                  minWidth: viewport === 'mobile' ? '320px' : '400px',
                  border: `1px solid ${GREEN}25`,
                  boxShadow: `0 0 60px ${GREEN}10, 0 20px 60px rgba(0,0,0,0.5)`,
                }}
              >
                {/* Browser chrome */}
                <div
                  className="flex items-center gap-2 px-4 py-2.5 shrink-0"
                  style={{ background: 'hsl(224 20% 9%)', borderBottom: `1px solid ${GREEN}15` }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-red-500/70" />
                    <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
                    <span className="w-3 h-3 rounded-full bg-green-500/70" />
                  </div>
                  <div
                    className="flex-1 mx-3 px-3 py-1 rounded-lg text-[11px] text-center truncate"
                    style={{ background: 'hsl(224 20% 14%)', color: `${GREEN}77` }}
                  >
                    {projectName || 'Your Website'} · mockj-preview
                  </div>
                  <button
                    onClick={() => openInNewTab(generatedHtml)}
                    className="w-6 h-6 flex items-center justify-center rounded transition-all"
                    style={{ color: `${GREEN}55` }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = GREEN; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = `${GREEN}55`; }}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                {/* iframe */}
                <iframe
                  ref={iframeRef}
                  className="flex-1 w-full"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                  title="Website Preview"
                  style={{ background: '#fff' }}
                />
              </div>
            </div>
          )}

          {/* ── CODE VIEW ──────────────────────────────────────────────── */}
          {status === 'completed' && viewMode === 'code' && (
            <div
              className="h-full overflow-auto"
              style={{ background: 'hsl(224 20% 5%)' }}
            >
              {/* Code stats bar */}
              <div
                className="flex items-center gap-4 px-4 py-2 shrink-0 sticky top-0 z-10"
                style={{ background: 'hsl(224 20% 7%)', borderBottom: `1px solid ${GREEN}15` }}
              >
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ background: '#ff5f56' }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: '#27c93f' }} />
                </div>
                <span className="text-[10px] font-mono" style={{ color: `${GREEN}77` }}>index.html</span>
                <span className="text-[10px]" style={{ color: `${GREEN}44` }}>
                  {(generatedHtml.length / 1024).toFixed(1)}KB · {generatedHtml.split('\n').length} lines
                </span>
                <div className="flex-1" />
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg transition-all"
                  style={{ background: `${VIOLET}12`, border: `1px solid ${VIOLET}33`, color: VIOLET }}
                >
                  {codeCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {codeCopied ? 'Copied!' : 'Copy All'}
                </button>
              </div>

              {/* Syntax-highlighted code */}
              <pre
                className="p-5 text-[11px] leading-relaxed font-mono overflow-x-auto"
                style={{
                  color: 'rgba(180,210,200,0.75)',
                  fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", monospace',
                  tabSize: 2,
                }}
              >
                {generatedHtml}
              </pre>
            </div>
          )}

          {/* ── FAILED STATE ───────────────────────────────────────────── */}
          {status === 'failed' && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-5"
              style={{ background: 'rgba(2, 6, 3, 0.9)' }}
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: `${RED}10`, border: `1px solid ${RED}33` }}
              >
                <X className="w-8 h-8" style={{ color: RED }} />
              </div>
              <div className="text-center max-w-xs">
                <p className="text-sm font-black text-white mb-1">Build Failed</p>
                <p className="text-xs" style={{ color: `${RED}88` }}>{errorMsg || 'Something went wrong. Try again with a different prompt.'}</p>
              </div>
              <button
                onClick={handleGenerate}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all"
                style={{ background: `${GREEN}18`, border: `1px solid ${GREEN}44`, color: GREEN }}
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>

      </div>{/* end flex row */}
    </div>
  );
}
