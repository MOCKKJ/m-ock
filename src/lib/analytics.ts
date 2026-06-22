/**
 * MockJ Analytics — lightweight client-side event tracker
 * Writes to user_events and page_views tables in Supabase.
 * Uses anon key so no auth required for basic tracking.
 * Admin reads are done via service role in edge functions or via admin UI.
 */

import { supabase } from '@/lib/supabase';

// Stable session ID per browser session (resets on tab close)
let sessionId: string | null = null;
function getSessionId(): string {
  if (!sessionId) {
    sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
  return sessionId;
}

// Cache user id once resolved to avoid async overhead on every event
let _cachedUserId: string | null | undefined = undefined;
async function getUserId(): Promise<string | null> {
  if (_cachedUserId !== undefined) return _cachedUserId;
  const { data: { user } } = await supabase.auth.getUser();
  _cachedUserId = user?.id ?? null;
  return _cachedUserId;
}

// Reset cached user on auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  _cachedUserId = session?.user?.id ?? null;
});

// ── Page Views ────────────────────────────────────────────────────────────────

export async function trackPageView(path: string, referrer?: string): Promise<void> {
  const userId = await getUserId();
  const { error } = await supabase.from('page_views').insert({
    user_id: userId,
    session_id: getSessionId(),
    path,
    referrer: referrer ?? document.referrer ?? null,
  });
  if (error) console.warn('[Analytics] page_view insert failed:', error.message);
}

// ── Custom Events ─────────────────────────────────────────────────────────────

export async function trackEvent(
  eventName: string,
  properties: Record<string, unknown> = {},
  page?: string
): Promise<void> {
  const userId = await getUserId();
  const { error } = await supabase.from('user_events').insert({
    user_id: userId,
    session_id: getSessionId(),
    event_name: eventName,
    properties,
    page: page ?? window.location.pathname,
  });
  if (error) console.warn('[Analytics] event insert failed:', error.message);
}

// ── Named event helpers ────────────────────────────────────────────────────────

export const Analytics = {
  // AI
  chatSent: (personality?: string, deepReasoning?: boolean) =>
    trackEvent('chat_sent', { personality, deepReasoning }),
  imageSent: (style?: string, aspectRatio?: string) =>
    trackEvent('image_generated', { style, aspectRatio }),
  videoSent: (duration?: string, style?: string) =>
    trackEvent('video_generated', { duration, style }),

  // Auth
  signUp: () => trackEvent('sign_up'),
  signIn: (method: string) => trackEvent('sign_in', { method }),
  signOut: () => trackEvent('sign_out'),

  // Subscription
  checkoutStarted: (plan: string) => trackEvent('checkout_started', { plan }),
  upgradeViewed: () => trackEvent('upgrade_modal_viewed'),

  // UI
  buttonClick: (label: string, context?: string) =>
    trackEvent('button_click', { label, context }),
  featureUsed: (feature: string, detail?: string) =>
    trackEvent('feature_used', { feature, detail }),

  // Knowledge base
  kbEntryAdded: () => trackEvent('kb_entry_added'),
  kbEntryDeleted: () => trackEvent('kb_entry_deleted'),
  kbSearched: (query: string) => trackEvent('kb_searched', { query }),

  // Pages
  pageView: (path: string) => trackPageView(path),
};
