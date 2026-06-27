/**
 * AuthCallbackPage — /auth/callback
 * OAuth diagnostic page: parses URL params/hash for error details
 * and shows exactly what went wrong + how to fix it.
 * Also handles successful PKCE code exchange and redirects to app.
 */

import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  AlertCircle, CheckCircle2, Copy, ExternalLink, RefreshCw,
  ArrowRight, Shield, Info, Terminal, ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import logoImg from '@/assets/mockj-logo.png';

// ─────────────────────────────────────────────────────────────────────────────

interface DiagnosticInfo {
  status: 'loading' | 'success' | 'error' | 'unknown';
  errorCode: string | null;
  errorDescription: string | null;
  redirectUri: string;
  rawFragment: string;
  rawQuery: string;
  accessToken: string | null;
  code: string | null;
  sessionEstablished: boolean;
  supabaseUrl: string;
  expectedCallback: string;
  timestamp: string;
}

function extractDiagnostics(): DiagnosticInfo {
  const hash    = window.location.hash;
  const search  = window.location.search;
  const hashParams  = new URLSearchParams(hash.replace(/^#/, ''));
  const queryParams = new URLSearchParams(search);

  const errorCode        = hashParams.get('error') || queryParams.get('error') || null;
  const errorDescription = hashParams.get('error_description') || queryParams.get('error_description') || null;
  const accessToken      = hashParams.get('access_token') || queryParams.get('access_token') || null;
  const code             = queryParams.get('code') || null;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string ?? '';
  const expectedCallback = supabaseUrl
    ? `${supabaseUrl}/auth/v1/callback`
    : '(VITE_SUPABASE_URL not set)';

  let status: DiagnosticInfo['status'] = 'unknown';
  if (errorCode) status = 'error';
  else if (accessToken || code) status = 'loading'; // will attempt session exchange
  else status = 'unknown';

  return {
    status,
    errorCode,
    errorDescription: errorDescription ? decodeURIComponent(errorDescription) : null,
    redirectUri: window.location.href,
    rawFragment: hash || '(none)',
    rawQuery:    search || '(none)',
    accessToken: accessToken ? `${accessToken.slice(0, 12)}…(truncated)` : null,
    code:        code ? `${code.slice(0, 12)}…(truncated)` : null,
    sessionEstablished: false,
    supabaseUrl,
    expectedCallback,
    timestamp: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

const GOOGLE_CONSOLE_URL =
  'https://console.cloud.google.com/apis/credentials';

const FIX_STEPS = [
  {
    id: '1',
    title: 'Get your Callback URL from OnSpace Cloud',
    detail: 'Cloud panel → Users → Auth Settings → Google → copy the Callback URL',
    link: null,
  },
  {
    id: '2',
    title: 'Add it to Google Cloud Console',
    detail: 'APIs & Services → Credentials → your OAuth 2.0 Client ID → Authorized redirect URIs → + ADD URI',
    link: GOOGLE_CONSOLE_URL,
  },
  {
    id: '3',
    title: 'Add your domain to Authorized JavaScript origins',
    detail: 'Add https://mockj.online and your OnSpace preview URL to the origins list',
    link: GOOGLE_CONSOLE_URL,
  },
  {
    id: '4',
    title: 'Check OAuth consent screen status',
    detail: 'If app is in "Testing" mode, add your email as a Test User OR publish the app',
    link: 'https://console.cloud.google.com/apis/credentials/consent',
  },
  {
    id: '5',
    title: 'Save & wait 1–2 minutes',
    detail: 'Google takes a moment to propagate credential changes. Then retry.',
    link: null,
  },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [diag, setDiag] = useState<DiagnosticInfo>(extractDiagnostics);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Attempt PKCE code exchange / session detection
  useEffect(() => {
    if (diag.status === 'error') return; // don't proceed if we already have an error

    // Supabase's detectSessionInUrl handles the exchange automatically if configured.
    // We listen to onAuthStateChange to confirm success.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setDiag(d => ({ ...d, status: 'success', sessionEstablished: true }));
        toast.success('Google Sign-In successful! Redirecting…');
        setTimeout(() => navigate('/'), 1500);
      }
    });

    // Also check for an existing session (PKCE may have already exchanged)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setDiag(d => ({ ...d, status: 'success', sessionEstablished: true }));
        setTimeout(() => navigate('/'), 800);
      } else if (diag.status === 'loading') {
        // Code present but exchange hasn't happened yet — keep loading briefly
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: { session: s2 } }) => {
            if (!s2?.user) {
              setDiag(d => ({
                ...d,
                status: 'error',
                errorCode: 'session_exchange_failed',
                errorDescription:
                  'Authorization code was present in the URL but Supabase could not exchange it for a session. ' +
                  'This usually means the Callback URL in Google Cloud Console does not match the one configured in OnSpace Cloud.',
              }));
            }
          });
        }, 3000);
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const copyFullDiag = () => {
    const report = JSON.stringify(
      {
        ...diag,
        accessToken: diag.accessToken ? '(present, truncated)' : null,
        code:        diag.code        ? '(present, truncated)' : null,
        userAgent:   navigator.userAgent,
      },
      null,
      2
    );
    copyToClipboard(report, 'report');
  };

  // ── Status Banner ─────────────────────────────────────────────────────────
  const statusBanner = {
    loading: {
      icon: <RefreshCw className="w-5 h-5 animate-spin" />,
      color: 'hsl(191 97% 55%)',
      bg:   'hsl(191 97% 55% / 0.08)',
      border:'hsl(191 97% 55% / 0.3)',
      label: 'Completing sign-in…',
      sublabel: 'Exchanging authorization code for session.',
    },
    success: {
      icon: <CheckCircle2 className="w-5 h-5" />,
      color: 'hsl(142 70% 55%)',
      bg:   'hsl(142 70% 55% / 0.08)',
      border:'hsl(142 70% 55% / 0.3)',
      label: 'Sign-in successful!',
      sublabel: 'Session established. Redirecting you to MockJ…',
    },
    error: {
      icon: <AlertCircle className="w-5 h-5" />,
      color: 'hsl(0 80% 58%)',
      bg:   'hsl(0 80% 58% / 0.08)',
      border:'hsl(0 80% 58% / 0.3)',
      label: 'OAuth sign-in failed',
      sublabel: 'See the diagnostic details below to fix the configuration.',
    },
    unknown: {
      icon: <Info className="w-5 h-5" />,
      color: 'hsl(38 95% 60%)',
      bg:   'hsl(38 95% 60% / 0.08)',
      border:'hsl(38 95% 60% / 0.3)',
      label: 'No OAuth parameters detected',
      sublabel: 'This page is reached after a Google sign-in redirect. No error or token was found in the URL.',
    },
  }[diag.status];

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-10">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[hsl(191_97%_55%_/_0.04)] rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl overflow-hidden ring-1 ring-border group-hover:ring-[hsl(191_97%_55%_/_0.4)] transition-all">
              <img src={logoImg} alt="MockJ" className="w-full h-full object-cover" />
            </div>
            <span className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              MockJ
            </span>
          </Link>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[hsl(224_15%_10%)] border border-border">
            <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-mono text-muted-foreground">OAuth Diagnostic</span>
          </div>
        </div>

        {/* Status Banner */}
        <div
          className="rounded-2xl border p-5 flex items-start gap-4"
          style={{ background: statusBanner.bg, borderColor: statusBanner.border }}
        >
          <div style={{ color: statusBanner.color }} className="mt-0.5 shrink-0">
            {statusBanner.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              {statusBanner.label}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
              {statusBanner.sublabel}
            </p>
          </div>
          {diag.status === 'success' && (
            <Link
              to="/"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0"
              style={{ background: 'hsl(142 70% 55% / 0.15)', color: 'hsl(142 70% 55%)', border: '1px solid hsl(142 70% 55% / 0.35)' }}
            >
              Go to App <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>

        {/* Error Details */}
        {diag.status === 'error' && (
          <div className="rounded-2xl border border-border bg-[hsl(224_20%_7%)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[hsl(0_80%_58%)]" />
              <h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Error Details
              </h2>
            </div>
            <div className="p-5 space-y-4">
              <DiagRow
                label="Error Code"
                value={diag.errorCode ?? '—'}
                mono
                highlight="error"
                onCopy={() => copyToClipboard(diag.errorCode ?? '', 'code')}
                copied={copied === 'code'}
              />
              <DiagRow
                label="Error Description"
                value={diag.errorDescription ?? '—'}
                highlight="error"
                onCopy={() => copyToClipboard(diag.errorDescription ?? '', 'desc')}
                copied={copied === 'desc'}
              />
              <DiagRow
                label="Redirect URI (this page)"
                value={diag.redirectUri}
                mono
                onCopy={() => copyToClipboard(diag.redirectUri, 'uri')}
                copied={copied === 'uri'}
              />
              <DiagRow
                label="Expected Supabase Callback"
                value={diag.expectedCallback}
                mono
                highlight="info"
                onCopy={() => copyToClipboard(diag.expectedCallback, 'callback')}
                copied={copied === 'callback'}
              />
            </div>
          </div>
        )}

        {/* Configuration Checklist (always visible on error or unknown) */}
        {(diag.status === 'error' || diag.status === 'unknown') && (
          <div className="rounded-2xl border border-border bg-[hsl(224_20%_7%)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
              <Shield className="w-4 h-4 text-[hsl(191_97%_55%)]" />
              <h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Fix Checklist
              </h2>
              <span className="ml-auto text-[10px] text-muted-foreground">Complete all 5 steps in order</span>
            </div>
            <div className="p-5 space-y-3">
              {FIX_STEPS.map((step, i) => (
                <div
                  key={step.id}
                  className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-[hsl(224_15%_9%)] hover:border-[hsl(191_97%_55%_/_0.25)] transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-[hsl(191_97%_55%_/_0.1)] border border-[hsl(191_97%_55%_/_0.3)] flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-[hsl(191_97%_55%)]">{i + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{step.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.detail}</p>
                  </div>
                  {step.link && (
                    <a
                      href={step.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold shrink-0 mt-0.5 border border-[hsl(191_97%_55%_/_0.3)] text-[hsl(191_97%_55%)] hover:bg-[hsl(191_97%_55%_/_0.08)] transition-colors"
                    >
                      Open <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connection Info */}
        <div className="rounded-2xl border border-border bg-[hsl(224_20%_7%)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
            <Terminal className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Connection Info
            </h2>
          </div>
          <div className="p-5 space-y-4">
            <DiagRow
              label="Current URL"
              value={window.location.href}
              mono
              onCopy={() => copyToClipboard(window.location.href, 'url')}
              copied={copied === 'url'}
            />
            <DiagRow
              label="Origin"
              value={window.location.origin}
              mono
              highlight="info"
            />
            <DiagRow
              label="Supabase Project URL"
              value={diag.supabaseUrl || '(not configured)'}
              mono
            />
            <DiagRow
              label="Access Token Present"
              value={diag.accessToken ? `Yes — ${diag.accessToken}` : 'No'}
              highlight={diag.accessToken ? 'success' : undefined}
            />
            <DiagRow
              label="Auth Code Present"
              value={diag.code ? `Yes — ${diag.code}` : 'No'}
              highlight={diag.code ? 'success' : undefined}
            />
            <DiagRow
              label="Timestamp"
              value={diag.timestamp}
              mono
            />
          </div>
        </div>

        {/* Raw URL Data (collapsible) */}
        <div className="rounded-2xl border border-border bg-[hsl(224_20%_7%)] overflow-hidden">
          <button
            className="w-full px-5 py-3.5 flex items-center gap-2 hover:bg-[hsl(224_15%_10%)] transition-colors"
            onClick={() => setShowRaw(v => !v)}
          >
            <Terminal className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-bold text-foreground flex-1 text-left" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Raw URL Parameters
            </h2>
            {showRaw
              ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground" />
            }
          </button>
          {showRaw && (
            <div className="border-t border-border p-5 space-y-4">
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Hash Fragment (#…)</p>
                <pre className="text-[11px] font-mono text-[hsl(191_97%_65%)] bg-[hsl(224_15%_9%)] border border-border rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-all">
                  {diag.rawFragment}
                </pre>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Query String (?…)</p>
                <pre className="text-[11px] font-mono text-[hsl(191_97%_65%)] bg-[hsl(224_15%_9%)] border border-border rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-all">
                  {diag.rawQuery}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={copyFullDiag}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-[hsl(224_15%_24%)] transition-all"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied === 'report' ? 'Copied!' : 'Copy Full Report'}
          </button>
          <Link
            to="/auth"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[hsl(191_97%_55%_/_0.12)] border border-[hsl(191_97%_55%_/_0.35)] text-[hsl(191_97%_55%)] hover:bg-[hsl(191_97%_55%_/_0.2)] transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try Again
          </Link>
          <Link
            to="/"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-[hsl(224_15%_24%)] transition-all"
          >
            Back to MockJ <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <p className="text-[10px] text-muted-foreground/40 text-center pb-4">
          MockJ OAuth Diagnostic · This page is only shown when arriving via an OAuth redirect
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DiagRow component
// ─────────────────────────────────────────────────────────────────────────────

function DiagRow({
  label,
  value,
  mono,
  highlight,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: 'error' | 'success' | 'info';
  onCopy?: () => void;
  copied?: boolean;
}) {
  const valueColor = highlight === 'error'
    ? 'text-[hsl(0_80%_65%)]'
    : highlight === 'success'
    ? 'text-[hsl(142_70%_55%)]'
    : highlight === 'info'
    ? 'text-[hsl(191_97%_65%)]'
    : 'text-foreground';

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>
      <div className="flex items-start gap-2">
        <p
          className={cn(
            'flex-1 text-xs leading-relaxed break-all',
            mono ? 'font-mono' : '',
            valueColor
          )}
        >
          {value}
        </p>
        {onCopy && (
          <button
            onClick={onCopy}
            className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] border border-border text-muted-foreground hover:text-foreground hover:border-[hsl(224_15%_24%)] transition-colors mt-0.5"
          >
            <Copy className="w-2.5 h-2.5" />
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  );
}
