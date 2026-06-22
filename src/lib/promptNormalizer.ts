/**
 * promptNormalizer.ts
 * Normalizes creative prompts for image/video generation:
 * - Detects language
 * - Corrects spelling
 * - Translates to clean English
 * - Enhances vague prompts
 * - Handles slang, misspellings, multilingual input
 * - Safety check
 */

import { supabase } from '@/lib/supabase';

export interface NormalizedPrompt {
  originalPrompt: string;
  detectedLanguage: string;
  correctedPrompt: string;
  translatedPrompt: string;
  enhancedPrompt: string;
  safetyStatus: 'safe' | 'unsafe' | 'warning';
  safetyReason?: string;
  finalPromptForGeneration: string;
}

// ── Persistent localStorage cache ────────────────────────────────────────
const LS_KEY = 'mockj_prompt_cache';
const MAX_ENTRIES = 50;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  value: NormalizedPrompt;
  savedAt: number; // epoch ms
}

type CacheStore = Record<string, CacheEntry>;

/** Load the cache from localStorage, dropping expired entries on read. */
function loadCache(): Map<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Map();
    const store: CacheStore = JSON.parse(raw);
    const now = Date.now();
    const map = new Map<string, CacheEntry>();
    for (const [k, v] of Object.entries(store)) {
      if (now - v.savedAt < TTL_MS) {
        map.set(k, v);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

/** Persist the cache to localStorage, respecting the MAX_ENTRIES cap. */
function persistCache(map: Map<string, CacheEntry>): void {
  try {
    // If over cap, evict the oldest entries first
    let entries = [...map.entries()].sort((a, b) => a[1].savedAt - b[1].savedAt);
    if (entries.length > MAX_ENTRIES) {
      entries = entries.slice(entries.length - MAX_ENTRIES);
    }
    const store: CacheStore = Object.fromEntries(entries);
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {
    // localStorage quota exceeded or unavailable — silently ignore
  }
}

// Initialise from localStorage on module load
const cache = loadCache();

export async function normalizeCreativePrompt(
  rawPrompt: string,
  mediaType: 'image' | 'video' = 'image'
): Promise<NormalizedPrompt> {
  const key = `${mediaType}:${rawPrompt.trim().toLowerCase()}`;
  if (cache.has(key)) {
    const entry = cache.get(key)!;
    // Double-check TTL in case the module has been running > 24h without a reload
    if (Date.now() - entry.savedAt < TTL_MS) return entry.value;
    cache.delete(key); // stale — fall through to fresh API call
  }

  // Passthrough for very short or clearly safe English prompts (fast path)
  const trimmed = rawPrompt.trim();

  const systemInstruction = `You are a creative prompt normalizer for an AI ${mediaType} generator. Your job is to take any user input — regardless of language, spelling mistakes, slang, or vagueness — and turn it into a clean, detailed English prompt for AI generation.

Return ONLY a valid JSON object with these exact keys:
{
  "detectedLanguage": "English|Spanish|Portuguese|French|Haitian Creole|Arabic|Chinese|Japanese|Korean|Hindi|Other:<name>",
  "correctedPrompt": "spelling-corrected version of the original, still in original language",
  "translatedPrompt": "translated to English if not already English, otherwise same as correctedPrompt",
  "enhancedPrompt": "expanded, detailed, vivid English prompt that preserves the user's intent, style, mood, names, colors, scene details — improved for ${mediaType} generation",
  "safetyStatus": "safe|unsafe|warning",
  "safetyReason": "brief explanation only if unsafe or warning, empty string otherwise"
}

Rules:
1. ALWAYS infer meaning from misspellings — never fail because of typos
2. Preserve the user's creative intent, names, brands, outfit details, colors
3. If vague, add cinematic/artistic details that match the mood
4. If unsafe (sexual, violent, exploitative), set safetyStatus to "unsafe" and safetyReason
5. If borderline, set safetyStatus to "warning" and explain
6. "enhancedPrompt" should be detailed, specific, and optimized for ${mediaType} AI generation
7. ONLY return JSON, no markdown, no explanation`;

  // Embed instruction directly in user message — avoids _systemOverride 422 errors
  const userMessage = `${systemInstruction}

Now normalize this ${mediaType} prompt:
"${trimmed}"

Respond with ONLY the JSON object, nothing else.`;

  try {
    const { data, error } = await supabase.functions.invoke('mocka-chat', {
      body: {
        type: 'chat',
        stream: false,
        messages: [
          { role: 'user', content: userMessage }
        ],
      },
    });

    if (error) throw error;

    const content: string = data?.content ?? '';
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);

    const result: NormalizedPrompt = {
      originalPrompt: trimmed,
      detectedLanguage: parsed.detectedLanguage ?? 'English',
      correctedPrompt: parsed.correctedPrompt ?? trimmed,
      translatedPrompt: parsed.translatedPrompt ?? trimmed,
      enhancedPrompt: parsed.enhancedPrompt ?? trimmed,
      safetyStatus: parsed.safetyStatus ?? 'safe',
      safetyReason: parsed.safetyReason ?? '',
      finalPromptForGeneration: parsed.safetyStatus === 'unsafe'
        ? ''
        : (parsed.enhancedPrompt ?? trimmed),
    };

    const entry: CacheEntry = { value: result, savedAt: Date.now() };
    cache.set(key, entry);
    persistCache(cache);
    return result;

  } catch (err) {
    // Fallback: return original prompt as-is (never block generation on normalizer failure)
    console.warn('[promptNormalizer] fallback due to error:', err instanceof Error ? err.message : err);
    const fallback: NormalizedPrompt = {
      originalPrompt: trimmed,
      detectedLanguage: 'Unknown',
      correctedPrompt: trimmed,
      translatedPrompt: trimmed,
      enhancedPrompt: trimmed,
      safetyStatus: 'safe',
      finalPromptForGeneration: trimmed,
    };
    return fallback;
  }
}
