import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App.tsx'
import './index.css'
import { initPostHog } from './lib/posthog'

// ── Boot PostHog before first render ─────────────────────────────────────────
initPostHog();

// ── Sentry: Initialize only when DSN is provided ─────────────────────────────
// To enable Sentry:
//   1. Sign up at https://sentry.io (free tier available)
//   2. Create a React project → copy the DSN
//   3. Add VITE_SENTRY_DSN=your_dsn_here to your .env file
//   4. Rebuild / redeploy
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,                // 'production' | 'development'
    release: import.meta.env.VITE_APP_VERSION ?? '1.0.0',

    // ── Performance monitoring ───────────────────────────────────────────
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,          // adjust to true for stricter PII masking
        blockAllMedia: false,
      }),
    ],
    tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,  // 10% in prod
    replaysSessionSampleRate: 0.05,   // 5% of sessions
    replaysOnErrorSampleRate: 1.0,    // 100% of sessions with errors

    // ── Filter noise ─────────────────────────────────────────────────────
    ignoreErrors: [
      // Common browser extension noise
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // Network errors outside our control
      'NetworkError',
      'Failed to fetch',
      'Load failed',
      // Non-error console noise
      'Non-Error promise rejection captured',
    ],
    denyUrls: [
      // Chrome extensions
      /extensions\//i,
      /^chrome:\/\//i,
      /^chrome-extension:\/\//i,
      // PostHog/Stripe (their own SDKs handle errors)
      /posthog\.com/i,
      /stripe\.com/i,
    ],

    // ── Tag every event with MockJ metadata ──────────────────────────────
    beforeSend(event) {
      // Strip any local dev localhost events in production
      if (import.meta.env.MODE === 'production' && event.request?.url?.includes('localhost')) {
        return null;
      }
      return event;
    },
  });

  console.log('[Sentry] Initialized — environment:', import.meta.env.MODE);
} else {
  console.log('[Sentry] DSN not configured — error tracking disabled. Add VITE_SENTRY_DSN to .env to enable.');
}

// ── Render app wrapped in Sentry ErrorBoundary ────────────────────────────────
createRoot(document.getElementById("root")!).render(
  sentryDsn ? (
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <div
          style={{
            minHeight: '100vh',
            background: 'hsl(224 20% 4%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px',
            fontFamily: 'system-ui, sans-serif',
            color: '#e8ecf0',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 900, color: '#ef4444' }}>
            Something went wrong
          </h1>
          <p style={{ margin: '0 0 24px', color: '#888', fontSize: 14, textAlign: 'center', maxWidth: 400 }}>
            MockJ encountered an unexpected error. Our team has been notified automatically.
          </p>
          <p style={{ margin: '0 0 24px', color: '#555', fontSize: 12, fontFamily: 'monospace', maxWidth: 480, wordBreak: 'break-word', textAlign: 'center' }}>
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <button
            onClick={resetError}
            style={{
              padding: '12px 28px',
              background: 'hsl(142 70% 55%)',
              border: 'none',
              borderRadius: 10,
              color: '#000',
              fontWeight: 900,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      )}
      onError={(error, componentStack) => {
        console.error('[Sentry ErrorBoundary]', error, componentStack);
      }}
    >
      <App />
    </Sentry.ErrorBoundary>
  ) : (
    <App />
  )
);
