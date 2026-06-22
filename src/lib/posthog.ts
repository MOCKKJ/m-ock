/**
 * PostHog analytics client
 * VITE_POSTHOG_KEY  — your PostHog project API key  (e.g. phc_xxxx)
 * VITE_POSTHOG_HOST — optional custom host, defaults to https://us.i.posthog.com
 */
import posthog from 'posthog-js';

const KEY  = import.meta.env.VITE_POSTHOG_KEY  as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com';

export function initPostHog() {
  if (!KEY) {
    console.warn('[PostHog] VITE_POSTHOG_KEY not set — analytics disabled.');
    return;
  }
  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: 'identified_only',  // no anon profiles by default
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    session_recording: {
      maskAllInputs: true,                // protect PII in forms
      maskTextSelector: '[data-sensitive]',
    },
    loaded(ph) {
      if (import.meta.env.DEV) ph.debug();
    },
  });
  console.log('[PostHog] Initialized', { host: HOST });
}

/** Identify the signed-in user so events are tied to their profile. */
export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  if (!KEY) return;
  posthog.identify(userId, traits);
}

/** Reset identity on logout. */
export function resetPostHog() {
  if (!KEY) return;
  posthog.reset();
}

/** Track a named event with optional properties. */
export function track(event: string, properties?: Record<string, unknown>) {
  if (!KEY) return;
  posthog.capture(event, properties);
}

export { posthog };
