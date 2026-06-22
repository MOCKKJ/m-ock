import { Message, ImageGenRequest, VideoGenRequest, VideoTask } from '@/types/chat';
import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { getFunctionUrl, getPublicApiKey } from '@/lib/functionClient';
import { PersonalityPreset } from '@/components/features/PersonalityPicker';
import { searchKnowledge, formatKnowledgeContext } from '@/lib/knowledgeSearch';
import { getDeviceId } from '@/lib/deviceFingerprint';

// ──────────────────────────────────────────────────────────────────────────────
// Chat history type
// ──────────────────────────────────────────────────────────────────────────────

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Streaming chat via OnSpace AI Edge Function
// Returns an async generator that yields text chunks
// ──────────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────────
// Fetch user memory context from user_knowledge_base (injected into every chat)
// ──────────────────────────────────────────────────────────────────────────────
async function fetchMemoryContext(): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return '';
    const { data, error } = await supabase
      .from('user_knowledge_base')
      .select('title, content, tags')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(12);
    if (error || !data || data.length === 0) return '';
    const lines = data.map((e: { title: string; content: string; tags: string[] }) =>
      `[${e.title}${e.tags?.length ? ` (${e.tags.join(', ')})` : ''}]: ${e.content}`
    );
    return `--- USER MEMORY (what this user has saved about themselves) ---
${lines.join('\n')}
--- END USER MEMORY ---`;
  } catch {
    return '';
  }
}

export async function* streamChatResponse(
  message: string,
  history: ChatHistoryMessage[] = [],
  deepReasoning = false,
  personality: PersonalityPreset = 'chill-bro'
): AsyncGenerator<string> {
  // Inject project knowledge context when relevant
  const knowledgeResults = searchKnowledge(message, 3, 4);
  const knowledgeContext = formatKnowledgeContext(knowledgeResults);
  // Inject user memory context silently
  const memoryContext = await fetchMemoryContext();
  const combinedContext = [knowledgeContext, memoryContext].filter(Boolean).join('\n\n');
  const userContent = deepReasoning
    ? `${message}\n\n[DEEP REASONING MODE] Before giving your answer, work through this step by step. Wrap your reasoning process in <reasoning> tags with numbered steps, then provide your final answer after the closing </reasoning> tag. Format:\n<reasoning>\n1. [First step]\n2. [Next step]\n...\n</reasoning>\n[Final answer here]`
    : message;

  const messages: ChatHistoryMessage[] = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userContent },
  ];

  const supabaseKey = getPublicApiKey();

  // Include session token if logged in — edge function uses this for per-user limits
  const { data: { session } } = await supabase.auth.getSession();
  const authToken = session?.access_token ?? supabaseKey;

  const response = await fetch(
    getFunctionUrl('mocka-chat'),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'apikey': supabaseKey,
        'x-device-id': getDeviceId(),
      },
      body: JSON.stringify({ type: 'chat', messages, stream: true, personalityPreset: personality, knowledgeContext: combinedContext }),
    }
  );

    if (!response.ok || !response.body) {
    const text = await response.text();
    // Surface rate-limit errors clearly so the UI can show the paywall
    if (response.status === 503) {
      let msg = 'AI service is temporarily unavailable — please try again in a few minutes.';
      try { const d = JSON.parse(text); if (d.error) msg = d.error; } catch { /* ignore */ }
      throw new Error(msg);
    }
    if (response.status === 429) {
      let msg = 'Daily limit reached. Upgrade to MockJ Pro for unlimited access.';
      try { const d = JSON.parse(text); if (d.error) msg = d.error; } catch { /* ignore */ }
      const err = new Error(msg) as Error & { limitExceeded: boolean; status: number };
      err.limitExceeded = true;
      err.status = 429;
      throw err;
    }
    // Surface token shortfall errors — route user to /tokens
    if (response.status === 402) {
      let msg = 'Not enough tokens. Top up in the Token Shop.';
      let required = 0;
      let balance = 0;
      try {
        const d = JSON.parse(text);
        if (d.error) msg = d.error;
        required = d.required ?? 0;
        balance = d.balance ?? 0;
      } catch { /* ignore */ }
      const err = new Error(msg) as Error & { limitExceeded: boolean; tokenShortfall: boolean; required: number; balance: number; status: number };
      err.limitExceeded = true;
      err.tokenShortfall = true;
      err.required = required;
      err.balance = balance;
      err.status = 402;
      throw err;
    }
    throw new Error(text || `Request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        const chunk: string = parsed.choices?.[0]?.delta?.content ?? '';
        if (chunk) yield chunk;
      } catch {
        // skip malformed SSE lines
      }
    }
  }
}

// Fallback non-streaming for compatibility
export async function generateChatResponse(
  message: string,
  history: ChatHistoryMessage[] = []
): Promise<string> {
  const messages: ChatHistoryMessage[] = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  const { data, error } = await supabase.functions.invoke('mocka-chat', {
    body: { type: 'chat', messages, stream: false },
  });

  if (error) {
    let errorMessage = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const statusCode = error.context?.status ?? 500;
        const textContent = await error.context?.text();
        errorMessage = `[Code: ${statusCode}] ${textContent || error.message || 'Unknown error'}`;
      } catch {
        errorMessage = error.message || 'Failed to read response';
      }
    }
    throw new Error(errorMessage);
  }

  return data?.content ?? "An unexpected interruption occurred. Please resubmit your query.";
}

// ──────────────────────────────────────────────────────────────────────────────
// Image generation / editing via OnSpace AI
// ──────────────────────────────────────────────────────────────────────────────

export async function generateImage(request: ImageGenRequest): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();

  const MAX_ATTEMPTS = 2;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { data, error } = await supabase.functions.invoke('mocka-chat', {
      body: {
        type: 'image',
        prompt: request.prompt,
        style: request.style,
        aspectRatio: request.aspectRatio,
        quality: request.quality ?? '1K',
        sourceImageDataUrl: request.sourceImageDataUrl,
        modelId: request.modelId, // pass selected model to edge function
      },
      headers: {
        ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        'x-device-id': getDeviceId(),
      },
    });

    if (error) {
      let errorMessage = error.message;
      let statusCode = 500;
      let rawText = '';
      if (error instanceof FunctionsHttpError) {
        try {
          statusCode = error.context?.status ?? 500;
          rawText = await error.context?.text() ?? '';
          errorMessage = rawText || error.message || 'Unknown error';
        } catch {
          errorMessage = error.message || 'Failed to read response';
        }
      }

      // Non-retryable: rate-limit — surface immediately
      if (statusCode === 429) {
        let msg = 'Daily image limit reached. Upgrade to MockJ Pro for unlimited access.';
        try { const d = JSON.parse(rawText); if (d.error) msg = d.error; } catch { /* ignore */ }
        const err = new Error(msg) as Error & { limitExceeded: boolean; status: number };
        err.limitExceeded = true;
        err.status = 429;
        throw err;
      }

      // Non-retryable: token shortfall — surface immediately
      if (statusCode === 402) {
        let msg = 'Not enough tokens. Top up in the Token Shop.';
        let required = 0;
        let balance = 0;
        try {
          const d = JSON.parse(rawText);
          if (d.error) msg = d.error;
          required = d.required ?? 0;
          balance = d.balance ?? 0;
        } catch { /* ignore */ }
        const err = new Error(msg) as Error & { limitExceeded: boolean; tokenShortfall: boolean; required: number; balance: number; status: number };
        err.limitExceeded = true;
        err.tokenShortfall = true;
        err.required = required;
        err.balance = balance;
        err.status = 402;
        throw err;
      }

      // Retryable: 503 or 500 "No image was generated" — silent retry on first attempt
      const isRetryable =
        statusCode === 503 ||
        (statusCode === 500 && errorMessage.toLowerCase().includes('no image was generated'));

      if (isRetryable && attempt < MAX_ATTEMPTS) {
        console.warn(`[generateImage] Attempt ${attempt} failed (${statusCode}) — retrying in 2s…`);
        lastError = new Error(errorMessage);
        // Signal the UI that a silent retry is starting
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mockj:image-retry'));
        }
        await delay(2000);
        continue;
      }

      // Final attempt or non-retryable 5xx — surface with friendly message for 503
      if (statusCode === 503) {
        let msg = 'Image generation is temporarily unavailable — please try again in a few minutes.';
        try { const d = JSON.parse(rawText); if (d.error) msg = d.error; } catch { /* ignore */ }
        throw new Error(msg);
      }

      throw new Error(errorMessage);
    }

    // Success — return image URL
    const imageUrl = data?.imageUrl;
    if (!imageUrl) {
      // Treat missing URL like a 500 — retry once
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`[generateImage] Attempt ${attempt} returned no imageUrl — retrying in 2s…`);
        lastError = new Error('No image URL returned');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mockj:image-retry'));
        }
        await delay(2000);
        continue;
      }
      throw new Error('No image URL returned');
    }
    return imageUrl;
  }

  // Should never reach here, but satisfy TypeScript
  throw lastError ?? new Error('Image generation failed after retries');
}

// ──────────────────────────────────────────────────────────────────────────────
// Video generation — async task-based via OnSpace AI (Sora-2)
// ──────────────────────────────────────────────────────────────────────────────

// Map UI duration string to seconds number — only 4, 8, 12 accepted by API
const VALID_SECONDS = [4, 8, 12];
function durationToSeconds(d: string): number {
  const n = parseInt(d, 10);
  if (VALID_SECONDS.includes(n)) return n;
  // Snap to nearest valid value
  if (n <= 4) return 4;
  if (n <= 8) return 8;
  return 12;
}

// Map UI aspect ratio to Sora aspect_ratio param
function mapAspectRatio(ratio: string): string {
  if (ratio === '9:16') return 'portrait';
  if (ratio === '1:1') return 'square';
  return 'landscape';
}

export async function createVideoTask(request: VideoGenRequest & { aspectRatio?: string }): Promise<VideoTask> {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke('mocka-chat', {
    body: {
      type: 'video-create',
      prompt: request.prompt,
      duration: durationToSeconds(request.duration),
      aspectRatio: mapAspectRatio(request.aspectRatio ?? '16:9'),
    },
    headers: {
      ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
      'x-device-id': getDeviceId(),
    },
  });

  if (error) {
    let errorMessage = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const statusCode = error.context?.status ?? 500;
        const textContent = await error.context?.text();
        errorMessage = `[Code: ${statusCode}] ${textContent || error.message || 'Unknown error'}`;
      } catch {
        errorMessage = error.message || 'Failed to read response';
      }
    }
    throw new Error(errorMessage);
  }

  return {
    id: data.id,
    status: data.status ?? 'starting',
    progress: 0,
    // Preserve original prompt/style for DB metadata saved on video-check completion
    originalPrompt: data._meta?._originalPrompt ?? request.prompt,
    originalStyle:  data._meta?._style ?? 'cinematic',
  };
}

export async function checkVideoTask(predictionId: string, originalPrompt?: string, originalStyle?: string): Promise<VideoTask> {
  const { data, error } = await supabase.functions.invoke('mocka-chat', {
    body: { type: 'video-check', predictionId, _originalPrompt: originalPrompt ?? '', _style: originalStyle ?? 'cinematic' },
  });

  if (error) {
    let errorMessage = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const statusCode = error.context?.status ?? 500;
        const textContent = await error.context?.text();
        errorMessage = `[Code: ${statusCode}] ${textContent || error.message || 'Unknown error'}`;
      } catch {
        errorMessage = error.message || 'Failed to read response';
      }
    }
    throw new Error(errorMessage);
  }

  return {
    id: predictionId,
    status: data.status,
    progress: data.progress ?? 0,
    videoUrl: data.videoUrl,
    error: data.error,
  };
}

// Legacy placeholder for inline video chat mode (still used in chat)
export async function generateVideo(_request: VideoGenRequest): Promise<{ thumbnailUrl: string; label: string; duration: string }> {
  await delay(1500);
  const seed = Math.floor(Math.random() * 10000);
  return {
    thumbnailUrl: `https://picsum.photos/seed/${seed}/1280/720`,
    label: 'Video (Studio)',
    duration: _request.duration,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function buildMessage(
  role: 'user' | 'assistant',
  content: string,
  type: Message['type'] = 'text',
  mediaUrl?: string,
  mediaPrompt?: string,
  streaming = false
): Message {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    type,
    mediaUrl,
    mediaPrompt,
    timestamp: new Date(),
    streaming,
  };
}
