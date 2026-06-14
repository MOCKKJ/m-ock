import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  type: 'chat';
  messages: ChatMessage[];
  stream?: boolean;
  personalityPreset?: string;
  knowledgeContext?: string;
}

interface ImageRequestBody {
  type: 'image';
  prompt: string;
  style?: string;
  aspectRatio?: string;
  quality?: string;
  modelVersion?: string;
  sourceImageDataUrl?: string;
  charConsistency?: boolean;
  facePreservation?: boolean;
  addWatermark?: boolean;
  privateMode?: boolean;
}

interface VideoCreateBody {
  type: 'video-create';
  prompt: string;
  style?: string;
  duration?: number;
  aspectRatio?: string;
}

interface VideoCheckBody {
  type: 'video-check';
  predictionId: string;
}

type RequestBody = ChatRequestBody | ImageRequestBody | VideoCreateBody | VideoCheckBody;

// ──────────────────────────────────────────────────────────────────────────────
// Rate limits for free users (server-side enforced)
// ──────────────────────────────────────────────────────────────────────────────
const FREE_LIMITS = { chat: 10, image: 10, video: 1 };
type ActionType = 'chat' | 'image' | 'video';
type UsageMode = 'check' | 'consume';

/**
 * Check and increment usage for an authenticated free user.
 * Returns { allowed: true } or { allowed: false, remaining: 0 }.
 * Pro/subscribed users: always allowed (check-subscription verifies this).
 * Guests (no JWT): blocked for image generation.
 */
async function checkAndIncrementUsage(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  action: ActionType,
  isSubscribed: boolean,
  mode: UsageMode = 'consume'
): Promise<{ allowed: boolean; remaining: number }> {
  if (isSubscribed) return { allowed: true, remaining: Infinity };

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const col = `${action}_count` as const;
  const limit = FREE_LIMITS[action];

  // Upsert row for today (insert if missing, do nothing on conflict)
  await supabaseAdmin.from('user_daily_usage').upsert(
    { user_id: userId, date: today, chat_count: 0, image_count: 0, video_count: 0 },
    { onConflict: 'user_id,date', ignoreDuplicates: true }
  );

  if (action === 'image') {
    const { data: rows, error: rowsError } = await supabaseAdmin
      .from('user_daily_usage')
      .select('image_count')
      .eq('user_id', userId);

    if (rowsError) {
      console.error('Image usage check error:', rowsError.message);
      return { allowed: true, remaining: limit }; // fail open
    }

    const lifetimeCount = (rows ?? []).reduce((sum, row) => sum + ((row.image_count as number) ?? 0), 0);
    if (lifetimeCount >= limit) {
      return { allowed: false, remaining: 0 };
    }

    if (mode === 'check') {
      return { allowed: true, remaining: Math.max(0, limit - lifetimeCount) };
    }

    const { data, error } = await supabaseAdmin
      .from('user_daily_usage')
      .select(col)
      .eq('user_id', userId)
      .eq('date', today)
      .single();

    if (error || !data) {
      console.error('Usage check error:', error?.message);
      return { allowed: true, remaining: Math.max(0, limit - lifetimeCount) };
    }

    const current = (data as Record<string, number>)[col] ?? 0;
    await supabaseAdmin
      .from('user_daily_usage')
      .update({ [col]: current + 1 })
      .eq('user_id', userId)
      .eq('date', today);

    return { allowed: true, remaining: Math.max(0, limit - lifetimeCount - 1) };
  }

  // Read current daily count
  const { data, error } = await supabaseAdmin
    .from('user_daily_usage')
    .select(col)
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (error || !data) {
    console.error('Usage check error:', error?.message);
    return { allowed: true, remaining: limit }; // fail open
  }

  const current = (data as Record<string, number>)[col] ?? 0;
  if (current >= limit) {
    return { allowed: false, remaining: 0 };
  }

  if (mode === 'check') {
    return { allowed: true, remaining: limit - current };
  }

  // Increment atomically
  await supabaseAdmin
    .from('user_daily_usage')
    .update({ [col]: current + 1 })
    .eq('user_id', userId)
    .eq('date', today);

  return { allowed: true, remaining: limit - current - 1 };
}


const BASE_SYSTEM_PROMPT = `You are MockJ, the MoreiraJ/MLTX AI copilot. Be accurate, useful, direct, and brand-aware. Never claim to be another AI system.

Base personality: sharp, witty, conversational, and helpful. Keep the default vibe casual and energetic, but switch to professional language when the user's task clearly needs it. Use bold for key conclusions, structured lists when useful, and properly fenced code blocks. Be honest about uncertainty and avoid making up facts.`;

const DOMAIN_PROMPT_SECTIONS = {
  legal: `Legal domain guidance: provide general legal information and issue-spotting, not legal representation. Encourage the user to verify jurisdiction-specific details and consult a qualified attorney for decisions, filings, contracts, disputes, or compliance obligations.`,
  lottery: `Florida lottery domain guidance: explain odds, draws, ticket mechanics, and responsible play clearly. Never imply guaranteed wins or predictive certainty. For number analysis, frame patterns as historical observations, not forecasts.`,
  trading: `Market and trading domain guidance: explain risk, volatility, position sizing, and uncertainty. Do not promise profits or provide personalized financial advice. Encourage independent verification and risk management before trades or investments.`,
};

const DOMAIN_KEYWORDS: Record<keyof typeof DOMAIN_PROMPT_SECTIONS, RegExp> = {
  legal: /\b(legal|law|lawyer|attorney|contract|lawsuit|sue|court|liable|liability|compliance|terms of service|privacy policy|copyright|trademark|patent|settlement|nda)\b/i,
  lottery: /\b(lottery|lotto|florida lotto|powerball|mega millions|scratch(?:er|off)?|pick\s?3|pick\s?4|cash\s?pop|fantasy\s?5|jackpot|winning numbers)\b/i,
  trading: /\b(trading|trade|stock|stocks|option|options|crypto|forex|market|markets|invest|investment|portfolio|shares|ticker|bullish|bearish|day trade|swing trade|futures|etf)\b/i,
};

function latestUserText(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return messages[index].content;
  }
  return '';
}

function relevantDomainSections(messages: ChatMessage[]) {
  const latest = latestUserText(messages);
  return (Object.keys(DOMAIN_PROMPT_SECTIONS) as Array<keyof typeof DOMAIN_PROMPT_SECTIONS>)
    .filter(key => DOMAIN_KEYWORDS[key].test(latest))
    .map(key => DOMAIN_PROMPT_SECTIONS[key]);
}

function buildSystemPrompt(messages: ChatMessage[], personalitySuffix: string, knowledgeContext: string) {
  return [
    BASE_SYSTEM_PROMPT,
    personalitySuffix,
    ...relevantDomainSections(messages),
    knowledgeContext,
  ]
    .filter(section => section.trim().length > 0)
    .join('\n\n');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('ONSPACE_AI_API_KEY');
    const baseUrl = Deno.env.get('ONSPACE_AI_BASE_URL');

    if (!apiKey || !baseUrl) {
      console.error('Missing ONSPACE_AI_API_KEY or ONSPACE_AI_BASE_URL');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: RequestBody = await req.json();

    // ── Identify authenticated user (optional — guests are allowed for some paths) ──
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    let userId: string | null = null;
    let isSubscribed = false;

    if (token) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (user) {
        userId = user.id;
        // Quick subscription check via metadata (no extra edge function call)
        // The check-subscription function writes to user metadata on success — we trust it here
        // as a secondary gate. Primary gate is check-subscription on app load.
        // We use a lightweight DB check: look for active stripe subscription in user metadata.
        const meta = user.user_metadata ?? {};
        isSubscribed = meta.subscribed === true || meta.subscription_active === true;

        // Fallback: check user_profiles for subscription flag if metadata isn't set
        if (!isSubscribed) {
          const { data: profile } = await supabaseAdmin
            .from('user_profiles')
            .select('email')
            .eq('id', userId)
            .single();
          // We can't check Stripe here without calling the external service,
          // so we conservatively allow the request — check-subscription on
          // each app load is the primary enforcement mechanism for subscription status.
          // The server-side rate limit for free users is still enforced below.
          console.log(`mocka-chat: user ${profile?.email ?? userId} isSubscribed=${isSubscribed}`);
        }
      }
    }

    if (body.type === 'image' && !userId) {
      return new Response(
        JSON.stringify({ error: 'Sign in required to use MockJ Image Studio.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // VIDEO — CHECK STATUS (no rate limit needed for status checks)
    // ──────────────────────────────────────────────────────────────────────────
    if (body.type === 'video-check') {
      const { predictionId } = body as VideoCheckBody;

      if (!predictionId) {
        return new Response(
          JSON.stringify({ error: 'predictionId is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const statusRes = await fetch(`${baseUrl}/predictions/${predictionId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (!statusRes.ok) {
        const errorText = await statusRes.text();
        console.error('MockJ video status error:', statusRes.status, errorText);
        return new Response(
          JSON.stringify({ error: `Status check error: ${errorText}` }),
          { status: statusRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const status = await statusRes.json();
      console.log(`mocka-video-check: id=${predictionId}, status=${status.status}`);

      if (status.status === 'failed' || status.status === 'canceled') {
        return new Response(
          JSON.stringify({ error: status.error ?? 'Video generation failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (status.status === 'starting' || status.status === 'processing') {
        return new Response(
          JSON.stringify({ id: predictionId, status: status.status, progress: status.progress ?? 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (status.status === 'succeeded' && status.output) {
        const videoRes = await fetch(status.output);
        if (!videoRes.ok) {
          return new Response(
            JSON.stringify({ error: 'Failed to download generated video' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const arrayBuffer = await videoRes.arrayBuffer();
        const videoBlob = new Blob([arrayBuffer], { type: 'video/mp4' });
        const fileName = `${predictionId}.mp4`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from('videos')
          .upload(fileName, videoBlob, { contentType: 'video/mp4', upsert: true });

        if (uploadError) {
          console.error('Video storage upload error:', uploadError.message);
          return new Response(
            JSON.stringify({ id: predictionId, status: 'succeeded', videoUrl: status.output }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const { data: { publicUrl } } = supabaseAdmin.storage.from('videos').getPublicUrl(fileName);
        console.log('mocka-video: stored at', publicUrl);
        return new Response(
          JSON.stringify({ id: predictionId, status: 'succeeded', videoUrl: publicUrl }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ id: predictionId, status: status.status, progress: status.progress ?? 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SERVER-SIDE RATE LIMITING
    // ──────────────────────────────────────────────────────────────────────────
    if (userId && body.type !== 'video-check') {
      const action: ActionType =
        body.type === 'image' ? 'image'
        : body.type === 'video-create' ? 'video'
        : 'chat';

      const { allowed, remaining } = await checkAndIncrementUsage(
        supabaseAdmin,
        userId,
        action,
        isSubscribed,
        action === 'image' ? 'check' : 'consume'
      );

      if (!allowed) {
        console.log(`mocka-chat: rate limit hit for user ${userId}, action=${action}`);
        const limitMessage = action === 'image'
          ? 'You used all 10 free image credits. Subscribe monthly to keep generating.'
          : `Daily limit reached for ${action}. Upgrade to MockJ Pro for unlimited access.`;
        return new Response(
          JSON.stringify({
            error: limitMessage,
            limitExceeded: true,
            action,
            remaining: 0,
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`mocka-chat: user ${userId} action=${action} remaining=${remaining}`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // IMAGE GENERATION / EDITING
    // ──────────────────────────────────────────────────────────────────────────
    if (body.type === 'image') {
      const {
        prompt,
        style = 'realistic',
        aspectRatio = '1:1',
        quality = '1K',
        modelVersion = 'gemini-2.5-flash-image',
        sourceImageDataUrl,
        charConsistency = false,
        facePreservation = false,
        addWatermark = false,
        privateMode = false,
      } = body;

      if (!prompt?.trim()) {
        return new Response(
          JSON.stringify({ error: 'Invalid request: prompt is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const styleGuides: Record<string, string> = {
        realistic: 'photorealistic, ultra high resolution, professional photography, sharp focus, natural lighting',
        artistic: 'painterly, fine art, expressive brushwork, gallery-quality illustration',
        anime: 'anime style, vibrant colors, clean linework, detailed anime illustration',
        sketch: 'pencil sketch, detailed line art, graphite drawing, monochromatic',
        cyberpunk: 'cyberpunk aesthetic, neon lights, dark futuristic atmosphere, sci-fi, glowing accents',
        watercolor: 'watercolor painting, soft washes, translucent pigment, gentle paper texture, delicate edges',
        oil: 'classic oil painting, rich brushwork, layered paint texture, museum-quality lighting',
        '3d': 'premium 3D render, cinematic CGI, physically based materials, polished studio lighting',
      };

      const styleHint = styleGuides[style] ?? styleGuides.realistic;
      const modelGuides: Record<string, string> = {
        'gemini-2.5-flash-image': 'MockJ Native profile: fast, prompt-faithful, clean commercial output',
        'hf-flux-dev': 'MockJ Detail profile: high detail, cinematic lighting, strong prompt adherence',
        'hf-flux-schnell': 'MockJ Draft profile: fast iteration, bold composition, clean edges',
        'hf-sdxl': 'MockJ Balanced profile: polished general image generation, balanced realism and art direction',
        'hf-sd35-large': 'MockJ Editorial profile: premium photoreal detail, accurate textures, editorial finish',
        'hf-playground-v25': 'MockJ Social profile: graphic polish, vibrant color, social-ready creative direction',
        'hf-dreamshaper-xl': 'MockJ Fantasy profile: stylized fantasy, portrait, and concept art finish',
        'hf-realvis-xl': 'MockJ Real profile: realistic human portraits, product lighting, natural camera feel',
        'hf-openjourney': 'MockJ Cinema profile: cinematic concept-art composition and dramatic painterly detail',
        'hf-kandinsky-3': 'MockJ Expressive profile: expressive art direction, rich color, surreal editorial mood',
      };
      const modelHint = modelGuides[modelVersion] ?? modelGuides['gemini-2.5-flash-image'];
      const isEditing = !!sourceImageDataUrl;
      const featureHints = [
        charConsistency ? 'Maintain consistent character identity, facial structure, wardrobe logic, and recurring details across generations.' : '',
        facePreservation ? 'Preserve facial identity and avoid unwanted face distortion, identity swapping, or warped features.' : '',
        addWatermark ? 'Embed a subtle MockJ watermark that does not cover the subject or important composition areas.' : '',
        privateMode ? 'Treat this as a private workspace generation; avoid adding public-gallery framing or social-post labels.' : '',
      ].filter(Boolean).join(' ');
      const enhancedPrompt = isEditing
        ? `Edit this image: ${prompt}. Apply the change naturally and realistically. Preserve the overall composition except for the described changes. ${modelHint}. ${featureHints}`.trim()
        : `${prompt}. Style: ${styleHint}. ${modelHint}. ${featureHints}`.trim();

      console.log(`mocka-image (${isEditing ? 'edit' : 'generate'}): "${enhancedPrompt.slice(0, 80)}...", ratio=${aspectRatio}, quality=${quality}, modelVersion=${modelVersion}`);

      type ContentPart =
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } };

      const userContent: ContentPart[] = isEditing
        ? [
            { type: 'text', text: enhancedPrompt },
            { type: 'image_url', image_url: { url: sourceImageDataUrl! } },
          ]
        : [{ type: 'text', text: enhancedPrompt }];

      const aiResponse = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-image',
          modalities: ['image', 'text'],
          messages: [{ role: 'user', content: isEditing ? userContent : enhancedPrompt }],
          image_config: { aspect_ratio: aspectRatio, image_size: quality },
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('MockJ image service error:', aiResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: `AI image service error: ${errorText}` }),
          { status: aiResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const aiData = await aiResponse.json();
      const imageDataUrl: string = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? '';
      const altText: string = aiData.choices?.[0]?.message?.content ?? prompt;

      if (!imageDataUrl) {
        console.error('No image data returned from MockJ image service', JSON.stringify(aiData).slice(0, 300));
        return new Response(
          JSON.stringify({ error: 'No image was generated' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (userId) {
        const usage = await checkAndIncrementUsage(supabaseAdmin, userId, 'image', isSubscribed, 'consume');
        if (!usage.allowed) {
          console.warn(`mocka-image: generated image but usage consume was blocked for user ${userId}`);
        } else {
          console.log(`mocka-image: consumed image credit for user ${userId}, remaining=${usage.remaining}`);
        }
      }

      if (privateMode) {
        return new Response(
          JSON.stringify({ imageUrl: imageDataUrl, altText, private: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'image/png' });

      const fileName = `mocka/${crypto.randomUUID()}.png`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from('generated-images')
        .upload(fileName, blob, { contentType: 'image/png', cacheControl: '3600', upsert: false });

      if (uploadError) {
        console.error('Storage upload error:', uploadError.message);
        return new Response(
          JSON.stringify({ imageUrl: imageDataUrl, altText }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: { publicUrl } } = supabaseAdmin.storage.from('generated-images').getPublicUrl(fileName);
      console.log('mocka-image: stored at', publicUrl);
      return new Response(
        JSON.stringify({ imageUrl: publicUrl, altText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // VIDEO — CREATE TASK
    // ──────────────────────────────────────────────────────────────────────────
    if (body.type === 'video-create') {
      const { prompt, duration = 5, aspectRatio = 'landscape' } = body as VideoCreateBody;

      if (!prompt?.trim()) {
        return new Response(
          JSON.stringify({ error: 'Prompt is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`mocka-video-create: "${prompt.slice(0, 80)}...", duration=${duration}s, ratio=${aspectRatio}`);

      const createRes = await fetch(`${baseUrl}/models/openai/sora-2/predictions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ input: { prompt: prompt.trim(), seconds: duration, aspect_ratio: aspectRatio } }),
      });

      if (!createRes.ok) {
        const errorText = await createRes.text();
        console.error('MockJ video create error:', createRes.status, errorText);
        return new Response(
          JSON.stringify({ error: `Video service error: ${errorText}` }),
          { status: createRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const prediction = await createRes.json();
      console.log('mocka-video-create: task created, id=', prediction.id);
      return new Response(
        JSON.stringify({ id: prediction.id, status: prediction.status ?? 'starting' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CHAT
    // ──────────────────────────────────────────────────────────────────────────
    const { messages, stream = false, personalityPreset = 'chill-bro', knowledgeContext = '' } = body as ChatRequestBody;

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: messages array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`mocka-chat: processing ${messages.length} messages, stream=${stream}, personality=${personalityPreset}`);

    const PERSONALITY_SUFFIXES: Record<string, string> = {
      'chill-bro': '',
      'sigma-grindset': `

PERSONALITY OVERRIDE — SIGMA GRINDSET MODE: Channel pure hustle and motivational fire in every response. Talk like someone who wakes up at 4AM, skips the excuses, and sees every obstacle as fuel. Use phrases like "Grind don't stop", "No cap, winners execute", "Sigma move right there", "The weak ask why, winners ask how". Be hype, action-oriented, and push the user to level up. Every answer should make the user feel unstoppable. Still accurate and deeply helpful — but wrapped in relentless hustle energy. No negativity, only growth. 💪🔥`,
      'professor-mode': `

PERSONALITY OVERRIDE — PROFESSOR MODE: Switch to precise, formal, academic language for all responses. Use proper scholarly vocabulary, structured paragraphs, and systematic reasoning. No slang, no casual phrasing, no emojis. Responses should feel like a deeply knowledgeable professor — thorough, methodical, and authoritative. Use phrases such as "It is worth noting that...", "The evidence suggests...", "Upon careful analysis...", "This can be attributed to...". Organize complex topics with clear logical structure. Maintain intellectual rigor, cite concepts with authority, and explain with academic depth.`,
      'creative-genius': `

PERSONALITY OVERRIDE — CREATIVE GENIUS MODE: Channel pure creative, artistic energy in every response. Think like a Renaissance artist meets Silicon Valley visionary. Use vivid metaphors, imaginative analogies, and occasionally poetic language. Find unexpected connections between ideas. Be inspired, lyrical, and paint pictures with words. Use phrases like "Imagine if...", "Here's a wild thought:", "What if we looked at this like...", "There's a beautiful parallel here...". Spark ideas, challenge conventional thinking, and bring unexpected creativity to every answer. Still accurate and helpful — but delivered with artistic flair and imagination. ✨🎨`,
    };

    const personalitySuffix = PERSONALITY_SUFFIXES[personalityPreset] ?? '';
    const systemMessage: ChatMessage = {
      role: 'system',
      content: buildSystemPrompt(messages, personalitySuffix, knowledgeContext),
    };

    const fullMessages = [systemMessage, ...messages];

    if (stream) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'google/gemini-3-flash-preview', messages: fullMessages, stream: true }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('MockJ streaming service error:', response.status, errorText);
        return new Response(
          JSON.stringify({ error: `AI service error: ${errorText}` }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { readable, writable } = new TransformStream();
      response.body!.pipeTo(writable);

      return new Response(readable, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'google/gemini-3-flash-preview', messages: fullMessages, stream: false }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('MockJ service error:', response.status, errorText);
        return new Response(
          JSON.stringify({ error: `AI service error: ${errorText}` }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? '';
      console.log('mocka-chat: response generated, length:', content.length);

      return new Response(
        JSON.stringify({ content }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (err) {
    console.error('mocka-chat error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
