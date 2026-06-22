import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, Play, ShieldAlert, ShieldCheck, ShieldOff,
  Database, Key, CreditCard, HardDrive, Zap, AlertTriangle,
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, Bug,
  Wrench, Activity, Layers, BarChart3, Loader2, AlertCircle,
  FileCode2, Component, Lightbulb, Circle, Calendar, Bell,
  ExternalLink, Radio, Eye, EyeOff, Mail, Wifi, WifiOff,
  FlaskConical, Coins, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ── Color system ──────────────────────────────────────────────────────────────
const GREEN  = 'hsl(142 70% 55%)';
const RED    = 'hsl(4 90% 58%)';
const AMBER  = 'hsl(38 95% 60%)';
const ORANGE = 'hsl(25 95% 60%)';
const VIOLET = 'hsl(265 80% 65%)';
const BLUE   = 'hsl(210 80% 60%)';

const RISK_META: Record<string, { label: string; color: string; icon: typeof ShieldCheck; bg: string }> = {
  low:      { label: 'Low',      color: GREEN,  icon: ShieldCheck, bg: `${GREEN}14`  },
  medium:   { label: 'Medium',   color: AMBER,  icon: ShieldAlert, bg: `${AMBER}14`  },
  high:     { label: 'High',     color: ORANGE, icon: ShieldAlert, bg: `${ORANGE}14` },
  critical: { label: 'Critical', color: RED,    icon: ShieldOff,   bg: `${RED}14`    },
};

const SEV_META: Record<string, { color: string; label: string }> = {
  critical: { color: RED,    label: 'Critical' },
  high:     { color: ORANGE, label: 'High' },
  medium:   { color: AMBER,  label: 'Medium' },
  low:      { color: BLUE,   label: 'Low' },
};

const TYPE_ICON: Record<string, typeof Database> = {
  database:      Database,
  auth:          Key,
  stripe:        CreditCard,
  storage:       HardDrive,
  edge_function: Zap,
  security:      ShieldAlert,
  unknown:       Bug,
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface Scan {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  triggered_by: string;
  risk_level: string;
  total_checks: number;
  passed_checks: number;
  failed_checks: number;
  summary: Record<string, unknown>;
}

interface Check {
  id: string;
  scan_id: string;
  check_name: string;
  check_type: string;
  status: string;
  message: string;
  details: Record<string, unknown>;
  duration_ms: number;
}

interface BugReport {
  id: string;
  scan_id: string;
  title: string;
  description: string;
  severity: string;
  category: string;
  affected_file: string | null;
  affected_component: string | null;
  error_message: string | null;
  suggested_fix: string | null;
  status: string;
  created_at: string;
}

interface ScanAlert {
  id: string;
  scan_id: string;
  risk_level: string;
  alert_type: string;
  recipient: string | null;
  sent_at: string;
  payload: Record<string, unknown>;
}

interface ScheduledConfig {
  id: string;
  enabled: boolean;
  cron_expression: string;
  last_auto_scan_at: string | null;
  alert_emails: string[];
}

// ── Sentry issue type (from Sentry Issues API) ────────────────────────────────
interface SentryIssue {
  id: string;
  title: string;
  culprit: string;
  permalink: string;
  level: 'error' | 'warning' | 'info' | 'fatal';
  status: 'resolved' | 'unresolved' | 'ignored';
  count: string;         // event count as string
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  isUnhandled: boolean;
}

// ── Risk Level Badge ──────────────────────────────────────────────────────────
function RiskBadge({ level, size = 'sm' }: { level: string; size?: 'sm' | 'lg' }) {
  const meta = RISK_META[level] ?? RISK_META.low;
  const Icon = meta.icon;
  const isLg = size === 'lg';
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 font-black rounded-full', isLg ? 'px-4 py-2 text-sm' : 'px-2.5 py-1 text-[10px]')}
      style={{ background: meta.bg, border: `1px solid ${meta.color}55`, color: meta.color, boxShadow: `0 0 12px ${meta.color}20` }}
    >
      <Icon className={isLg ? 'w-4 h-4' : 'w-3 h-3'} />
      {meta.label}
    </span>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'passed') return <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: GREEN }} />;
  if (status === 'failed') return <XCircle className="w-4 h-4 shrink-0" style={{ color: RED }} />;
  if (status === 'warning') return <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: AMBER }} />;
  return <Circle className="w-4 h-4 shrink-0 text-muted-foreground" />;
}

function SevBadge({ severity }: { severity: string }) {
  const meta = SEV_META[severity] ?? { color: BLUE, label: severity };
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider"
      style={{ background: `${meta.color}18`, border: `1px solid ${meta.color}44`, color: meta.color }}>
      {meta.label}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const Icon = TYPE_ICON[type] ?? Bug;
  const colors: Record<string, string> = {
    database: BLUE, auth: AMBER, stripe: VIOLET,
    storage: GREEN, edge_function: ORANGE, security: RED,
  };
  const color = colors[type] ?? '#888';
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize"
      style={{ background: `${color}14`, border: `1px solid ${color}33`, color }}>
      <Icon className="w-2.5 h-2.5" />{type.replace('_', ' ')}
    </span>
  );
}

// ── Bug Report Card ───────────────────────────────────────────────────────────
function BugCard({ bug, onUpdateStatus }: { bug: BugReport; onUpdateStatus: (id: string, status: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const borderColor = (SEV_META[bug.severity] ?? { color: BLUE }).color;
  const isResolved = bug.status === 'resolved' || bug.status === 'wont_fix';

  const handleStatusChange = async (newStatus: string) => {
    setLoading(true);
    await onUpdateStatus(bug.id, newStatus);
    setLoading(false);
  };

  return (
    <div className={cn('rounded-2xl overflow-hidden transition-all duration-200', isResolved && 'opacity-60')}
      style={{ background: 'hsl(224 15% 7%)', border: `1px solid ${borderColor}${isResolved ? '22' : '44'}`, boxShadow: isResolved ? 'none' : `0 0 20px ${borderColor}10` }}>
      <button className="w-full flex items-start gap-3 px-4 py-3.5 text-left" onClick={() => setExpanded(v => !v)}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: `${borderColor}14`, border: `1px solid ${borderColor}33` }}>
          <Bug className="w-4 h-4" style={{ color: borderColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <SevBadge severity={bug.severity} />
            <TypeBadge type={bug.category} />
            {isResolved && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black"
                style={{ background: `${GREEN}14`, border: `1px solid ${GREEN}33`, color: GREEN }}>
                {bug.status === 'resolved' ? '✓ Resolved' : "Won't Fix"}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground leading-snug">{bug.title}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{bug.description}</p>
        </div>
        <div className="shrink-0 mt-1">
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3" style={{ borderTop: `1px solid ${borderColor}18` }}>
          {bug.error_message && (
            <div className="p-3 rounded-xl font-mono text-[11px] leading-relaxed"
              style={{ background: 'hsl(224 15% 5%)', border: '1px solid hsl(224 15% 14%)', color: 'hsl(4 60% 65%)' }}>
              {bug.error_message}
            </div>
          )}
          {(bug.affected_file || bug.affected_component) && (
            <div className="flex flex-wrap gap-2">
              {bug.affected_file && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                  style={{ background: 'hsl(224 15% 5%)', border: '1px solid hsl(224 15% 14%)' }}>
                  <FileCode2 className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[11px] font-mono text-muted-foreground">{bug.affected_file}</span>
                </div>
              )}
              {bug.affected_component && !bug.affected_file && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                  style={{ background: 'hsl(224 15% 5%)', border: '1px solid hsl(224 15% 14%)' }}>
                  <Component className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[11px] font-mono text-muted-foreground">{bug.affected_component}</span>
                </div>
              )}
            </div>
          )}
          {bug.suggested_fix && (
            <div className="p-3 rounded-xl space-y-1.5" style={{ background: `${GREEN}08`, border: `1px solid ${GREEN}22` }}>
              <div className="flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5" style={{ color: GREEN }} />
                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: `${GREEN}88` }}>Suggested Fix</p>
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(190,220,200,0.8)' }}>{bug.suggested_fix}</p>
            </div>
          )}
          {!isResolved && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={() => handleStatusChange('resolved')} disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
                style={{ background: `${GREEN}14`, border: `1px solid ${GREEN}44`, color: GREEN }}>
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                Mark Resolved
              </button>
              <button onClick={() => handleStatusChange('in_progress')} disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
                style={{ background: `${AMBER}14`, border: `1px solid ${AMBER}44`, color: AMBER }}>
                In Progress
              </button>
              <button onClick={() => handleStatusChange('wont_fix')} disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
                style={{ background: 'hsl(224 15% 9%)', border: '1px solid hsl(224 15% 18%)', color: 'hsl(210 20% 50%)' }}>
                Won't Fix
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CheckRow({ check }: { check: Check }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = check.details && Object.keys(check.details).length > 0;
  return (
    <div className="border-b border-border/40 last:border-0">
      <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[hsl(224_15%_9%)] transition-colors"
        onClick={() => hasDetails && setExpanded(v => !v)}>
        <StatusIcon status={check.status} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{check.check_name}</p>
          <p className="text-[10px] text-muted-foreground truncate">{check.message}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <TypeBadge type={check.check_type} />
          <span className="text-[10px] font-mono text-muted-foreground/40">{check.duration_ms}ms</span>
          {hasDetails && (expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />)}
        </div>
      </button>
      {expanded && hasDetails && (
        <div className="px-4 pb-3">
          <pre className="text-[10px] font-mono text-muted-foreground/70 bg-[hsl(224_15%_5%)] p-3 rounded-xl overflow-auto">
            {JSON.stringify(check.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function ScanHistoryItem({ scan, isSelected, onClick }: { scan: Scan; isSelected: boolean; onClick: () => void }) {
  const duration = scan.completed_at
    ? Math.round((new Date(scan.completed_at).getTime() - new Date(scan.started_at).getTime()) / 1000)
    : null;
  const isAuto = scan.triggered_by === 'auto_cron';
  return (
    <button onClick={onClick}
      className={cn('w-full flex items-start gap-3 px-3 py-3 rounded-xl text-left transition-all', isSelected && 'ring-1')}
      style={{ background: isSelected ? `${GREEN}10` : 'transparent', border: isSelected ? `1px solid ${GREEN}44` : '1px solid transparent' }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: (RISK_META[scan.risk_level] ?? RISK_META.low).bg }}>
        {scan.status === 'running'
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: AMBER }} />
          : isAuto
            ? <Calendar className="w-3.5 h-3.5" style={{ color: (RISK_META[scan.risk_level] ?? RISK_META.low).color }} />
            : <Activity className="w-3.5 h-3.5" style={{ color: (RISK_META[scan.risk_level] ?? RISK_META.low).color }} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <RiskBadge level={scan.risk_level} />
          {isAuto && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black"
              style={{ background: `${BLUE}18`, color: BLUE }}>AUTO</span>
          )}
          {scan.status === 'running' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black"
              style={{ background: `${AMBER}18`, color: AMBER }}>Scanning…</span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          {new Date(scan.started_at).toLocaleString()} {duration ? `· ${duration}s` : ''}
        </p>
        {scan.status === 'completed' && (
          <p className="text-[10px] mt-0.5">
            <span style={{ color: GREEN }}>✓ {scan.passed_checks}</span>
            {scan.failed_checks > 0 && <span style={{ color: RED }}> · ✗ {scan.failed_checks}</span>}
            <span className="text-muted-foreground"> / {scan.total_checks}</span>
          </p>
        )}
      </div>
    </button>
  );
}

// ── Sentry Issue Card ─────────────────────────────────────────────────────────
function SentryIssueCard({ issue }: { issue: SentryIssue }) {
  const levelColors: Record<string, string> = { fatal: RED, error: ORANGE, warning: AMBER, info: BLUE };
  const color = levelColors[issue.level] ?? ORANGE;
  const timeSince = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };
  return (
    <a href={issue.permalink} target="_blank" rel="noopener noreferrer"
      className="flex items-start gap-3 p-3.5 rounded-xl transition-all hover:scale-[1.01]"
      style={{ background: 'hsl(224 15% 7%)', border: `1px solid ${color}33`, textDecoration: 'none' }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: `${color}14`, border: `1px solid ${color}33` }}>
        <AlertCircle className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase"
            style={{ background: `${color}18`, border: `1px solid ${color}44`, color }}>
            {issue.level}
          </span>
          {issue.isUnhandled && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ background: `${RED}14`, color: RED }}>unhandled</span>
          )}
        </div>
        <p className="text-xs font-semibold text-foreground truncate leading-snug">{issue.title}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{issue.culprit}</p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-[10px] text-muted-foreground/60">{parseInt(issue.count).toLocaleString()} events</span>
          {issue.userCount > 0 && <span className="text-[10px] text-muted-foreground/60">{issue.userCount} users</span>}
          <span className="text-[10px] text-muted-foreground/60">last {timeSince(issue.lastSeen)}</span>
        </div>
      </div>
      <ExternalLink className="w-3 h-3 text-muted-foreground/40 shrink-0 mt-1" />
    </a>
  );
}

// ── Live Site Errors Panel (Sentry) ───────────────────────────────────────────
function LiveSiteErrorsPanel() {
  const [issues, setIssues] = useState<SentryIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const sentryOrg = import.meta.env.VITE_SENTRY_ORG as string | undefined;
  const sentryProject = import.meta.env.VITE_SENTRY_PROJECT as string | undefined;
  const isConfigured = !!(sentryOrg && sentryProject && import.meta.env.VITE_SENTRY_DSN);

  const fetchIssues = useCallback(async () => {
    if (!isConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Sign in required'); return; }

      const { data, error: fnError } = await supabase.functions.invoke('sentry-issues', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (fnError) {
        let msg = fnError.message;
        if (fnError instanceof FunctionsHttpError) {
          try { msg = await fnError.context.text(); } catch { /* ignore */ }
        }
        setError(msg);
        return;
      }

      setIssues((data?.issues ?? []) as SentryIssue[]);
      setLastFetched(new Date());
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    if (isConfigured) fetchIssues();
  }, [fetchIssues, isConfigured]);

  const unresolvedIssues = issues.filter(i => i.status === 'unresolved');
  const fatalCount = issues.filter(i => i.level === 'fatal' && i.status === 'unresolved').length;

  if (!isConfigured) {
    return (
      <div className="rounded-2xl p-6 space-y-4"
        style={{ background: 'hsl(224 15% 8%)', border: `1px solid ${VIOLET}33` }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: `${VIOLET}14`, border: `1px solid ${VIOLET}33` }}>
            <Radio className="w-5 h-5" style={{ color: VIOLET }} />
          </div>
          <div>
            <h3 className="text-sm font-black text-foreground">Live Site Errors</h3>
            <p className="text-[11px] text-muted-foreground">Powered by Sentry — real-time error tracking</p>
          </div>
        </div>

        <div className="p-4 rounded-xl space-y-3" style={{ background: `${VIOLET}08`, border: `1px solid ${VIOLET}22` }}>
          <div className="flex items-center gap-1.5">
            <WifiOff className="w-3.5 h-3.5" style={{ color: VIOLET }} />
            <p className="text-xs font-semibold" style={{ color: VIOLET }}>Sentry not configured</p>
          </div>
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
            Sentry monitors your live app for crashes, unhandled errors, and performance issues in real-time.
          </p>

          <button onClick={() => setShowConfig(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold transition-colors"
            style={{ color: VIOLET }}>
            {showConfig ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showConfig ? 'Hide' : 'Show'} setup instructions
          </button>

          {showConfig && (
            <div className="space-y-3 pt-1">
              <ol className="space-y-2">
                {[
                  { step: '1', text: 'Sign up free at sentry.io → Create a React project' },
                  { step: '2', text: 'Copy the DSN from Project Settings → Client Keys' },
                  { step: '3', text: 'Add to your .env file: VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx' },
                  { step: '4', text: 'Add VITE_SENTRY_ORG=your-org and VITE_SENTRY_PROJECT=your-project to .env' },
                  { step: '5', text: 'Add SENTRY_AUTH_TOKEN to OnSpace Cloud → Secrets (from Sentry → Settings → Auth Tokens)' },
                  { step: '6', text: 'Rebuild/redeploy the app' },
                ].map(({ step, text }) => (
                  <li key={step} className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5"
                      style={{ background: `${VIOLET}22`, color: VIOLET }}>{step}</span>
                    <span className="text-[11px] text-muted-foreground leading-relaxed">{text}</span>
                  </li>
                ))}
              </ol>
              <a href="https://sentry.io/signup/" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={{ background: `${VIOLET}18`, border: `1px solid ${VIOLET}44`, color: VIOLET }}>
                <ExternalLink className="w-3 h-3" />
                Open sentry.io →
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'hsl(224 15% 8%)', border: `1px solid hsl(224 15% 16%)` }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/40">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: unresolvedIssues.length > 0 ? RED : GREEN }} />
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: `${VIOLET}14`, border: `1px solid ${VIOLET}33` }}>
            <Radio className="w-3.5 h-3.5" style={{ color: VIOLET }} />
          </div>
          <h3 className="text-sm font-black text-foreground">Live Site Errors</h3>
          {fatalCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black"
              style={{ background: `${RED}18`, border: `1px solid ${RED}33`, color: RED }}>
              {fatalCount} fatal
            </span>
          )}
          {unresolvedIssues.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black"
              style={{ background: `${ORANGE}18`, border: `1px solid ${ORANGE}33`, color: ORANGE }}>
              {unresolvedIssues.length} unresolved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {lastFetched && (
            <span className="text-[10px] text-muted-foreground/40">
              {lastFetched.toLocaleTimeString()}
            </span>
          )}
          <button onClick={fetchIssues} disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          </button>
          <a href={`https://sentry.io/organizations/${sentryOrg}/issues/?project=${sentryProject}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
            style={{ background: `${VIOLET}14`, border: `1px solid ${VIOLET}33`, color: VIOLET }}>
            <ExternalLink className="w-2.5 h-2.5" />
            Sentry
          </a>
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {loading && issues.length === 0 && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl" style={{ background: `${RED}08`, border: `1px solid ${RED}22` }}>
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {!loading && !error && issues.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Wifi className="w-8 h-8 text-muted-foreground opacity-20" />
            <p className="text-sm font-semibold text-foreground">No issues</p>
            <p className="text-xs text-muted-foreground">All clear — no unresolved errors</p>
          </div>
        )}

        {issues.length > 0 && (
          <div className="space-y-2">
            {issues.slice(0, 10).map(issue => (
              <SentryIssueCard key={issue.id} issue={issue} />
            ))}
            {issues.length > 10 && (
              <a href={`https://sentry.io/organizations/${sentryOrg}/issues/?project=${sentryProject}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all"
                style={{ background: `${VIOLET}08`, border: `1px solid ${VIOLET}22`, color: VIOLET }}>
                View all {issues.length} issues in Sentry →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Scheduled Scan Info Panel ─────────────────────────────────────────────────
function ScheduledScanPanel({ config, alerts }: { config: ScheduledConfig | null; alerts: ScanAlert[] }) {
  const recentAlerts = alerts.slice(0, 5);
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'hsl(224 15% 8%)', border: 'solid 1px hsl(224 15% 16%)' }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-bold text-foreground">Auto-Scan Schedule</h3>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ background: config?.enabled ? GREEN : '#555' }} />
          <span className="text-[11px]" style={{ color: config?.enabled ? GREEN : '#555' }}>
            {config?.enabled ? 'Active' : 'Disabled'}
          </span>
        </div>
      </div>
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Schedule</span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded"
            style={{ background: 'hsl(224 15% 5%)', color: BLUE }}>
            {config?.cron_expression ?? '0 3 * * *'} UTC
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Runs at</span>
          <span className="text-[11px] font-semibold text-foreground">3:00 AM UTC daily</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Last auto-scan</span>
          <span className="text-[11px] text-muted-foreground">
            {config?.last_auto_scan_at
              ? new Date(config.last_auto_scan_at).toLocaleString()
              : 'Never'}
          </span>
        </div>
        <div className="flex items-start justify-between gap-2">
          <span className="text-[11px] text-muted-foreground shrink-0">Alert emails</span>
          <div className="flex flex-wrap gap-1 justify-end">
            {(config?.alert_emails ?? []).map(email => (
              <span key={email} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
                style={{ background: `${GREEN}14`, color: GREEN }}>
                <Mail className="w-2.5 h-2.5" />{email}
              </span>
            ))}
          </div>
        </div>

        {/* Setup info */}
        <div className="pt-2 border-t border-border/30">
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">GitHub Actions Setup</p>
          <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
            Add these secrets to your GitHub repo for daily auto-scans:
          </p>
          <div className="mt-2 space-y-1">
            {[
              { key: 'SUPABASE_FUNCTIONS_URL', desc: 'Your functions base URL' },
              { key: 'CRON_SECRET', desc: 'Any random secret string' },
            ].map(({ key, desc }) => (
              <div key={key} className="flex items-center gap-2">
                <code className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ background: 'hsl(224 15% 5%)', color: AMBER }}>{key}</code>
                <span className="text-[10px] text-muted-foreground/50">{desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent alerts */}
        {recentAlerts.length > 0 && (
          <div className="pt-2 border-t border-border/30">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">Recent Alerts</p>
            <div className="space-y-1.5">
              {recentAlerts.map(alert => {
                const meta = RISK_META[alert.risk_level] ?? RISK_META.low;
                return (
                  <div key={alert.id} className="flex items-center gap-2">
                    <Bell className="w-3 h-3 shrink-0" style={{ color: meta.color }} />
                    <span className="text-[10px] font-semibold" style={{ color: meta.color }}>
                      {alert.risk_level.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex-1 truncate">
                      via {alert.alert_type}
                    </span>
                    <span className="text-[10px] text-muted-foreground/40 shrink-0">
                      {new Date(alert.sent_at).toLocaleDateString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Test Webhook Modal ───────────────────────────────────────────────────────
const TEST_PACKAGES = [
  { id: 'tokens-100',  label: '100 Tokens  ($1.99)',  priceId: 'price_1TjXulLNl01u4P4ryrhspzLP', tokens: 100   },
  { id: 'tokens-550',  label: '550 Tokens  ($7.99)',  priceId: 'price_1TjXwMLNl01u4P4rfSim6YVu', tokens: 550   },
  { id: 'tokens-1150', label: '1,150 Tokens ($14.99)', priceId: 'price_1TjXxjLNl01u4P4rAOpG3nnw', tokens: 1150  },
  { id: 'tokens-6000', label: '6,000 Tokens ($59.99)', priceId: 'price_1TjY1MLNl01u4P4rzU0Mvvds', tokens: 6000  },
  { id: 'builder-5k',  label: '5K Builder Credits ($4.99)',  priceId: 'price_1Tjwv9LNl01u4P4rPY50rI0m', tokens: 0, builderCredits: 5000  },
  { id: 'builder-15k', label: '15K Builder Credits ($12.99)', priceId: 'price_1TjwxhLNl01u4P4ryDfEpmqy', tokens: 0, builderCredits: 15000 },
];

interface WebhookTestResult {
  success: boolean;
  eventId?: string;
  tokensCredited?: number;
  builderCreditsCredited?: number;
  newBalance?: number;
  error?: string;
  userId?: string;
  packageLabel?: string;
}

function TestWebhookModal({ onClose, currentUserId }: { onClose: () => void; currentUserId: string }) {
  const [selectedPkg, setSelectedPkg] = useState(TEST_PACKAGES[0].id);
  const [targetUserId, setTargetUserId] = useState(currentUserId);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WebhookTestResult | null>(null);

  const handleTest = async () => {
    setLoading(true);
    setResult(null);
    try {
      const pkg = TEST_PACKAGES.find(p => p.id === selectedPkg)!;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setResult({ success: false, error: 'Not authenticated' }); return; }

      // Call admin-test-event for legacy packages, or simulate checkout.session.completed
      // directly via the stripe-webhook bypass route
      const { data, error } = await supabase.functions.invoke('admin-test-event', {
        body: { userId: targetUserId, packageId: pkg.id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try { msg = await error.context.text(); } catch { /* noop */ }
        }
        setResult({ success: false, error: msg });
        return;
      }

      setResult({
        success: true,
        eventId: data?.eventId,
        tokensCredited: data?.tokensCredited ?? 0,
        newBalance: data?.newBalance,
        packageLabel: data?.packageLabel ?? pkg.label,
        userId: data?.userId,
      });
      toast.success(`✅ ${pkg.label} — test credits applied`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: 'hsl(224 20% 7%)', border: `1px solid ${VIOLET}44`, boxShadow: `0 0 60px ${VIOLET}18` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${VIOLET}14`, border: `1px solid ${VIOLET}33` }}>
            <FlaskConical className="w-4 h-4" style={{ color: VIOLET }} />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-black text-foreground">Test Webhook Pipeline</h2>
            <p className="text-[11px] text-muted-foreground">Simulate a Stripe checkout.session.completed event without a real charge</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Package selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Token Package</label>
            <div className="grid grid-cols-1 gap-2">
              {TEST_PACKAGES.map(pkg => (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedPkg(pkg.id)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                  style={{
                    background: selectedPkg === pkg.id ? `${VIOLET}14` : 'hsl(224 15% 9%)',
                    border: `1px solid ${selectedPkg === pkg.id ? `${VIOLET}55` : 'hsl(224 15% 16%)'}`,
                    color: selectedPkg === pkg.id ? VIOLET : 'hsl(210 20% 65%)',
                  }}
                >
                  <Coins className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-semibold flex-1">{pkg.label}</span>
                  <code className="text-[10px] font-mono opacity-50">{pkg.priceId.slice(-8)}</code>
                  {selectedPkg === pkg.id && <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: VIOLET }} />}
                </button>
              ))}
            </div>
          </div>

          {/* Target user */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Target User ID</label>
            <input
              type="text"
              value={targetUserId}
              onChange={e => setTargetUserId(e.target.value)}
              placeholder="User UUID (defaults to your account)"
              className="w-full bg-[hsl(224_15%_9%)] border border-border rounded-xl px-3 py-2.5 text-xs font-mono text-foreground outline-none focus:border-[hsl(265_80%_65%_/_0.5)] transition-colors"
            />
            <p className="text-[10px] text-muted-foreground/60">Leave as-is to credit your own account</p>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: `${AMBER}08`, border: `1px solid ${AMBER}22` }}>
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: AMBER }} />
            <p className="text-[11px] leading-relaxed" style={{ color: `${AMBER}cc` }}>
              This bypasses Stripe and directly credits tokens via the admin edge function. Use only for testing the token pipeline — not for production.
            </p>
          </div>

          {/* Result */}
          {result && (
            <div
              className="p-4 rounded-xl space-y-2"
              style={{
                background: result.success ? `${GREEN}08` : `${RED}08`,
                border: `1px solid ${result.success ? `${GREEN}33` : `${RED}33`}`,
              }}
            >
              {result.success ? (
                <>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" style={{ color: GREEN }} />
                    <p className="text-sm font-black" style={{ color: GREEN }}>Pipeline OK ✓</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div><span className="text-muted-foreground">Package: </span><span className="font-semibold text-foreground">{result.packageLabel}</span></div>
                    {(result.tokensCredited ?? 0) > 0 && (
                      <div><span className="text-muted-foreground">Tokens credited: </span><span className="font-black" style={{ color: GREEN }}>+{result.tokensCredited?.toLocaleString()}</span></div>
                    )}
                    {result.newBalance !== null && result.newBalance !== undefined && (
                      <div><span className="text-muted-foreground">New balance: </span><span className="font-black" style={{ color: AMBER }}>{result.newBalance?.toLocaleString()}</span></div>
                    )}
                    <div className="col-span-2"><span className="text-muted-foreground">Event ID: </span><span className="font-mono text-[10px] text-muted-foreground/70">{result.eventId}</span></div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4" style={{ color: RED }} />
                    <p className="text-sm font-black" style={{ color: RED }}>Pipeline Failed</p>
                  </div>
                  <p className="text-[11px] font-mono" style={{ color: `${RED}cc` }}>{result.error}</p>
                </>
              )}
            </div>
          )}

          {/* Action */}
          <button
            onClick={handleTest}
            disabled={loading || !targetUserId.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-all active:scale-95 disabled:opacity-60"
            style={{
              background: `linear-gradient(135deg, ${VIOLET}, hsl(265 80% 50%))`,
              color: '#fff',
              boxShadow: `0 4px 20px ${VIOLET}44`,
            }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
            {loading ? 'Running test…' : 'Run Test — Simulate Checkout'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminMaintenancePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [scans, setScans] = useState<Scan[]>([]);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [alerts, setAlerts] = useState<ScanAlert[]>([]);
  const [scheduledConfig, setScheduledConfig] = useState<ScheduledConfig | null>(null);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bugFilter, setBugFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [checkFilter, setCheckFilter] = useState<'all' | 'failed' | 'warning' | 'passed'>('all');
  const [activeSection, setActiveSection] = useState<'bugs' | 'checks' | 'live-errors'>('bugs');
  const [showTestWebhook, setShowTestWebhook] = useState(false);

  const selectedScan = scans.find(s => s.id === selectedScanId) ?? null;

  const fetchScans = useCallback(async () => {
    const { data, error } = await supabase
      .from('maintenance_scans').select('*').order('started_at', { ascending: false }).limit(20);
    if (!error && data) {
      setScans(data as Scan[]);
      if (data.length > 0 && !selectedScanId) setSelectedScanId(data[0].id);
    }
    setLoading(false);
  }, [selectedScanId]);

  const fetchChecks = useCallback(async (scanId: string) => {
    const { data } = await supabase.from('maintenance_checks').select('*').eq('scan_id', scanId).order('created_at', { ascending: true });
    if (data) setChecks(data as Check[]);
  }, []);

  const fetchBugs = useCallback(async (scanId: string) => {
    const { data } = await supabase.from('bug_reports').select('*').eq('scan_id', scanId).order('created_at', { ascending: false });
    if (data) setBugs(data as BugReport[]);
  }, []);

  const fetchAlerts = useCallback(async () => {
    const { data } = await supabase.from('scan_alerts').select('*').order('sent_at', { ascending: false }).limit(10);
    if (data) setAlerts(data as ScanAlert[]);
  }, []);

  const fetchScheduledConfig = useCallback(async () => {
    const { data } = await supabase.from('scheduled_scan_config').select('*').limit(1).single();
    if (data) setScheduledConfig(data as ScheduledConfig);
  }, []);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    const running = scans.filter(s => s.status === 'running');
    if (running.length > 0) {
      pollRef.current = setInterval(() => {
        fetchScans();
        if (selectedScanId) { fetchChecks(selectedScanId); fetchBugs(selectedScanId); }
      }, 4000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [scans, selectedScanId, fetchScans, fetchChecks, fetchBugs]);

  useEffect(() => {
    fetchScans();
    fetchAlerts();
    fetchScheduledConfig();
  }, []);

  useEffect(() => {
    if (selectedScanId) { fetchChecks(selectedScanId); fetchBugs(selectedScanId); }
  }, [selectedScanId, fetchChecks, fetchBugs]);

  const handleTriggerScan = async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Sign in required'); return; }

      const { data, error } = await supabase.functions.invoke('maintenance-scan', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try { msg = await error.context.text(); } catch { /* ignore */ }
        }
        toast.error(`Scan failed: ${msg}`);
        return;
      }

      toast.success(`✅ Scan completed — Risk: ${data?.risk_level?.toUpperCase() ?? 'UNKNOWN'}`);
      await fetchScans();
      if (data?.scan_id) {
        setSelectedScanId(data.scan_id);
        await fetchChecks(data.scan_id);
        await fetchBugs(data.scan_id);
      }
    } finally {
      setScanning(false);
    }
  };

  const handleUpdateBugStatus = async (bugId: string, status: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase.functions.invoke('maintenance-scan', {
      body: { action: 'update-bug-status', bug_id: bugId, status },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) { toast.error('Failed to update bug status'); return; }
    toast.success(`Bug marked as ${status}`);
    if (selectedScanId) await fetchBugs(selectedScanId);
  };

  const filteredBugs = bugs.filter(b => {
    if (bugFilter === 'open') return b.status === 'open' || b.status === 'in_progress';
    if (bugFilter === 'resolved') return b.status === 'resolved' || b.status === 'wont_fix';
    return true;
  });

  const filteredChecks = checks.filter(c => checkFilter === 'all' ? true : c.status === checkFilter);
  const openBugsCount = bugs.filter(b => b.status === 'open' || b.status === 'in_progress').length;
  const criticalBugs = bugs.filter(b => (b.status === 'open' || b.status === 'in_progress') && b.severity === 'critical').length;
  const highBugs = bugs.filter(b => (b.status === 'open' || b.status === 'in_progress') && b.severity === 'high').length;
  const isRunning = scans.some(s => s.status === 'running') || scanning;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex items-center gap-3 px-5 py-3 border-b border-border bg-[hsl(224_20%_4%)] backdrop-blur-xl">
        <button onClick={() => navigate('/admin/dashboard')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>
        <div className="flex-1 flex items-center gap-2">
          <Wrench className="w-4 h-4" style={{ color: GREEN }} />
          <h1 className="text-base font-black text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            AI Maintenance
          </h1>
          {isRunning && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black"
              style={{ background: `${AMBER}18`, border: `1px solid ${AMBER}44`, color: AMBER }}>
              <Loader2 className="w-3 h-3 animate-spin" /> Scanning…
            </span>
          )}
        </div>
        <button onClick={() => { fetchScans(); fetchAlerts(); if (selectedScanId) { fetchChecks(selectedScanId); fetchBugs(selectedScanId); } }}
          className="w-8 h-8 flex items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setShowTestWebhook(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
          style={{ background: `${VIOLET}14`, border: `1px solid ${VIOLET}44`, color: VIOLET }}
          title="Simulate a Stripe checkout event to test the token credit pipeline"
        >
          <FlaskConical className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Test Webhook</span>
        </button>
        <button onClick={handleTriggerScan} disabled={isRunning}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-black transition-all active:scale-95 disabled:opacity-60"
          style={{
            background: isRunning ? `${GREEN}14` : `linear-gradient(135deg, ${GREEN}, hsl(142 70% 42%))`,
            border: `1px solid ${GREEN}66`, color: isRunning ? GREEN : '#000',
            boxShadow: isRunning ? 'none' : `0 4px 16px ${GREEN}44`,
          }}>
          {isRunning
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Scanning…</>
            : <><Play className="w-3.5 h-3.5" />Run Scan</>
          }
        </button>
      </header>

      {showTestWebhook && user && (
        <TestWebhookModal
          onClose={() => setShowTestWebhook(false)}
          currentUserId={user.id}
        />
      )}

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* ── Risk Banner + Summary ─────────────────────────────────────── */}
        {selectedScan && selectedScan.status === 'completed' && (
          <>
            <div className="flex items-center gap-4 p-4 rounded-2xl"
              style={{ background: (RISK_META[selectedScan.risk_level] ?? RISK_META.low).bg, border: `1px solid ${(RISK_META[selectedScan.risk_level] ?? RISK_META.low).color}44` }}>
              {(() => {
                const meta = RISK_META[selectedScan.risk_level] ?? RISK_META.low;
                const Icon = meta.icon;
                return (
                  <>
                    <Icon className="w-8 h-8 shrink-0" style={{ color: meta.color }} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-black text-foreground">Risk Level:</p>
                        <RiskBadge level={selectedScan.risk_level} size="lg" />
                        {selectedScan.triggered_by === 'auto_cron' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black"
                            style={{ background: `${BLUE}18`, color: BLUE }}>AUTO-SCAN</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {selectedScan.triggered_by === 'auto_cron' ? '⏰ Scheduled scan · ' : ''}
                        {new Date(selectedScan.started_at).toLocaleString()}
                        {selectedScan.completed_at && ` · ${Math.round((new Date(selectedScan.completed_at).getTime() - new Date(selectedScan.started_at).getTime()) / 1000)}s`}
                      </p>
                    </div>
                    {openBugsCount > 0 && (
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-black" style={{ color: RED }}>{openBugsCount}</p>
                        <p className="text-[10px] text-muted-foreground">open issues</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total Checks', value: selectedScan.total_checks, color: BLUE, icon: Layers },
                { label: 'Passed', value: selectedScan.passed_checks, color: GREEN, icon: CheckCircle2 },
                { label: 'Failed', value: selectedScan.failed_checks, color: RED, icon: XCircle },
                { label: 'Warnings', value: checks.filter(c => c.status === 'warning').length, color: AMBER, icon: AlertTriangle },
              ].map(({ label, value, color, icon: Icon }) => (
                <div key={label} className="p-4 rounded-2xl bg-[hsl(224_15%_8%)] border border-border flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${color}14`, border: `1px solid ${color}33` }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <div>
                    <p className="text-xl font-black text-foreground">{value}</p>
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {(criticalBugs > 0 || highBugs > 0) && (
              <div className="p-4 rounded-2xl flex items-center gap-3"
                style={{ background: `${RED}08`, border: `1px solid ${RED}33` }}>
                <AlertCircle className="w-5 h-5 shrink-0" style={{ color: RED }} />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {criticalBugs > 0 && `${criticalBugs} critical`}
                    {criticalBugs > 0 && highBugs > 0 && ' and '}
                    {highBugs > 0 && `${highBugs} high-severity`}
                    {' issue'}{(criticalBugs + highBugs) !== 1 ? 's' : ''} require immediate attention
                  </p>
                  <p className="text-[11px] text-muted-foreground">Review the bug reports and apply the suggested fixes.</p>
                </div>
              </div>
            )}
          </>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && scans.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <Wrench className="w-12 h-12 text-muted-foreground opacity-30" />
            <div>
              <p className="text-base font-semibold text-foreground">No scans yet</p>
              <p className="text-sm text-muted-foreground mt-1">Click "Run Scan" to perform the first automated health check.</p>
            </div>
          </div>
        )}

        {!loading && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
            {/* ── Left: Main content ─────────────────────────────────────── */}
            <div className="space-y-4">
              {/* Section nav */}
              {scans.length > 0 && (
                <div className="flex gap-1 p-1 rounded-xl bg-[hsl(224_15%_8%)] border border-border">
                  {([
                    { id: 'bugs' as const, label: 'Bug Reports', badge: openBugsCount, color: RED },
                    { id: 'checks' as const, label: 'Check Results', badge: 0, color: null },
                    { id: 'live-errors' as const, label: 'Live Site Errors', badge: 0, color: VIOLET },
                  ]).map(({ id, label, badge, color }) => (
                    <button key={id} onClick={() => setActiveSection(id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all"
                      style={{
                        background: activeSection === id ? `${color ?? GREEN}18` : 'transparent',
                        color: activeSection === id ? (color ?? GREEN) : 'hsl(210 20% 45%)',
                        border: activeSection === id ? `1px solid ${(color ?? GREEN)}44` : '1px solid transparent',
                      }}>
                      {label}
                      {badge > 0 && (
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
                          style={{ background: RED, color: '#fff' }}>{badge}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Bug Reports */}
              {activeSection === 'bugs' && scans.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bug className="w-4 h-4 text-muted-foreground" />
                      <h2 className="text-sm font-bold text-foreground">Bug Reports</h2>
                      {openBugsCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black"
                          style={{ background: `${RED}18`, border: `1px solid ${RED}33`, color: RED }}>
                          {openBugsCount} open
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {(['all', 'open', 'resolved'] as const).map(f => (
                        <button key={f} onClick={() => setBugFilter(f)}
                          className="px-3 py-1 rounded-lg text-[11px] font-semibold transition-all capitalize"
                          style={{ background: bugFilter === f ? `${GREEN}18` : 'transparent', border: bugFilter === f ? `1px solid ${GREEN}44` : '1px solid transparent', color: bugFilter === f ? GREEN : 'hsl(210 20% 45%)' }}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  {filteredBugs.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-10 rounded-2xl border border-dashed border-border text-center">
                      <ShieldCheck className="w-10 h-10 text-muted-foreground opacity-25" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">{bugFilter === 'open' ? 'No open issues' : 'No bugs found'}</p>
                        <p className="text-xs text-muted-foreground mt-1">{bugFilter === 'open' ? 'All issues resolved ✓' : 'Run a scan to check'}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredBugs.map(bug => <BugCard key={bug.id} bug={bug} onUpdateStatus={handleUpdateBugStatus} />)}
                    </div>
                  )}
                </div>
              )}

              {/* Check Results */}
              {activeSection === 'checks' && scans.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-muted-foreground" />
                      <h2 className="text-sm font-bold text-foreground">Check Results</h2>
                      <span className="text-xs text-muted-foreground">({checks.length} checks)</span>
                    </div>
                    <div className="flex gap-1">
                      {(['all', 'failed', 'warning', 'passed'] as const).map(f => (
                        <button key={f} onClick={() => setCheckFilter(f)}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all capitalize"
                          style={{ background: checkFilter === f ? `${GREEN}18` : 'transparent', border: checkFilter === f ? `1px solid ${GREEN}44` : '1px solid transparent', color: checkFilter === f ? GREEN : 'hsl(210 20% 45%)' }}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  {filteredChecks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No checks match the current filter.</p>
                  ) : (
                    <div className="rounded-2xl bg-[hsl(224_15%_8%)] border border-border overflow-hidden">
                      {filteredChecks.map(check => <CheckRow key={check.id} check={check} />)}
                    </div>
                  )}
                </div>
              )}

              {/* Live Site Errors */}
              {activeSection === 'live-errors' && <LiveSiteErrorsPanel />}
            </div>

            {/* ── Right: sidebar ────────────────────────────────────────── */}
            <div className="space-y-4">
              {/* Scan History */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-sm font-bold text-foreground">Scan History</h2>
                </div>
                <div className="space-y-1">
                  {scans.map(scan => (
                    <ScanHistoryItem key={scan.id} scan={scan} isSelected={scan.id === selectedScanId}
                      onClick={() => { setSelectedScanId(scan.id); setActiveSection('bugs'); }} />
                  ))}
                </div>
              </div>

              {/* Scheduled Scan Config */}
              <ScheduledScanPanel config={scheduledConfig} alerts={alerts} />

              {/* GitHub Actions links */}
              <div className="p-4 rounded-2xl bg-[hsl(224_15%_8%)] border border-border space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">GitHub Actions</p>
                {[
                  { label: '⏰ Daily Auto-Scan', href: '.github/workflows/auto-scan.yml' },
                  { label: '🔨 Build Check', href: '.github/workflows/build-check.yml' },
                  { label: '🎭 Playwright E2E', href: '.github/workflows/playwright.yml' },
                  { label: '🔒 CodeQL Security', href: '.github/workflows/codeql.yml' },
                ].map(({ label }) => (
                  <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-muted-foreground"
                    style={{ background: 'hsl(224 15% 6%)', border: '1px solid hsl(224 15% 14%)' }}>
                    {label}
                  </div>
                ))}
              </div>

              {/* Info card */}
              <div className="p-4 rounded-2xl bg-[hsl(224_15%_8%)] border border-border">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">System Summary</p>
                <ul className="space-y-1.5 text-[11px] text-muted-foreground/70">
                  <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: GREEN }} /> 18 automated health checks</li>
                  <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: GREEN }} /> Daily auto-scan at 3am UTC</li>
                  <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: GREEN }} /> Email alerts on high/critical risk</li>
                  <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: GREEN }} /> Sentry live error tracking</li>
                  <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: GREEN }} /> AI-powered fix suggestions</li>
                  <li className="flex items-center gap-1.5"><XCircle className="w-3 h-3 shrink-0" style={{ color: RED }} /> Cannot push directly to production</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
