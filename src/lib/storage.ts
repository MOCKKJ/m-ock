import { Conversation, Message, ChatMode } from '@/types/chat';
import { supabase } from '@/lib/supabase';

const STORAGE_KEY = 'mocka_conversations';

// ── Local helpers ─────────────────────────────────────────────────────────────

function parseConversation(c: Conversation): Conversation {
  return {
    ...c,
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
    messages: (c.messages ?? []).map((m: Message) => ({
      ...m,
      timestamp: new Date(m.timestamp),
    })),
  };
}

// ── Local (localStorage) ─────────────────────────────────────────────────────

export function saveConversationsLocal(conversations: Conversation[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

export function loadConversationsLocal(): Conversation[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return parsed.map(parseConversation);
  } catch {
    return [];
  }
}

// ── Supabase (cloud) ─────────────────────────────────────────────────────────

export async function loadConversationsFromCloud(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('Failed to load conversations from cloud:', error.message);
    return loadConversationsLocal();
  }

  return (data ?? []).map(row => parseConversation({
    id: row.id,
    title: row.title,
    mode: row.mode as ChatMode,
    messages: row.messages ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function upsertConversationToCloud(conv: Conversation): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('conversations')
    .upsert({
      id: conv.id,
      user_id: user.id,
      title: conv.title,
      mode: conv.mode,
      messages: conv.messages,
      created_at: conv.createdAt.toISOString(),
      updated_at: conv.updatedAt.toISOString(),
    }, { onConflict: 'id' });

  if (error) {
    console.error('Failed to upsert conversation:', error.message);
  }
}

export async function deleteConversationFromCloud(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete conversation from cloud:', error.message);
  }
}

/**
 * Save all conversations: cloud for auth users, localStorage for guests.
 * Also always writes to localStorage as a local cache.
 */
export async function saveConversations(conversations: Conversation[]): Promise<void> {
  saveConversationsLocal(conversations);
}

/**
 * Load conversations: cloud for auth users, localStorage for guests.
 * Falls back to localStorage on cloud error.
 */
export async function loadConversations(userId?: string | null): Promise<Conversation[]> {
  if (userId) {
    return loadConversationsFromCloud();
  }
  return loadConversationsLocal();
}

// ── Conversation CRUD ─────────────────────────────────────────────────────────

export function createConversation(mode: ChatMode = 'chat'): Conversation {
  return {
    id: crypto.randomUUID(),
    title: 'New Chat',
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    mode,
  };
}

export function generateTitle(firstMessage: string): string {
  const words = firstMessage.trim().split(' ').slice(0, 6).join(' ');
  return words.length < firstMessage.length ? words + '…' : words;
}

// ── Image Generation History ──────────────────────────────────────────────────

const IMG_HISTORY_KEY = 'mockj_image_history';

export interface ImageHistoryItem {
  id: string;
  prompt: string;
  style: string;
  aspectRatio: string;
  quality: string;
  mode: 'generate' | 'edit';
  imageUrl: string;
  createdAt: string;
}

export async function saveImageGeneration(item: Omit<ImageHistoryItem, 'id' | 'createdAt'>): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { error } = await supabase.from('image_generations').insert({
      user_id: user.id,
      prompt: item.prompt,
      style: item.style,
      aspect_ratio: item.aspectRatio,
      quality: item.quality,
      mode: item.mode,
      image_url: item.imageUrl,
    });
    if (error) console.error('Failed to save image generation:', error.message);
  } else {
    // Guest: store in localStorage (cap at 50)
    const all = loadImageHistoryLocal();
    const entry: ImageHistoryItem = {
      id: crypto.randomUUID(),
      ...item,
      createdAt: new Date().toISOString(),
    };
    const updated = [entry, ...all].slice(0, 50);
    localStorage.setItem(IMG_HISTORY_KEY, JSON.stringify(updated));
  }
}

export function loadImageHistoryLocal(): ImageHistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(IMG_HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export async function loadImageHistory(): Promise<ImageHistoryItem[]> {
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data, error } = await supabase
      .from('image_generations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Failed to load image history:', error.message);
      return loadImageHistoryLocal();
    }

    return (data ?? []).map(row => ({
      id: row.id,
      prompt: row.prompt,
      style: row.style,
      aspectRatio: row.aspect_ratio,
      quality: row.quality,
      mode: row.mode as 'generate' | 'edit',
      imageUrl: row.image_url,
      createdAt: row.created_at,
    }));
  }

  return loadImageHistoryLocal();
}

export async function deleteImageGeneration(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    await supabase.from('image_generations').delete().eq('id', id);
  } else {
    const all = loadImageHistoryLocal().filter(i => i.id !== id);
    localStorage.setItem(IMG_HISTORY_KEY, JSON.stringify(all));
  }
}

// ── Video Generation History ──────────────────────────────────────────────────

const VID_HISTORY_KEY = 'mockj_video_history';

export interface VideoHistoryItem {
  id: string;
  prompt: string;
  style: string;
  duration: string;
  aspectRatio: string;
  videoUrl: string;
  createdAt: string;
}

export async function saveVideoGeneration(item: Omit<VideoHistoryItem, 'id' | 'createdAt'>): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { error } = await supabase.from('video_generations').insert({
      user_id: user.id,
      prompt: item.prompt,
      style: item.style,
      duration: item.duration,
      aspect_ratio: item.aspectRatio,
      video_url: item.videoUrl,
    });
    if (error) console.error('Failed to save video generation:', error.message);
  } else {
    const all = loadVideoHistoryLocal();
    const entry: VideoHistoryItem = { id: crypto.randomUUID(), ...item, createdAt: new Date().toISOString() };
    localStorage.setItem(VID_HISTORY_KEY, JSON.stringify([entry, ...all].slice(0, 20)));
  }
}

export function loadVideoHistoryLocal(): VideoHistoryItem[] {
  try { return JSON.parse(localStorage.getItem(VID_HISTORY_KEY) ?? '[]'); }
  catch { return []; }
}

export async function loadVideoHistory(): Promise<VideoHistoryItem[]> {
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data, error } = await supabase
      .from('video_generations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Failed to load video history:', error.message);
      return loadVideoHistoryLocal();
    }

    return (data ?? []).map(row => ({
      id: row.id,
      prompt: row.prompt,
      style: row.style,
      duration: row.duration,
      aspectRatio: row.aspect_ratio,
      videoUrl: row.video_url,
      createdAt: row.created_at,
    }));
  }

  return loadVideoHistoryLocal();
}

export async function deleteVideoGeneration(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('video_generations').delete().eq('id', id);
  } else {
    const all = loadVideoHistoryLocal().filter(i => i.id !== id);
    localStorage.setItem(VID_HISTORY_KEY, JSON.stringify(all));
  }
}

// ── User Knowledge Base ───────────────────────────────────────────────────────

const KB_LOCAL_KEY = 'mockj_custom_knowledge';

export interface KBCloudEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  synced: true;
}

export interface KBLocalEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  synced: false;
}

export type KBEntry = KBCloudEntry | KBLocalEntry;

export async function loadKBEntries(): Promise<KBEntry[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data, error } = await supabase
      .from('user_knowledge_base')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to load cloud KB:', error.message);
      return loadKBLocal();
    }
    return (data ?? []).map(row => ({
      id: row.id,
      title: row.title,
      content: row.content,
      tags: row.tags ?? [],
      created_at: row.created_at,
      updated_at: row.updated_at,
      synced: true as const,
    }));
  }
  return loadKBLocal();
}

export function loadKBLocal(): KBLocalEntry[] {
  try {
    const raw = localStorage.getItem(KB_LOCAL_KEY);
    if (!raw) return [];
    // Legacy entries from knowledgeBase.ts custom format → adapt
    const parsed = JSON.parse(raw);
    return parsed.map((e: { id?: string; title?: string; content?: string; keywords?: string[] }) => ({
      id: e.id ?? crypto.randomUUID(),
      title: e.title ?? '',
      content: e.content ?? '',
      tags: e.keywords ?? [],
      created_at: new Date().toISOString(),
      synced: false as const,
    }));
  } catch {
    return [];
  }
}

export async function saveKBEntry(
  entry: { title: string; content: string; tags: string[] }
): Promise<KBEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data, error } = await supabase
      .from('user_knowledge_base')
      .insert({ user_id: user.id, title: entry.title, content: entry.content, tags: entry.tags })
      .select('*')
      .single();
    if (error || !data) {
      console.error('Failed to save KB entry to cloud:', error?.message);
      throw new Error(error?.message ?? 'Failed to save');
    }
    return { id: data.id, title: data.title, content: data.content, tags: data.tags ?? [], created_at: data.created_at, updated_at: data.updated_at, synced: true };
  }
  // Guest: localStorage
  const local = loadKBLocal();
  const newEntry: KBLocalEntry = {
    id: `local_${Date.now()}`,
    title: entry.title,
    content: entry.content,
    tags: entry.tags,
    created_at: new Date().toISOString(),
    synced: false,
  };
  // Persist in legacy format so knowledgeBase.ts helpers still work
  const legacy = JSON.parse(localStorage.getItem(KB_LOCAL_KEY) ?? '[]');
  localStorage.setItem(KB_LOCAL_KEY, JSON.stringify([
    ...legacy,
    { id: newEntry.id, title: newEntry.title, content: newEntry.content, keywords: newEntry.tags, category: 'projects', lastUpdated: new Date().toISOString().slice(0, 7) },
  ]));
  return newEntry;
}

export async function updateKBEntry(
  id: string,
  updates: { title: string; content: string; tags: string[] }
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { error } = await supabase
      .from('user_knowledge_base')
      .update({ title: updates.title, content: updates.content, tags: updates.tags, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  // Guest: update in localStorage
  const raw = JSON.parse(localStorage.getItem(KB_LOCAL_KEY) ?? '[]');
  const idx = raw.findIndex((e: { id: string }) => e.id === id);
  if (idx !== -1) {
    raw[idx] = { ...raw[idx], title: updates.title, content: updates.content, keywords: updates.tags };
    localStorage.setItem(KB_LOCAL_KEY, JSON.stringify(raw));
  }
}

export async function deleteKBEntry(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('user_knowledge_base').delete().eq('id', id);
    return;
  }
  const raw = JSON.parse(localStorage.getItem(KB_LOCAL_KEY) ?? '[]');
  localStorage.setItem(KB_LOCAL_KEY, JSON.stringify(raw.filter((e: { id: string }) => e.id !== id)));
}
