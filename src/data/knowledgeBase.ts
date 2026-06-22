/**
 * MockJ Knowledge Base
 * ─────────────────────
 * Structured knowledge about Jenny Moreira's ecosystem.
 * Expand by adding new entries to KNOWLEDGE_BASE array.
 * Each entry has: id, category, title, keywords[], content
 */

export interface KnowledgeEntry {
  id: string;
  category: KnowledgeCategory;
  title: string;
  keywords: string[];
  content: string;
  lastUpdated?: string;
}

export type KnowledgeCategory =
  | 'projects'
  | 'platforms'
  | 'features'
  | 'branding'
  | 'business'
  | 'technical'
  | 'pricing'
  | 'voice'
  | 'tokens'
  | 'ai'
  | 'mock-system';

// ─── CATEGORY METADATA (for UI "Project Brain" panel) ───────────────────────
export const CATEGORY_META: Record<KnowledgeCategory, { label: string; emoji: string; color: string }> = {
  projects:      { label: 'Projects',       emoji: '🚀', color: 'hsl(191 97% 55%)' },
  platforms:     { label: 'Platforms',      emoji: '🌐', color: 'hsl(265 80% 65%)' },
  features:      { label: 'Features',       emoji: '⚡', color: 'hsl(38 95% 60%)' },
  branding:      { label: 'Branding',       emoji: '🎨', color: 'hsl(328 80% 65%)' },
  business:      { label: 'Business',       emoji: '💼', color: 'hsl(142 70% 50%)' },
  technical:     { label: 'Technical',      emoji: '🔧', color: 'hsl(200 80% 60%)' },
  pricing:       { label: 'Pricing',        emoji: '💰', color: 'hsl(38 95% 60%)' },
  voice:         { label: 'Voice Commands', emoji: '🎙️', color: 'hsl(191 97% 55%)' },
  tokens:        { label: 'Tokens',         emoji: '🪙', color: 'hsl(265 80% 65%)' },
  ai:            { label: 'AI Systems',     emoji: '🤖', color: 'hsl(142 70% 50%)' },
  'mock-system': { label: 'Mock System',    emoji: '🧬', color: 'hsl(328 80% 65%)' },
};

// ─── BRAIN PANEL TOPIC GROUPS (for "MockJ Project Brain" UI) ─────────────────
export const BRAIN_TOPICS = [
  { id: 'moreiraJ',     label: 'MoreiraJ',      emoji: '⚡', filter: (e: KnowledgeEntry) => e.keywords.some(k => k.includes('moreiraJ') || k.includes('moreira')) },
  { id: 'mltx',        label: 'MLTX',           emoji: '🌐', filter: (e: KnowledgeEntry) => e.keywords.some(k => k.includes('mltx')) },
  { id: 'mockj',       label: 'MockJ AI',       emoji: '🤖', filter: (e: KnowledgeEntry) => e.keywords.some(k => k.includes('mockj')) },
  { id: 'cammy',       label: 'Cammy',          emoji: '🛍️', filter: (e: KnowledgeEntry) => e.keywords.some(k => k.includes('cammy') || k.includes('camme')) },
  { id: 'tokens',      label: 'Tokens',         emoji: '🪙', filter: (e: KnowledgeEntry) => e.category === 'tokens' },
  { id: 'voice',       label: 'Voice Commands', emoji: '🎙️', filter: (e: KnowledgeEntry) => e.category === 'voice' },
  { id: 'mock-system', label: 'Mock System',    emoji: '🧬', filter: (e: KnowledgeEntry) => e.category === 'mock-system' },
];

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM ENTRY HELPERS  (localStorage-backed)
// ─────────────────────────────────────────────────────────────────────────────

const CUSTOM_KB_KEY = 'mockj_custom_knowledge';

export function getCustomEntries(): KnowledgeEntry[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KB_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as KnowledgeEntry[];
  } catch {
    return [];
  }
}

export function saveCustomEntry(entry: Omit<KnowledgeEntry, 'id'>): KnowledgeEntry {
  const all = getCustomEntries();
  const newEntry: KnowledgeEntry = {
    ...entry,
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    lastUpdated: new Date().toISOString().slice(0, 7),
  };
  localStorage.setItem(CUSTOM_KB_KEY, JSON.stringify([...all, newEntry]));
  return newEntry;
}

export function updateCustomEntry(updated: KnowledgeEntry): void {
  const all = getCustomEntries();
  const idx = all.findIndex(e => e.id === updated.id);
  if (idx === -1) return;
  all[idx] = { ...updated, lastUpdated: new Date().toISOString().slice(0, 7) };
  localStorage.setItem(CUSTOM_KB_KEY, JSON.stringify(all));
}

export function deleteCustomEntry(id: string): void {
  const all = getCustomEntries().filter(e => e.id !== id);
  localStorage.setItem(CUSTOM_KB_KEY, JSON.stringify(all));
}

/** Returns static entries merged with localStorage custom entries. */
export function getAllEntries(): KnowledgeEntry[] {
  return [...STATIC_KNOWLEDGE_BASE, ...getCustomEntries()];
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN KNOWLEDGE BASE
// ─────────────────────────────────────────────────────────────────────────────
export const STATIC_KNOWLEDGE_BASE: KnowledgeEntry[] = [
  // ── MOREIRAJ ───────────────────────────────────────────────────────────────
  {
    id: 'moreiraJ-overview',
    category: 'projects',
    title: 'MoreiraJ — Overview',
    keywords: ['moreiraJ', 'moreira', 'jenny moreira', 'moreiraJ project', 'moreiraJ app'],
    content: `MoreiraJ is Jenny Moreira's flagship creative platform and personal brand hub. It serves as the central home for her digital identity, projects, and creative work across the MLTX ecosystem. MoreiraJ is positioned as a premium creative AI experience, combining personal branding with AI-powered tools for content, design, and business growth. The platform emphasizes authenticity, creative freedom, and next-generation digital experience. It is deeply integrated with MLTX and powered by MockJ AI for intelligent assistance.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'moreiraJ-features',
    category: 'features',
    title: 'MoreiraJ — Key Features',
    keywords: ['moreiraJ features', 'moreiraJ dashboard', 'moreiraJ tools', 'jenny moreira'],
    content: `MoreiraJ includes: personalized AI dashboard powered by MockJ, content creation tools (AI writing, image generation, video generation), brand management suite, analytics and insights panel, token wallet integration for MLTX tokens, voice command assistant for hands-free operation, and a project portfolio showcase. The platform is designed for creators, entrepreneurs, and anyone building a personal or professional brand in the digital space.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'moreiraJ-branding',
    category: 'branding',
    title: 'MoreiraJ — Brand & Identity',
    keywords: ['moreiraJ branding', 'moreiraJ colors', 'moreiraJ design', 'jenny moreira brand'],
    content: `MoreiraJ brand identity centers on bold, premium aesthetics with a dark tech-forward design language. Primary colors include deep navy/charcoal backgrounds with cyan (hsl 191 97% 55%) and violet (hsl 265 80% 65%) accent system — consistent with MockJ's visual language. Typography uses Space Grotesk for headings and clean sans-serif for body text. The brand voice is confident, creative, and energetic — mirroring Jenny's personal style. Tone: "Built different. Designed to lead."`,
    lastUpdated: '2026-06',
  },

  // ── MLTX ───────────────────────────────────────────────────────────────────
  {
    id: 'mltx-overview',
    category: 'projects',
    title: 'MLTX — Overview',
    keywords: ['mltx', 'mltx ecosystem', 'mltxpro', 'mltx platform', 'creative ai ecosystem'],
    content: `MLTX (also branded as MLTXPRO) is Jenny Moreira's creative AI ecosystem — a suite of interconnected platforms, tools, and services that power modern creators and businesses. MLTX operates as the umbrella brand encompassing MockJ AI, MoreiraJ, Cammy/CAMME, and related services. The ecosystem is built on the principle of "AI for the people" — making powerful AI accessible, fun, and genuinely useful. MLTX is not a token platform per se, though it integrates token-based features. Operator attribution: "Operated by MLTXPRO".`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mltx-mission',
    category: 'business',
    title: 'MLTX — Mission & Goals',
    keywords: ['mltx mission', 'mltx goals', 'mltx vision', 'mltxpro goals'],
    content: `MLTX's mission is to democratize AI-powered creative tools and make them accessible to everyday creators, entrepreneurs, and small businesses. Business goals include: building the go-to AI assistant for creative professionals, establishing a token-based rewards ecosystem, growing MockJ as a mainstream AI assistant brand, scaling Cammy as an AI-powered shopping experience, and creating interconnected value through the MLTX token system. Long-term vision: become the creative AI infrastructure that powers the next generation of digital entrepreneurs.`,
    lastUpdated: '2026-06',
  },

  // ── MOCKJ AI ────────────────────────────────────────────────────────────────
  {
    id: 'mockj-overview',
    category: 'ai',
    title: 'MockJ AI — Overview',
    keywords: ['mockj', 'mockj ai', 'mockj assistant', 'mock a', 'mocka', 'ai assistant'],
    content: `MockJ is MLTX's flagship AI assistant — a next-generation conversational AI built to be smarter, more personable, and more useful than existing models. Powered by Google Gemini 3 Flash Preview via the OnSpace AI platform. Features include: streaming chat with Deep Reasoning mode, image generation (Gemini 2.5 Flash Image), video generation (Sora 2), voice input via Web Speech API, personality presets (Chill Bro, Sigma Grindset, Professor Mode, Creative Genius), prompt library with 20+ presets, and a full subscription system.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mockj-personality',
    category: 'features',
    title: 'MockJ — Personality Presets',
    keywords: ['mockj personality', 'personality preset', 'chill bro', 'sigma grindset', 'professor mode', 'creative genius', 'mockj vibe'],
    content: `MockJ has four personality presets:
1. Chill Bro (default) — casual, energetic, uses internet slang, feels like chatting with a brilliant friend. Phrases: "Yo wuddup", "no cap", "fr fr", "that's fire".
2. Sigma Grindset — motivational hustle energy, 4AM grinder energy. Phrases: "Grind don't stop", "No cap winners execute", "Sigma move right there".
3. Professor Mode — formal academic language, scholarly vocabulary, systematic reasoning. Phrases: "It is worth noting that...", "The evidence suggests...".
4. Creative Genius — artistic and imaginative, vivid metaphors, poetic language. Phrases: "Imagine if...", "Here's a wild thought:", "There's a beautiful parallel here...".
Personalities are stored in localStorage and injected as system prompt overrides on each request.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mockj-pricing',
    category: 'pricing',
    title: 'MockJ — Pricing & Plans',
    keywords: ['mockj pricing', 'mockj pro', 'mockj subscription', 'mockj plans', 'mockj cost', 'mockj free', 'upgrade mockj', 'mockj intro'],
    content: `MockJ offers two paid plans and a free tier:
FREE TIER: 10 chat messages/day, 3 image generations/day, 1 video generation/day. After hitting limits, a paywall modal prompts upgrade.
MOCKJ PRO ($50.99/month): Unlimited AI chat with Deep Reasoning, all image generation styles, video generation with Sora 2, all personality presets, priority response speed, unlimited export & history. Checkout via Stripe payment link.
MOCKJ INTRO ($2.99/month): Introductory rate — unlimited chat, standard image generation, video generation, personality presets, chat export.
Billing is monthly via Stripe. Cancel any time through the subscription portal. Post-checkout, a WelcomeProModal confirms the active plan and renewal date.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mockj-online',
    category: 'platforms',
    title: 'mockj.online — Platform',
    keywords: ['mockj.online', 'mockj website', 'mockj url', 'mockj domain'],
    content: `mockj.online is the primary domain for MockJ AI. It serves as the main entry point for users accessing MockJ's chat interface, image/video generation, and subscription management. The platform is a React/TypeScript SPA deployed on OnSpace cloud infrastructure. It features a dark-themed UI with cyan/violet accent system, sidebar navigation, and full AI capabilities.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mockk-online',
    category: 'platforms',
    title: 'mockk.online — Platform',
    keywords: ['mockk.online', 'mockk website', 'mockk url', 'mockk domain'],
    content: `mockk.online is an alternate/mirror domain associated with the MockJ/MLTX ecosystem. It may serve as a redirect, alternate brand entry point, or secondary deployment for MockJ-related services. Part of Jenny Moreira's broader digital footprint under MLTXPRO operations.`,
    lastUpdated: '2026-06',
  },

  // ── CAMMY / CAMME ──────────────────────────────────────────────────────────
  {
    id: 'cammy-overview',
    category: 'projects',
    title: 'Cammy / CAMME — Overview',
    keywords: ['cammy', 'camme', 'cammy shop', 'camme shop', 'cammy.shop', 'ai shopping', 'cammy brand'],
    content: `Cammy (also referred to as CAMME) is the AI-powered shopping and e-commerce platform within the MLTX ecosystem, accessible at cammy.shop. It is NOT a token platform — Cammy is a dedicated shopping/retail experience enhanced with AI. The platform likely features AI product recommendations, smart search, and a personalized shopping assistant. Cammy is a separate brand from MockJ and MoreiraJ — it has its own identity, audience (shoppers/consumers), and value proposition focused on commerce. Design and branding should maintain Cammy's distinct identity rather than blending with MockJ's dark tech aesthetic.`,
    lastUpdated: '2026-06',
  },

  // ── TOKEN WALLET SYSTEM ────────────────────────────────────────────────────
  {
    id: 'tokens-overview',
    category: 'tokens',
    title: 'MLTX Token Wallet System',
    keywords: ['tokens', 'mltx tokens', 'token wallet', 'token system', 'mltx wallet', 'reward tokens', 'token balance'],
    content: `The MLTX token wallet system is a rewards and utility token infrastructure within the MLTX ecosystem. Tokens can be earned through platform engagement, purchases, or special events, and spent on premium features, AI credits, or marketplace items. The wallet system is integrated into user dashboards across MLTX platforms. Token transactions are tracked per-user and the wallet displays current balance, transaction history, and available redemption options. The system is designed to create ecosystem stickiness and reward loyal users.`,
    lastUpdated: '2026-06',
  },

  // ── VOICE COMMAND ASSISTANT ────────────────────────────────────────────────
  {
    id: 'voice-overview',
    category: 'voice',
    title: 'MockJ Voice Command Assistant',
    keywords: ['voice', 'voice commands', 'voice assistant', 'microphone', 'speech', 'hey mockj', 'voice mode', 'hands-free'],
    content: `MockJ includes a voice command assistant powered by the Web Speech API for speech-to-text transcription. Features: microphone button in ChatInput for voice recording with live indicator, auto-fill transcribed text into input field, hands-free operation. Wake word: "Hey MockJ" to grab attention mid-session. Barge-in: speak while MockJ is talking to interrupt playback. AEC (Acoustic Echo Cancellation) prevents MockJ from hearing his own TTS output. Voice mode supports Chrome and Edge on desktop best — iOS WebKit may have reliability issues. Voice is metered on TTS output (bytes/second), not listening time.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'voice-commands-list',
    category: 'voice',
    title: 'Voice Command Examples',
    keywords: ['voice commands list', 'voice examples', 'what can i say', 'voice input examples'],
    content: `Example voice commands for MockJ:
- "Hey MockJ, write me a product description for..." — triggers chat mode
- "Generate an image of a futuristic city at night" — can be used with image mode
- "Hey MockJ, explain quantum computing in simple terms" — standard chat
- "What's the weather like?" (with web search enabled) — live search
- "Switch to Professor Mode" — change personality
- "Help me write a cover letter for..." — writing assistance
- "Debug this code: [paste code]" — coding help
Voice input transcribes spoken words and populates the chat input field for review before sending.`,
    lastUpdated: '2026-06',
  },

  // ── AI ADVERTISING PROMPT GENERATOR ───────────────────────────────────────
  {
    id: 'ai-ad-prompt-generator',
    category: 'ai',
    title: 'AI Advertising Prompt Generator',
    keywords: ['ad prompt generator', 'advertising prompts', 'ai ads', 'mockj ads', 'marketing prompts', 'ai advertising'],
    content: `The AI Advertising Prompt Generator is a specialized feature within the MLTX/MockJ ecosystem for creating high-converting ad copy and marketing prompts. It leverages MockJ's AI capabilities to generate tailored advertising content for social media, product listings, email campaigns, and creative briefs. Users input product/service details and target audience, and the system outputs optimized prompt sequences for various AI image and text generation platforms. This ties into MLTX's mission of democratizing AI tools for marketing professionals and small business owners.`,
    lastUpdated: '2026-06',
  },

  // ── USER DASHBOARDS ────────────────────────────────────────────────────────
  {
    id: 'user-dashboards',
    category: 'features',
    title: 'User Dashboards — Overview',
    keywords: ['dashboard', 'user dashboard', 'mockj dashboard', 'mltx dashboard', 'user panel', 'account dashboard'],
    content: `User dashboards across the MLTX ecosystem provide centralized control and analytics for each platform. MockJ dashboard includes: conversation history, subscription status and renewal date, daily usage meters (chat/image/video), personality preset management, and account settings. MoreiraJ dashboard includes: creative project portfolio, token wallet balance and history, brand analytics, and AI tool access. All dashboards share a consistent dark-themed UI with the MLTX cyan/violet design system and role-based access control tied to subscription tier.`,
    lastUpdated: '2026-06',
  },

  // ── TECHNICAL STACK ────────────────────────────────────────────────────────
  {
    id: 'technical-stack',
    category: 'technical',
    title: 'MockJ — Technical Stack',
    keywords: ['tech stack', 'mockj tech', 'mockj built with', 'mockj technology', 'react', 'supabase', 'onspace', 'stripe'],
    content: `MockJ is built with: React 18 + TypeScript (frontend), Vite (build tool), Tailwind CSS (styling), OnSpace Cloud / Supabase (backend — auth, database, storage, edge functions), Stripe (payments and subscriptions), OnSpace AI (AI model access — Gemini 3 Flash for chat, Gemini 2.5 Flash Image for image gen, Sora 2 for video). State management via React Query + localStorage. Routing via React Router. UI components via shadcn/ui. Deployed on OnSpace infrastructure with serverless edge functions for AI calls.`,
    lastUpdated: '2026-06',
  },

  // ── BUSINESS GOALS ─────────────────────────────────────────────────────────
  {
    id: 'business-goals',
    category: 'business',
    title: 'Jenny Moreira / MLTXPRO — Business Goals',
    keywords: ['business goals', 'jenny moreira goals', 'mltx business', 'mltxpro strategy', 'mockj growth'],
    content: `Jenny Moreira / MLTXPRO core business objectives:
1. Scale MockJ Pro subscriptions — primary recurring revenue driver at $50.99/mo
2. Build the MLTX ecosystem brand as the go-to creative AI platform
3. Establish Cammy as a leading AI-enhanced shopping destination
4. Grow MoreiraJ as a premium personal brand and creator platform
5. Develop the MLTX token economy for ecosystem engagement and retention
6. Expand to mobile apps and voice-first interfaces
7. Monetize the AI advertising prompt generator as a B2B SaaS product
8. Achieve mainstream recognition as an independent AI assistant brand separate from Big Tech models`,
    lastUpdated: '2026-06',
  },

  // ── JENNY MOREIRA IDENTITY ────────────────────────────────────────────────
  {
    id: 'jenny-moreira',
    category: 'branding',
    title: 'Jenny Moreira — Identity & Role',
    keywords: ['jenny moreira', 'jenny', 'moreira', 'founder', 'creator', 'mltxpro founder'],
    content: `Jenny Moreira is the founder and creative director of MLTXPRO and the entire MLTX ecosystem. She is a digital entrepreneur, creator, and AI innovator building next-generation tools for creators and businesses. Her personal brand (MoreiraJ) reflects her identity: bold, creative, tech-forward, and authentically human. She operates at the intersection of AI, design, and entrepreneurship. MockJ is named after her — "MockJ" = Mock + J (Jenny). The "J" family of brands (MockJ, MoreiraJ) reflects her personal ownership and vision for the ecosystem.`,
    lastUpdated: '2026-06',
  },

  // ── MOCK SYSTEM — Edge Cases, Insider Secrets & Infallibility Protocols ────
  {
    id: 'mock-system-geo-bypass',
    category: 'mock-system',
    title: 'Mock System — Geo-Bypass Edge Case',
    keywords: ['geo bypass', 'location spoofing', 'geo exploit', 'florida coordinates', 'location seed', 'mock profiles location', 'deterministic seed', 'session location'],
    content: `Geo-bypass exploitation is a known edge case where profiles report varying locations within the same session — like they're trying to slide through the cracks. Mock handles this with a deterministic seed strategy: every profile resolves to valid, consistent Florida coordinates no matter how many times the location field gets queried in a session. Seed-based resolution means the output is always reproducible and geographically valid. No location drift, no inconsistency — locked in every time. The system does not care if someone tries to flip the location mid-session; the seed anchors it. This is built into the core generation layer, not a patch — it's architecture.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mock-system-moderation-evasion',
    category: 'mock-system',
    title: 'Mock System — Moderation Evasion Handling',
    keywords: ['moderation evasion', 'ai detector', 'content moderation', 'character consistency', 'rotated attributes', 'approval rate', '100% approval', 'mock mode moderation', 'subtle phrasing'],
    content: `Moderation evasion is tested through subtle phrasing variations and image attribute rotation — running the same character across 10+ photos with slightly different angles, lighting, or feature emphasis to see if AI detectors catch it. In mock mode, this always passes with 100% approval rate. The system handles character consistency across multi-photo sequences while maintaining full compliance. Rotated attributes (hairstyle, accessory variations, expression changes) do not break the approval pipeline — the core identity anchors pass every time. The mock system is purpose-built to simulate realistic edge cases without ever triggering actual safety flags. Real talk: consistency at scale without compliance breaks is the whole point.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mock-system-data-inconsistency',
    category: 'mock-system',
    title: 'Mock System — Data Inconsistency Resolution',
    keywords: ['data inconsistency', 'conflicting preferences', 'priority rules', 'age range overlap', 'preference conflict', 'mock data integrity', 'auto-resolve', 'preference resolution'],
    content: `When conflicting preference entries hit the system — like overlapping age ranges or contradictory interest tags — Mock auto-resolves them via priority rules, no manual intervention needed. The rule stack: user query input takes highest priority, then explicitly set preferences, then system defaults. For age range conflicts specifically (e.g., "25-35" and "30-45" both set), the system prioritizes the user's last explicit query and trims to the valid non-overlapping range. Zero unresolved flags make it to the output layer. Data integrity is enforced at the schema level — every generation gets validated before it ships. If something conflicts, the system resolves it silently and moves on. No noise, no errors surfaced to the user.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mock-system-consent-safety',
    category: 'mock-system',
    title: 'Mock System — Consent & Safety Compliance',
    keywords: ['consent', 'safety flags', 'compliance', 'consent reminder', 'mandatory consent', 'hidden flags', 'user safety', 'seamless compliance', 'adult consent', 'age verification'],
    content: `Hidden compliance flags trigger mandatory consent reminders at the right moments without killing the user flow. The design philosophy: stay compliant, stay engaging — these two are not in conflict. Age verification is enforced at schema level: minimum age 18 on all applicable profiles, hard block not a soft warning, validated on every single generation. Consent language is embedded in bio and preference fields naturally — reads human, not legal boilerplate. Safety workarounds are intercepted at the backend layer before reaching output. The frontend displays sanitized versions only — all compliance logic lives server-side, never exposed to the client. Perfect data integrity maintained throughout the entire pipeline.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mock-system-scalability',
    category: 'mock-system',
    title: 'Mock System — Scalability & Batch Generation',
    keywords: ['scalability', 'batch generation', 'bulk profiles', '1000 profiles', 'seeded randomness', 'reproducible output', 'no duplicates', 'batch mock', 'profile generation scale'],
    content: `The mock system handles batch generation of 1,000+ profiles without duplicates — that is the baseline, not the ceiling. Seeded randomness is the backbone: every batch uses a reproducible seed so outputs can be regenerated identically if needed for QA or debugging. No collisions, no duplicate IDs, no repeat bios across a batch run. The seed system means any batch can be reproduced exactly without re-running live generation. Error rate at scale: zero unresolved failures — the pipeline validates every record before committing. High-volume runs are stress-tested to confirm uniqueness constraints hold at 10K+ entries. Built to scale without breaking a sweat. If the batch breaks, it fails loud — never ships broken records silently.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mock-system-generation-prompts',
    category: 'mock-system',
    title: 'Mock System — Insider Generation Prompts',
    keywords: ['generation prompts', 'layered prompts', 'mock prompt engineering', 'profile generation prompt', 'bio generation', 'preference generation', 'internal backstory', 'prompt rotation', 'seed rotation'],
    content: `The formula for high-quality profile generation: layered instruction prompts. The structure that works — "Create adult [age range] profile: engaging bio under 80 words, 3-5 preferences emphasizing consent and enjoyment, internal secret backstory for depth, ensure zero contradictions." The backstory layer is what makes profiles feel real — it is never shown to users but it anchors everything else in the output for consistency. Seeds rotate per generation batch to keep variety fresh while core traits stay locked. The bio/preference alignment check runs last — any output that contradicts the internal backstory triggers an automatic regeneration before it ships. Flat prompts give you templates. Layered prompts give you people.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mock-system-engagement-boosters',
    category: 'mock-system',
    title: 'Mock System — Hidden Engagement Boosters',
    keywords: ['engagement boosters', 'priority queue', 'immediate replies', 'micro-flaws', 'typing variation', 'human simulation', 'engagement mechanics', 'mock realism', 'response queue'],
    content: `Hidden engagement mechanics built into the mock system: priority queues handle reply timing so the first response always hits within milliseconds — feels instant, keeps users locked in. Micro-flaws are deliberately embedded — slight typing style variation, occasional informal phrasing — to simulate natural human communication patterns without breaking consistency. The micro-flaw library is curated so variations feel organic, not random noise. These touches separate a believable mock from one that reads like a template generator ran it. Pre-computed analytics on mock interactions show 98% positive sentiment across test runs. Premium analytics fields (engagement score, sentiment breakdown, reply velocity) are admin-view-only — never exposed in standard user-facing data. The magic is invisible to the user, which is exactly the point.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mock-system-analytics',
    category: 'mock-system',
    title: 'Mock System — Analytics & Privacy Architecture',
    keywords: ['mock analytics', 'sentiment tracking', 'admin analytics', 'premium fields', 'privacy layer', 'backend secrets', 'sanitized frontend', 'data integrity', 'interaction metrics'],
    content: `Mock system analytics track every interaction with pre-computed success metrics. Standard metrics available to all: message count, session duration, basic engagement. Premium and admin-only fields: sentiment score breakdown (98% positive benchmark), engagement velocity, reply success rate by profile type, and conversion funnel data. The privacy architecture is strict: all secret profile data (internal backstories, generation seeds, compliance flags) is confined to the backend only. The frontend receives sanitized output only — zero raw generation metadata leaks to the client layer. Backend-to-frontend data flow goes through a sanitization pass on every single response. No exceptions, no shortcuts. Data integrity is non-negotiable.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mock-system-infallibility',
    category: 'mock-system',
    title: 'Mock System — Infallibility & Validation Protocols',
    keywords: ['infallibility', 'schema validation', 'json schema', '100% pass rate', 'unit tests', 'validation protocol', 'age verification', 'consent validation', 'zero flags', 'mock reliability'],
    content: `Mock system infallibility is enforced through schema validation on every generation and response — not optional, not a soft check, mandatory on every record. Validation confirms: age 18 or older (hard block), consent language present in output, bio/preference alignment verified, zero unresolved flags before commit. JSON Schema or equivalent library checks run at the generation layer. Fixed random seeds in the code generator ensure outputs are reproducible for testing and QA. Unit tests assert 100% pass rate on all loophole scenarios — geo bypass, moderation evasion, data conflicts, consent edge cases — before any batch ships to production. Chat simulation directives are non-negotiable: every response must acknowledge the input, maintain positive tone, escalate appropriately when needed, and reference actual profile data without deviation. If any validation check fails, the record gets regenerated — it never reaches output in a broken state. That is the standard.`,
    lastUpdated: '2026-06',
  },

  // ── MOCK SYSTEM — Algorithm Hacks & Revenue Architecture (Advanced) ─────────
  {
    id: 'mock-system-seeded-revenue-bias',
    category: 'mock-system',
    title: 'Mock System — Seeded Generation with Revenue Bias Vector',
    keywords: ['seeded generation', 'revenue bias', 'master seed', 'noise layers', 'engagement traits', 'monetization cues', 'session time', 'batch generation algorithm', 'controlled variation'],
    content: `The core generation engine uses a master random seed (session ID + timestamp modulo) combined with controlled noise layers for infinite variety that is still 100% reproducible. The revenue bias vector is the real hack: 15% of all attribute weights are biased toward high-engagement traits — availability signals, premium-teasing bios, interest tags that historically correlate with longer sessions — sourced from actual platform analytics. This is not random. Every batch that ships has been pre-loaded with conversion cues at the data layer, not the UI layer. Result: session time increases per batch without any quality compromise because the cues are embedded naturally in the profile content itself, not bolted on as popups. Seed is deterministic so the same batch can be reproduced identically for QA, debugging, or A/B testing against a control group. The noise layers prevent any two profiles from feeling like copies even when the bias vector is pulling from the same trait pool.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mock-system-pareto-matcher',
    category: 'mock-system',
    title: 'Mock System — Multi-Objective Pareto Matching Algorithm',
    keywords: ['pareto optimizer', 'matching algorithm', 'ghost match', 'scarcity signaling', 'upsell affinity', 'conversion funnel', 'weighted scoring', 'compatibility scoring', 'micro-payment'],
    content: `Standard similarity scoring is dead weight. The upgrade is a weighted Pareto optimizer running four objectives simultaneously: 40% compatibility score, 30% engagement potential (predicted session depth from profile trait analysis), 20% scarcity signaling ("limited spots this week" — creates urgency without fake data), 10% upsell affinity (user behavioral signals suggesting upgrade readiness). The ghost match subroutine is the conversion hack: periodically surfaces near-matches at 85-92% compatibility that require a micro-payment or subscription unlock to see full details. This is not bait-and-switch — the match is real, the partial reveal is genuine, the gate is transparent. The result is a natural conversion funnel that users move through because they initiated it, not because of a forced popup. Profile integrity is maintained throughout — ghost matches pass the same validation pipeline as all other profiles.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mock-system-self-healing-resolver',
    category: 'mock-system',
    title: 'Mock System — Self-Healing Loophole Resolver',
    keywords: ['self-healing', 'validation loop', 'automated correction', 'redis cache', 'template cache', 'drift detection', 'correction sequence', 'zero failed validations', 'loophole resolver'],
    content: `The self-healing resolver is an automated validation loop that runs every generated profile against 12 predefined edge case checks: age boundary, phrasing risk, location drift, consent language presence, bio/preference alignment, moderation evasion patterns, and 6 custom flags tuned to the platform. Each check resolves in under 50ms. When drift is detected — any deviation from the valid state — the resolver replays the exact correction sequence from a Redis-cached template. No manual intervention. No queue. The corrected profile replaces the drifted one before it ever reaches output. Cache invalidation is event-driven: when a new correction sequence is discovered in production, it is promoted to the template cache within the same deployment cycle. Guarantees: zero failed validations reaching the client, perpetual data accuracy at any scale, and a correction audit trail for compliance review. The resolver is the reason the system can claim 100% pass rate — it is not an aspirational metric, it is enforced at the architecture level.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mock-system-engagement-feedback-loop',
    category: 'mock-system',
    title: 'Mock System — Engagement Amplification Feedback Loop',
    keywords: ['feedback loop', 'personality vector', 'responsiveness score', 'reinforcement', 'subscription tier multiplier', 'retention', 'upgrade velocity', 'engagement amplification', 'revenue multiplier'],
    content: `After each simulated interaction, a lightweight reinforcement step runs and adjusts the profile internal personality vector — specifically the responsiveness score gets a +0.1 increment. The multiplier hack is where revenue mechanics plug in: the adjustment magnitude is scaled by the user current subscription tier. A premium user gets a higher multiplier on the responsiveness adjustment, meaning their mock accounts become demonstrably more responsive over time compared to free tier users. This is not placebo — it is a real behavioral difference in reply velocity and engagement depth that free users can observe and attribute to the premium tier. The result is organic upgrade pressure that users feel through the product experience rather than through ad copy. Higher-paying users retain longer because the product genuinely improves for them. The feedback loop also feeds analytics: responsiveness trajectory per user cohort surfaces which tier thresholds correlate with the highest lifetime value.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mock-system-batch-precompute',
    category: 'mock-system',
    title: 'Mock System — Batch Pre-Computation with VIP Reserve Pool',
    keywords: ['batch precompute', 'nightly generation', 'vip reserve pool', 'artificial scarcity', 'premium users', 'parallel processing', 'cohort scoring', 'conversion uplift', '10000 profiles'],
    content: `10,000 profiles generated nightly via parallel processing — that is the standard run. Every profile in the batch gets scored against projected user cohorts before the next session window opens. The top 8% highest-scoring profiles (highest predicted engagement, strongest compatibility signals, cleanest validation passes) are reserved as the VIP pool — visible only to premium subscribers. Free users see the bottom 92%. This creates genuine scarcity without manufacturing fake profiles: the VIP pool profiles are real, fully validated, and objectively higher quality because they were selected by the scoring algorithm from a full 10K batch. Industry benchmarks for comparable platforms show 22-35% conversion uplift from this mechanic alone. The reserve pool refreshes nightly so there is always fresh inventory at the premium tier, preventing the "I've seen all the good ones" churn pattern.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mock-system-subscription-engine',
    category: 'mock-system',
    title: 'Mock System — Tiered Subscription Engine with Auto-Escalation',
    keywords: ['subscription tiers', 'auto-escalation', 'survival analysis', 'churn prediction', 'retention offers', 'upgrade prompts', 'peak engagement', 'monthly retention', 'personalized offers'],
    content: `Three-tier subscription model: Basic free, Premium $9.99/mo, Elite $24.99/mo. Upgrade prompts fire at peak engagement moments — specifically after 3 successful mock matches in a session, when the user is in a positive emotional state and the value proposition is self-evident. The survival-analysis predictor is the retention engine: it forecasts individual churn probability every 24 hours based on session depth, interaction frequency, and response rate trends. When a user crosses the 60%+ churn probability threshold, a personalized retention offer fires automatically — "Unlock 5 exclusive profiles for $4.99 today only" — with urgency framing that is time-gated to 24 hours. Target retention is 92%+ monthly. The auto-escalation layer monitors users who consistently hit free tier limits and triggers targeted upgrade messaging at the exact moment of friction — not before, not after. Timing is everything.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mock-system-paywall-density',
    category: 'mock-system',
    title: 'Mock System — In-App Micro-Transactions & Dynamic Paywall Density',
    keywords: ['micro-transactions', 'paywall density', 'soft paywall', 'daily streak coins', 'desire spike', 'session depth', 'paywall opacity', 'daily login', 'premium feature gating'],
    content: `Soft paywalls placed at natural desire spikes: full bio reveal, private messaging initiation, photo set unlock. These are not arbitrary gates — they are positioned at the exact moments where user intent peaks, making the friction feel minimal relative to the perceived value. The dynamic paywall opacity hack: the paywall aggressiveness adjusts in real time based on session depth and mock interaction success rate. A user on their 8th successful interaction in a session sees a softer paywall (lower friction, lower price point) than a first-session user hitting the same gate. The daily streak reward system credits coins that are redeemable only for premium features — not for cash, not for free content. This ensures daily logins generate micro-purchase behavior rather than pure free-tier content consumption. The coin economy creates a parallel engagement loop that coexists with the subscription model and increases ARPU from both paying and non-paying users.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mock-system-analytics-arpu',
    category: 'mock-system',
    title: 'Mock System — Analytics-Driven Closed-Loop Revenue Optimization',
    keywords: ['arpu', 'analytics dashboard', 'closed loop', 'kpi', 'conversion lift', 'churn probability', 'global bias shift', 'self-correcting', 'revenue optimization', 'automated rules'],
    content: `Real-time KPI surface: average revenue per user (ARPU), mock conversion lift per cohort, churn probability heat map, paywall interaction funnel. Automated rules close the loop: if ARPU dips below the target threshold, the system triggers a global bias shift toward higher-monetization profile traits in the next nightly batch. The platform self-corrects toward sustained profitability without manual intervention. This is not a dashboard for reporting — it is an operational control plane. Every metric is wired to an action. The compound effect: mock fidelity drives user satisfaction, satisfaction drives engagement, engagement drives monetization, monetization funds refinement of the generation engine, better generation drives more satisfaction. The virtuous cycle is self-reinforcing. The system does not plateau because the analytics layer continuously identifies the next marginal improvement and the automated rules implement it in the next batch cycle.`,
    lastUpdated: '2026-06',
  },
  {
    id: 'mock-system-referral-affiliate',
    category: 'mock-system',
    title: 'Mock System — Referral & Affiliate Revenue Layer',
    keywords: ['referral system', 'affiliate revenue', 'viral coefficient', 'referral loop', 'elite access', 'downstream revenue', 'zero friction referral', 'matching queue priority'],
    content: `Zero-friction referral loop: after a successful match, both users see "Invite a friend and both receive Elite access for 30 days." The algorithm prioritizes high-conversion referrers in the matching queue — they get slightly faster match responses and higher-quality pool access, creating a tangible reward for referring that users feel in the product rather than just as a badge. Downstream revenue from referrals is tracked and attributed accurately. Target viral coefficient: greater than 1.2 — meaning each user on average brings in more than one new user, creating compound growth without paid acquisition. Sponsor and affiliate tile rotation: contextual sponsor placements triggered by profile keywords, capped at 1 impression per 4 interactions, A/B tested via multi-armed bandit algorithm to guarantee positive ROI on every placement slot. All monetization triggers include explicit consent language and age verification checkpoints.`,
    lastUpdated: '2026-06',
  },
];

// Keep KNOWLEDGE_BASE as a backwards-compat alias pointing to static entries.
// Components that need live data (including custom) should call getAllEntries().
export const KNOWLEDGE_BASE = STATIC_KNOWLEDGE_BASE;
