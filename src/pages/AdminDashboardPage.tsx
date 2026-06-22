/**
 * MockJ Admin Dashboard — /admin/dashboard
 * Real-time user management, revenue metrics, AI usage analytics, CRM, webhook health.
 * Access gated by admin email whitelist.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Users, DollarSign, Activity, Zap, RefreshCw, ShieldAlert,
  ArrowLeft, Search, Download, Crown, MessageSquare, Image, Video,
  TrendingUp, ChevronUp, ChevronDown, ExternalLink, Mail,
  CreditCard, Calendar, Filter, Eye, CheckCircle2, XCircle,
  Clock, BarChart2, User, Copy, AlertCircle, SortAsc, SortDesc, Coins,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';

// ── Admin whitelist ────────────────────────────────────────────────────────────
const ADMIN_EMAILS = ['mltxpro@gmail.com', 'jenny@mltxpro.com', 'admin@mockj.online'];

// ── Pricing ───────────────────────────────────────────────────────────────────
const TIER_LABELS: Record<string, string> = { pro: 'Pro', sale: 'Intro', free: 'Free' };
const TIER_PRICE: Record<string, number> = { pro: 50.99, sale: 2.99, free: 0 };
const TIER_COLORS: Record<string, string> = {
  pro:  'hsl(38 95% 60%)',
  sale: 'hsl(142 70% 55%)',
  free: 'hsl(215 16% 47%)',
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface AdminUser {
  id: string;
  username: string;
  email: string;
  plan: string;
  subscription_status: string;
  tier: string;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  chat_30d: number;
  image_30d: number;
  video_30d: number;
  total_ai_30d: number;
  last_active: string | null;
  last_sign_in: string | null;
  created_at: string | null;
}

interface RevenueData {
  mrr: number;
  arr: number;
  active_subscribers: number;
  tier_breakdown: Record<string, { count: number; mrr: number }>;
  estimated_total_revenue: number;
  recent_events: { type: string; processed_at: string; payload: Record<string, unknown> }[];
}

interface UsageData {
  chat_7d: number;
  image_7d: number;
  video_7d: number;
  chat_30d: number;
  image_30d: number;
  video_30d: number;
  daily: { date: string; chat: number; images: number; videos: number }[];
}

interface WebhookHealth {
  lastEvent: { type: string; processed_at: string } | null;
  lastTokenCredit: { description: string; amount: number; created_at: string } | null;
  last24hCounts: Record<string, number>;
  totalLast24h: number;
}

type Tab = 'overview' | 'users' | 'revenue' | 'usage' | 'crm' | 'webhook';
type SortField = 'email' | 'plan' | 'total_ai_30d' | 'last_sign_in' | 'created_at';
type SortDir = 'asc' | 'desc';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString();
const fmtDate = (s: string | null) => {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtDateShort = (s: string | null) => {
  if (!s) return '—';
  const d = new Date(s);
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const fmtUSD = (n: number) => `$${n.toFixed(2)}`;

// ── Chart tooltip ─────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[hsl(224_20%_8%)] border border-border rounded-xl p-3 shadow-xl text-xs">
      <p className="text-muted-foreground mb-2 font-medium">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-foreground capitalize">{p.name}:</span>
          <span className="font-bold text-foreground">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

// ── Plan Badge ────────────────────────────────────────────────────────────────
function PlanBadge({ tier, status }: { tier: string; status: string }) {
  const isPaid = tier !== 'free' && (status === 'active' || status === 'trialing');
  const color = isPaid ? TIER_COLORS[tier] ?? TIER_COLORS.free : TIER_COLORS.free;
  const label = isPaid ? TIER_LABELS[tier] ?? tier : 'Free';
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: `${color.replace(')', ' / 0.12)')}`, border: `1px solid ${color.replace(')', ' / 0.35)')}`, color }}
    >
      {isPaid && <Crown className="w-2.5 h-2.5" />}
      {label}
    </span>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ElementType }> = {
    active:    { color: 'hsl(142 70% 55%)', icon: CheckCircle2 },
    trialing:  { color: 'hsl(191 97% 55%)', icon: Clock },
    past_due:  { color: 'hsl(38 95% 60%)',  icon: AlertCircle },
    canceled:  { color: 'hsl(0 70% 55%)',   icon: XCircle },
    inactive:  { color: 'hsl(215 16% 47%)', icon: XCircle },
    none:      { color: 'hsl(215 16% 47%)', icon: XCircle },
  };
  const cfg = map[status] ?? map.none;
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: cfg.color }}>
      <Icon className="w-3 h-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, color, trend,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; trend?: { dir: 'up' | 'down'; text: string };
}) {
  return (
    <div
      className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden group hover:border-opacity-60 transition-all duration-200"
      style={{ '--accent': color } as React.CSSProperties}
    >
      <div
        className="absolute top-0 right-0 w-20 h-20 rounded-full blur-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `${color.replace(')', ' / 0.1)')}`, transform: 'translate(30%, -30%)' }}
      />
      <div className="flex items-start justify-between">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${color.replace(')', ' / 0.12)')}`, border: `1px solid ${color.replace(')', ' / 0.3)')}` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        {trend && (
          <div
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              color: trend.dir === 'up' ? 'hsl(142 70% 55%)' : 'hsl(4 90% 58%)',
              background: trend.dir === 'up' ? 'hsl(142 70% 55% / 0.1)' : 'hsl(4 90% 58% / 0.1)',
            }}
          >
            {trend.dir === 'up' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {trend.text}
          </div>
        )}
      </div>
      <div>
        <p
          className="text-2xl font-black text-foreground leading-none"
          style={{ fontFamily: 'Space Grotesk, sans-serif', color }}
        >
          {value}
        </p>
        <p className="text-xs font-semibold text-foreground/80 mt-1">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── User Drawer ───────────────────────────────────────────────────────────────
function UserDrawer({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const isPaid = user.tier !== 'free' && (user.subscription_status === 'active' || user.subscription_status === 'trialing');
  const tierColor = isPaid ? TIER_COLORS[user.tier] ?? TIER_COLORS.free : TIER_COLORS.free;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full overflow-y-auto bg-[hsl(224_20%_7%)] border-l border-border shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[hsl(224_20%_7%)] border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>User Profile</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground border border-border transition-all">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <div className="rounded-2xl border p-5 space-y-4" style={{ background: 'hsl(224 20% 10%)', borderColor: `${tierColor.replace(')', ' / 0.3)')}` }}>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black shrink-0"
                style={{ background: `${tierColor.replace(')', ' / 0.12)')}`, border: `1px solid ${tierColor.replace(')', ' / 0.35)')}`, color: tierColor, fontFamily: 'Space Grotesk, sans-serif' }}>
                {user.username ? user.username[0].toUpperCase() : user.email[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{user.username || 'No username'}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <PlanBadge tier={user.tier} status={user.subscription_status} />
                  <StatusBadge status={user.subscription_status} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {[
                { label: 'User ID', value: user.id.slice(0, 8) + '…', copy: user.id },
                { label: 'Email', value: user.email, copy: user.email },
                { label: 'Joined', value: fmtDate(user.created_at), copy: null },
                { label: 'Last Sign In', value: fmtDateShort(user.last_sign_in), copy: null },
              ].map(row => (
                <div key={row.label}>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{row.label}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-foreground font-medium truncate">{row.value}</span>
                    {row.copy && (
                      <button onClick={() => { navigator.clipboard.writeText(row.copy!); toast.success('Copied!'); }}
                        className="text-muted-foreground hover:text-[hsl(191_97%_55%)] transition-colors shrink-0">
                        <Copy className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-[hsl(224_20%_10%)] p-5 space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="w-3.5 h-3.5" style={{ color: TIER_COLORS[user.tier] ?? TIER_COLORS.free }} />
              <h3 className="text-xs font-bold text-foreground">Subscription</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Plan</p><p className="font-bold text-foreground">{TIER_LABELS[user.tier] ?? user.tier}</p></div>
              <div><p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Monthly Value</p><p className="font-bold" style={{ color: 'hsl(38 95% 60%)' }}>{fmtUSD(TIER_PRICE[user.tier] ?? 0)}</p></div>
              <div><p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Status</p><StatusBadge status={user.subscription_status} /></div>
              <div><p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Renews</p><p className="text-foreground font-medium">{fmtDate(user.current_period_end)}</p></div>
            </div>
            {user.stripe_customer_id && (
              <a href={`https://dashboard.stripe.com/customers/${user.stripe_customer_id}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[hsl(191_97%_55%)] hover:opacity-80 mt-1">
                <ExternalLink className="w-3 h-3" /> View in Stripe
              </a>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-[hsl(224_20%_10%)] p-5 space-y-3">
            <div className="flex items-center gap-2 mb-3"><Zap className="w-3.5 h-3.5 text-[hsl(191_97%_55%)]" /><h3 className="text-xs font-bold text-foreground">AI Usage (Last 30 Days)</h3></div>
            <div className="grid grid-cols-3 gap-3">
              {[{ label: 'Chat', value: user.chat_30d, color: 'hsl(191 97% 55%)', icon: MessageSquare }, { label: 'Images', value: user.image_30d, color: 'hsl(265 80% 65%)', icon: Image }, { label: 'Videos', value: user.video_30d, color: 'hsl(38 95% 60%)', icon: Video }].map(f => (
                <div key={f.label} className="text-center p-3 rounded-xl bg-[hsl(224_15%_13%)]">
                  <f.icon className="w-4 h-4 mx-auto mb-1.5" style={{ color: f.color }} />
                  <p className="text-lg font-black text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif', color: f.color }}>{fmt(f.value)}</p>
                  <p className="text-[10px] text-muted-foreground">{f.label}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1"><span className="text-[10px] text-muted-foreground">Total AI requests</span><span className="text-xs font-bold text-[hsl(191_97%_55%)]">{fmt(user.total_ai_30d)}</span></div>
            <div className="flex items-center justify-between"><span className="text-[10px] text-muted-foreground">Last active</span><span className="text-xs font-medium text-foreground">{fmtDateShort(user.last_active)}</span></div>
          </div>

          <div className="space-y-2">
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Actions</h3>
            <button onClick={() => { navigator.clipboard.writeText(user.email); toast.success('Email copied!'); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground hover:border-[hsl(191_97%_55%_/_0.4)] transition-all">
              <Mail className="w-3.5 h-3.5" /> Copy email address
            </button>
            <a href={`mailto:${user.email}?subject=About your MockJ account`}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border text-xs text-muted-foreground hover:text-[hsl(191_97%_55%)] hover:border-[hsl(191_97%_55%_/_0.4)] transition-all">
              <Mail className="w-3.5 h-3.5" /> Send email
            </a>
            {user.stripe_customer_id && (
              <a href={`https://dashboard.stripe.com/customers/${user.stripe_customer_id}`} target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border text-xs text-muted-foreground hover:text-[hsl(38_95%_60%)] hover:border-[hsl(38_95%_60%_/_0.4)] transition-all">
                <CreditCard className="w-3.5 h-3.5" /> View Stripe Profile
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [webhookHealth, setWebhookHealth] = useState<WebhookHealth | null>(null);

  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingRevenue, setLoadingRevenue] = useState(false);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [loadingWebhook, setLoadingWebhook] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<'all' | 'pro' | 'sale' | 'free'>('all');
  const [sortField, setSortField] = useState<SortField>('last_sign_in');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  const [crmSearch, setCrmSearch] = useState('');
  const [crmFilter, setCrmFilter] = useState<'all' | 'paid' | 'free' | 'inactive'>('all');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setAuthorized(false); return; }
    setAuthorized(ADMIN_EMAILS.includes(user.email));
  }, [user, authLoading]);

  const invoke = useCallback(async (action: string) => {
    const { data, error } = await supabase.functions.invoke('admin-users', { body: { action } });
    if (error) {
      let msg = error.message;
      if (error instanceof FunctionsHttpError) {
        try { const txt = await error.context?.text(); msg = txt || msg; } catch { /* ignore */ }
      }
      throw new Error(msg);
    }
    return data;
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await invoke('get_users');
      setUsers(data.users ?? []);
    } catch (err) {
      console.error('[AdminDashboard] get_users error', err);
      toast.error('Failed to load users');
    } finally { setLoadingUsers(false); }
  }, [invoke]);

  const fetchRevenue = useCallback(async () => {
    setLoadingRevenue(true);
    try { const data = await invoke('get_revenue'); setRevenueData(data); }
    catch (err) { console.error('[AdminDashboard] get_revenue error', err); }
    finally { setLoadingRevenue(false); }
  }, [invoke]);

  const fetchUsage = useCallback(async () => {
    setLoadingUsage(true);
    try { const data = await invoke('get_usage'); setUsageData(data); }
    catch (err) { console.error('[AdminDashboard] get_usage error', err); }
    finally { setLoadingUsage(false); }
  }, [invoke]);

  const fetchWebhookHealth = useCallback(async () => {
    setLoadingWebhook(true);
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [eventsRes, creditRes] = await Promise.all([
        supabase
          .from('webhook_events')
          .select('type, processed_at')
          .gte('processed_at', cutoff)
          .order('processed_at', { ascending: false })
          .limit(200),
        supabase
          .from('token_transactions')
          .select('description, amount, created_at')
          .eq('type', 'purchase')
          .order('created_at', { ascending: false })
          .limit(1),
      ]);
      const events = eventsRes.data ?? [];
      const counts: Record<string, number> = {};
      for (const ev of events) {
        counts[ev.type] = (counts[ev.type] ?? 0) + 1;
      }
      setWebhookHealth({
        lastEvent: events[0] ?? null,
        lastTokenCredit: creditRes.data?.[0] ?? null,
        last24hCounts: counts,
        totalLast24h: events.length,
      });
    } catch (err) {
      console.error('[AdminDashboard] fetchWebhookHealth error', err);
    } finally { setLoadingWebhook(false); }
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchUsers(), fetchRevenue(), fetchUsage(), fetchWebhookHealth()]);
    setLastRefresh(new Date());
    setRefreshing(false);
  }, [fetchUsers, fetchRevenue, fetchUsage, fetchWebhookHealth]);

  useEffect(() => {
    if (authorized !== true) return;
    refreshAll();
    pollRef.current = setInterval(refreshAll, 30_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [authorized, refreshAll]);

  const totalUsers = users.length;
  const paidUsers = users.filter(u => u.tier !== 'free' && (u.subscription_status === 'active' || u.subscription_status === 'trialing')).length;
  const activeToday = users.filter(u => u.last_active === new Date().toISOString().slice(0, 10)).length;
  const newThisWeek = users.filter(u => {
    if (!u.created_at) return false;
    return Date.now() - new Date(u.created_at).getTime() < 7 * 86400000;
  }).length;

  const filteredUsers = users
    .filter(u => {
      const matchSearch = !search || u.email.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase());
      const matchPlan = planFilter === 'all' ||
        (planFilter === 'pro' && u.tier === 'pro' && u.subscription_status === 'active') ||
        (planFilter === 'sale' && u.tier === 'sale' && u.subscription_status === 'active') ||
        (planFilter === 'free' && (u.tier === 'free' || u.subscription_status === 'none'));
      return matchSearch && matchPlan;
    })
    .sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortField === 'email') return mul * a.email.localeCompare(b.email);
      if (sortField === 'plan') return mul * a.tier.localeCompare(b.tier);
      if (sortField === 'total_ai_30d') return mul * (a.total_ai_30d - b.total_ai_30d);
      if (sortField === 'last_sign_in') return mul * ((a.last_sign_in ?? '').localeCompare(b.last_sign_in ?? ''));
      if (sortField === 'created_at') return mul * ((a.created_at ?? '').localeCompare(b.created_at ?? ''));
      return 0;
    });

  const crmUsers = users.filter(u => {
    const matchSearch = !crmSearch || u.email.toLowerCase().includes(crmSearch.toLowerCase()) || u.username.toLowerCase().includes(crmSearch.toLowerCase());
    const isPaid = u.tier !== 'free' && u.subscription_status === 'active';
    const isInactive = !u.last_sign_in || Date.now() - new Date(u.last_sign_in).getTime() > 14 * 86400000;
    const matchFilter = crmFilter === 'all' ? true : crmFilter === 'paid' ? isPaid : crmFilter === 'free' ? !isPaid : crmFilter === 'inactive' ? isInactive : true;
    return matchSearch && matchFilter;
  });

  const exportCSV = () => {
    const headers = ['Email', 'Username', 'Plan', 'Status', 'Chat 30d', 'Images 30d', 'Videos 30d', 'Total AI 30d', 'Last Sign In', 'Created At'];
    const rows = filteredUsers.map(u => [u.email, u.username, u.tier, u.subscription_status, u.chat_30d, u.image_30d, u.video_30d, u.total_ai_30d, u.last_sign_in ?? '', u.created_at ?? ''].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `mockj-users-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredUsers.length} users`);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); } else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <SortAsc className="w-3 h-3 opacity-30" />;
    return sortDir === 'asc' ? <SortAsc className="w-3 h-3" style={{ color: 'hsl(191 97% 55%)' }} /> : <SortDesc className="w-3 h-3" style={{ color: 'hsl(191 97% 55%)' }} />;
  };

  if (authLoading || authorized === null) {
    return (
      <div className="min-h-screen bg-[hsl(224_20%_6%)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <RefreshCw className="w-8 h-8 animate-spin" />
          <p className="text-sm">Verifying admin access…</p>
        </div>
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="min-h-screen bg-[hsl(224_20%_6%)] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/30 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Access Restricted</h1>
          <p className="text-sm text-muted-foreground mb-6">This dashboard is only accessible to MockJ administrators.</p>
          <button onClick={() => navigate('/')} className="flex items-center gap-2 mx-auto px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-[hsl(191_97%_55%_/_0.4)] transition-all">
            <ArrowLeft className="w-4 h-4" /> Back to MockJ
          </button>
        </div>
      </div>
    );
  }

  const CHART_COLORS = { chat: 'hsl(191 97% 55%)', images: 'hsl(265 80% 65%)', videos: 'hsl(38 95% 60%)' };

  return (
    <div className="min-h-screen bg-[hsl(224_20%_6%)] text-foreground flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-[hsl(224_20%_7%)] border-b border-border px-6 py-3.5">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground border border-border hover:border-[hsl(191_97%_55%_/_0.4)] transition-all shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base font-bold text-foreground flex items-center gap-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                <BarChart2 className="w-4 h-4 text-[hsl(191_97%_55%)]" /> MockJ Admin Dashboard
              </h1>
              <p className="text-[10px] text-muted-foreground">Last updated {lastRefresh.toLocaleTimeString()} · Auto-refreshes every 30s</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground hover:border-[hsl(38_95%_60%_/_0.4)] transition-all">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button onClick={() => navigate('/qa')} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[hsl(142_70%_55%_/_0.4)] text-xs text-[hsl(142_70%_55%)] hover:bg-[hsl(142_70%_55%_/_0.08)] transition-all">
              QA Tests
            </button>
            <button onClick={refreshAll} disabled={refreshing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground hover:border-[hsl(191_97%_55%_/_0.4)] transition-all disabled:opacity-50">
              <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="border-b border-border bg-[hsl(224_20%_7%)] px-6">
        <div className="max-w-[1400px] mx-auto flex gap-1 overflow-x-auto">
          {([
            { id: 'overview', label: 'Overview',              icon: Activity },
            { id: 'users',    label: `Users (${totalUsers})`, icon: Users },
            { id: 'revenue',  label: 'Revenue',               icon: DollarSign },
            { id: 'usage',    label: 'AI Usage',              icon: Zap },
            { id: 'crm',      label: 'CRM',                   icon: User },
            { id: 'webhook',  label: 'Webhook Health',        icon: Activity },
          ] as { id: Tab; label: string; icon: React.ElementType }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all duration-150',
                activeTab === tab.id ? 'border-[hsl(191_97%_55%)] text-[hsl(191_97%_55%)]' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 max-w-[1400px] mx-auto w-full px-6 py-8 space-y-6">

        {/* ════ OVERVIEW ════ */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Total Users" value={fmt(totalUsers)} sub="All time" icon={Users} color="hsl(191 97% 55%)" />
              <KpiCard label="Paid Subscribers" value={fmt(paidUsers)} sub="Active & trialing" icon={Crown} color="hsl(38 95% 60%)" />
              <KpiCard label="Active Today" value={fmt(activeToday)} sub="Used AI today" icon={Activity} color="hsl(142 70% 55%)" />
              <KpiCard label="New This Week" value={fmt(newThisWeek)} sub="Signed up in 7d" icon={TrendingUp} color="hsl(265 80% 65%)" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="MRR" value={revenueData ? fmtUSD(revenueData.mrr) : '—'} sub="Monthly recurring" icon={DollarSign} color="hsl(38 95% 60%)" />
              <KpiCard label="ARR" value={revenueData ? fmtUSD(revenueData.arr) : '—'} sub="Annualized" icon={TrendingUp} color="hsl(142 70% 55%)" />
              <KpiCard label="Chat (7d)" value={usageData ? fmt(usageData.chat_7d) : '—'} sub="AI chat messages" icon={MessageSquare} color="hsl(191 97% 55%)" />
              <KpiCard label="Images (7d)" value={usageData ? fmt(usageData.image_7d) : '—'} sub="Generated images" icon={Image} color="hsl(265 80% 65%)" />
            </div>
            {usageData && (
              <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-xl bg-[hsl(191_97%_55%_/_0.12)] border border-[hsl(191_97%_55%_/_0.3)] flex items-center justify-center"><Zap className="w-4 h-4 text-[hsl(191_97%_55%)]" /></div>
                  <div><h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>AI Requests — Last 7 Days</h2><p className="text-[11px] text-muted-foreground">From user_daily_usage</p></div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={usageData.daily} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      {(['chat', 'images', 'videos'] as const).map(key => (
                        <linearGradient key={key} id={`dash-grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS[key]} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={CHART_COLORS[key]} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(224 15% 15%)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: 'hsl(215 20% 50%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'hsl(215 20% 50%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 16 }} />
                    <Area type="monotone" dataKey="chat" stroke={CHART_COLORS.chat} fill="url(#dash-grad-chat)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="images" stroke={CHART_COLORS.images} fill="url(#dash-grad-images)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="videos" stroke={CHART_COLORS.videos} fill="url(#dash-grad-videos)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            {revenueData && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-8 h-8 rounded-xl bg-[hsl(38_95%_60%_/_0.12)] border border-[hsl(38_95%_60%_/_0.3)] flex items-center justify-center"><DollarSign className="w-4 h-4 text-[hsl(38_95%_60%)]" /></div>
                    <h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Revenue by Plan</h2>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(revenueData.tier_breakdown).map(([tier, data]) => (
                      <div key={tier} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-3"><PlanBadge tier={tier} status="active" /><span className="text-xs text-muted-foreground">{data.count} sub{data.count !== 1 ? 's' : ''}</span></div>
                        <span className="text-sm font-bold" style={{ color: 'hsl(38 95% 60%)', fontFamily: 'Space Grotesk, sans-serif' }}>{fmtUSD(data.mrr)}/mo</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2"><span className="text-xs font-bold text-foreground">Total MRR</span><span className="text-lg font-black" style={{ color: 'hsl(38 95% 60%)', fontFamily: 'Space Grotesk, sans-serif' }}>{fmtUSD(revenueData.mrr)}</span></div>
                  </div>
                </div>
                <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-8 h-8 rounded-xl bg-[hsl(265_80%_65%_/_0.12)] border border-[hsl(265_80%_65%_/_0.3)] flex items-center justify-center"><CreditCard className="w-4 h-4 text-[hsl(265_80%_65%)]" /></div>
                    <h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Recent Stripe Events</h2>
                  </div>
                  {revenueData.recent_events.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">No webhook events recorded yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {revenueData.recent_events.map((ev, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-2 border-b border-border/40 last:border-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ev.type.includes('paid') || ev.type.includes('completed') ? 'hsl(142 70% 55%)' : ev.type.includes('deleted') || ev.type.includes('cancel') ? 'hsl(4 90% 58%)' : 'hsl(191 97% 55%)' }} />
                            <span className="text-muted-foreground truncate">{ev.type.replace('customer.', '').replace('_', ' ')}</span>
                          </div>
                          <span className="text-muted-foreground/60 shrink-0 ml-2">{fmtDateShort(ev.processed_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════ USERS ════ */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…" className="bg-[hsl(224_15%_9%)] border border-border rounded-xl pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[hsl(191_97%_55%_/_0.5)] w-56 transition-all" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                  {(['all', 'pro', 'sale', 'free'] as const).map(f => (
                    <button key={f} onClick={() => setPlanFilter(f)} className={cn('px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all', planFilter === f ? 'bg-[hsl(191_97%_55%_/_0.15)] border border-[hsl(191_97%_55%_/_0.4)] text-[hsl(191_97%_55%)]' : 'border border-border text-muted-foreground hover:text-foreground')}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{filteredUsers.length} of {totalUsers} users</span>
                <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:text-[hsl(38_95%_60%)] hover:border-[hsl(38_95%_60%_/_0.4)] transition-all"><Download className="w-3.5 h-3.5" /> CSV</button>
              </div>
            </div>
            <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-[hsl(224_20%_11%)]">
                      {[{ label: 'User', field: 'email' as SortField }, { label: 'Plan', field: 'plan' as SortField }, { label: 'Status', field: null }, { label: 'AI (30d)', field: 'total_ai_30d' as SortField }, { label: 'Last Seen', field: 'last_sign_in' as SortField }, { label: 'Joined', field: 'created_at' as SortField }, { label: '', field: null }].map((col, i) => (
                        <th key={i} onClick={() => col.field && handleSort(col.field)} className={cn('text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap', col.field && 'cursor-pointer hover:text-foreground transition-colors')}>
                          <div className="flex items-center gap-1.5">{col.label}{col.field && <SortIcon field={col.field} />}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loadingUsers ? (
                      <tr><td colSpan={7} className="text-center py-12 text-muted-foreground"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />Loading users…</td></tr>
                    ) : filteredUsers.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-12 text-muted-foreground text-xs">No users match the current filter.</td></tr>
                    ) : filteredUsers.map(u => (
                      <tr key={u.id} className="border-b border-border/40 last:border-0 hover:bg-[hsl(224_15%_12%)] transition-colors cursor-pointer group" onClick={() => setSelectedUser(u)}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0" style={{ background: u.tier !== 'free' ? `${TIER_COLORS[u.tier]?.replace(')', ' / 0.12)')}` : 'hsl(224 15% 14%)', border: `1px solid ${u.tier !== 'free' ? TIER_COLORS[u.tier]?.replace(')', ' / 0.3)') ?? '' : 'hsl(224 15% 20%)'}`, color: u.tier !== 'free' ? TIER_COLORS[u.tier] : 'hsl(215 16% 47%)', fontFamily: 'Space Grotesk, sans-serif' }}>
                              {(u.username || u.email)[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-foreground font-medium truncate max-w-[160px]">{u.email}</p>
                              {u.username && <p className="text-[10px] text-muted-foreground truncate">{u.username}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3"><PlanBadge tier={u.tier} status={u.subscription_status} /></td>
                        <td className="px-4 py-3"><StatusBadge status={u.subscription_status} /></td>
                        <td className="px-4 py-3"><div className="flex items-center gap-2"><span className="font-bold text-foreground">{fmt(u.total_ai_30d)}</span><div className="hidden lg:flex items-center gap-1 text-muted-foreground/60 text-[10px]"><span>{u.chat_30d}c</span><span>{u.image_30d}i</span><span>{u.video_30d}v</span></div></div></td>
                        <td className="px-4 py-3 text-muted-foreground">{fmtDateShort(u.last_sign_in)}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(u.created_at)}</td>
                        <td className="px-4 py-3"><button onClick={e => { e.stopPropagation(); setSelectedUser(u); }} className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] text-[hsl(191_97%_55%)] transition-opacity"><Eye className="w-3 h-3" /> View</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ════ REVENUE ════ */}
        {activeTab === 'revenue' && (
          <div className="space-y-6">
            {loadingRevenue && <div className="flex items-center gap-2 text-muted-foreground text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Loading revenue data…</div>}
            {revenueData && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KpiCard label="Monthly MRR" value={fmtUSD(revenueData.mrr)} sub="Current subscribers" icon={DollarSign} color="hsl(38 95% 60%)" />
                  <KpiCard label="Annual ARR" value={fmtUSD(revenueData.arr)} sub="Annualized run rate" icon={TrendingUp} color="hsl(142 70% 55%)" />
                  <KpiCard label="Paid Subscribers" value={fmt(revenueData.active_subscribers)} sub="Active & trialing" icon={Crown} color="hsl(265 80% 65%)" />
                  <KpiCard label="ARPU" value={revenueData.active_subscribers > 0 ? fmtUSD(revenueData.mrr / revenueData.active_subscribers) : '$0'} sub="Avg revenue per user" icon={Users} color="hsl(191 97% 55%)" />
                </div>
                <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-6">
                  <h2 className="text-sm font-bold text-foreground mb-5" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Revenue by Plan</h2>
                  {Object.keys(revenueData.tier_breakdown).length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">No paid subscribers yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(revenueData.tier_breakdown).map(([tier, data]) => {
                        const pct = revenueData.mrr > 0 ? (data.mrr / revenueData.mrr) * 100 : 0;
                        const color = TIER_COLORS[tier] ?? TIER_COLORS.free;
                        return (
                          <div key={tier}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3"><PlanBadge tier={tier} status="active" /><span className="text-xs text-muted-foreground">{data.count} sub{data.count !== 1 ? 's' : ''} × {fmtUSD(TIER_PRICE[tier] ?? 0)}/mo</span></div>
                              <div className="flex items-center gap-3"><span className="text-xs font-bold" style={{ color }}>{fmtUSD(data.mrr)}/mo</span><span className="text-[10px] text-muted-foreground">{pct.toFixed(1)}%</span></div>
                            </div>
                            <div className="h-2 bg-[hsl(224_15%_14%)] rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} /></div>
                          </div>
                        );
                      })}
                      <div className="flex items-center justify-between pt-3 border-t border-border"><span className="text-xs font-bold text-foreground">Total MRR</span><span className="text-xl font-black" style={{ color: 'hsl(38 95% 60%)', fontFamily: 'Space Grotesk, sans-serif' }}>{fmtUSD(revenueData.mrr)}<span className="text-xs text-muted-foreground">/mo</span></span></div>
                    </div>
                  )}
                </div>
                <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-5"><CreditCard className="w-4 h-4 text-[hsl(265_80%_65%)]" /><h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Payment Event Log</h2><span className="text-[10px] text-muted-foreground ml-auto">Last 20 events</span></div>
                  {revenueData.recent_events.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">No Stripe webhook events recorded.</p>
                  ) : (
                    <div className="space-y-2">
                      {revenueData.recent_events.map((ev, i) => {
                        const isPay = ev.type.includes('paid') || ev.type.includes('completed');
                        const isCancel = ev.type.includes('deleted') || ev.type.includes('cancel');
                        const color = isPay ? 'hsl(142 70% 55%)' : isCancel ? 'hsl(4 90% 58%)' : 'hsl(191 97% 55%)';
                        return (
                          <div key={i} className="flex items-center justify-between px-4 py-3 rounded-xl bg-[hsl(224_15%_12%)] border border-border/50">
                            <div className="flex items-center gap-3"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} /><code className="text-xs text-foreground/80">{ev.type}</code></div>
                            <div className="flex items-center gap-2"><Calendar className="w-3 h-3 text-muted-foreground" /><span className="text-[10px] text-muted-foreground">{fmtDateShort(ev.processed_at)}</span></div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ════ AI USAGE ════ */}
        {activeTab === 'usage' && (
          <div className="space-y-6">
            {loadingUsage && <div className="flex items-center gap-2 text-muted-foreground text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Loading usage data…</div>}
            {usageData && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <KpiCard label="Chat Messages (7d)" value={fmt(usageData.chat_7d)} sub={`${fmt(usageData.chat_30d)} in 30d`} icon={MessageSquare} color="hsl(191 97% 55%)" />
                  <KpiCard label="Images Generated (7d)" value={fmt(usageData.image_7d)} sub={`${fmt(usageData.image_30d)} in 30d`} icon={Image} color="hsl(265 80% 65%)" />
                  <KpiCard label="Videos Created (7d)" value={fmt(usageData.video_7d)} sub={`${fmt(usageData.video_30d)} in 30d`} icon={Video} color="hsl(38 95% 60%)" />
                </div>
                <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-6"><div className="w-8 h-8 rounded-xl bg-[hsl(191_97%_55%_/_0.12)] border border-[hsl(191_97%_55%_/_0.3)] flex items-center justify-center"><Zap className="w-4 h-4 text-[hsl(191_97%_55%)]" /></div><h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Daily AI Requests (7 Days)</h2></div>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={usageData.daily} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <defs>{(['chat', 'images', 'videos'] as const).map(key => (<linearGradient key={key} id={`usage-grad-${key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CHART_COLORS[key]} stopOpacity={0.35} /><stop offset="95%" stopColor={CHART_COLORS[key]} stopOpacity={0} /></linearGradient>))}</defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(224 15% 15%)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: 'hsl(215 20% 50%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'hsl(215 20% 50%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 16 }} />
                      <Area type="monotone" dataKey="chat" stroke={CHART_COLORS.chat} fill="url(#usage-grad-chat)" strokeWidth={2.5} dot={false} />
                      <Area type="monotone" dataKey="images" stroke={CHART_COLORS.images} fill="url(#usage-grad-images)" strokeWidth={2.5} dot={false} />
                      <Area type="monotone" dataKey="videos" stroke={CHART_COLORS.videos} fill="url(#usage-grad-videos)" strokeWidth={2.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        )}

        {/* ════ WEBHOOK HEALTH ════ */}
        {activeTab === 'webhook' && (
          <div className="space-y-6">
            {loadingWebhook && <div className="flex items-center gap-2 text-muted-foreground text-sm"><RefreshCw className="w-4 h-4 animate-spin" /> Loading webhook data…</div>}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Events (Last 24h)" value={webhookHealth ? String(webhookHealth.totalLast24h) : '—'} sub="All Stripe webhook calls" icon={Activity} color="hsl(191 97% 55%)" />
              <KpiCard label="Last Event" value={webhookHealth?.lastEvent ? fmtDateShort(webhookHealth.lastEvent.processed_at) : 'None'} sub={webhookHealth?.lastEvent?.type ?? 'No events recorded'} icon={Clock} color="hsl(265 80% 65%)" />
              <KpiCard label="Last Token Credit" value={webhookHealth?.lastTokenCredit ? `+${webhookHealth.lastTokenCredit.amount.toLocaleString()}` : 'None'} sub={webhookHealth?.lastTokenCredit ? fmtDateShort(webhookHealth.lastTokenCredit.created_at) : 'No purchase credits yet'} icon={Coins} color="hsl(38 95% 60%)" />
              <KpiCard label="Webhook Status" value={webhookHealth && webhookHealth.totalLast24h > 0 ? '✅ Active' : '⚠️ No Events'} sub="Based on last 24h" icon={CheckCircle2} color={webhookHealth && webhookHealth.totalLast24h > 0 ? 'hsl(142 70% 55%)' : 'hsl(38 95% 60%)'} />
            </div>

            {/* ── Stale webhook alert banner ─────────────────────────────── */}
            {webhookHealth && (() => {
              const lastEvt = webhookHealth.lastEvent;
              const isStale = !lastEvt || (Date.now() - new Date(lastEvt.processed_at).getTime()) > 60 * 60 * 1000;
              if (!isStale) return null;
              return (
                <div
                  className="flex items-start gap-4 rounded-2xl p-4"
                  style={{
                    background: 'hsl(38 95% 60% / 0.08)',
                    border: '1.5px solid hsl(38 95% 60% / 0.5)',
                    boxShadow: '0 0 24px hsl(38 95% 60% / 0.12)',
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: 'hsl(38 95% 60% / 0.15)', border: '1px solid hsl(38 95% 60% / 0.4)' }}
                  >
                    <AlertCircle className="w-5 h-5" style={{ color: 'hsl(38 95% 60%)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black" style={{ color: 'hsl(38 95% 72%)', fontFamily: 'Space Grotesk, sans-serif' }}>
                      ⚠️ No webhook events in the last hour
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'rgba(200,180,120,0.7)' }}>
                      {lastEvt
                        ? `Last event received ${fmtDateShort(lastEvt.processed_at)} (${lastEvt.type}) — payments may be failing silently.`
                        : 'No webhook events recorded at all — verify the Stripe endpoint is registered and the signing secret is correct.'}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <a
                        href="https://dashboard.stripe.com/webhooks"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                        style={{ background: 'hsl(38 95% 60% / 0.12)', border: '1px solid hsl(38 95% 60% / 0.4)', color: 'hsl(38 95% 65%)' }}
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open Stripe Webhooks
                      </a>
                      <button
                        onClick={fetchWebhookHealth}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                        style={{ background: 'rgba(100,120,200,0.08)', border: '1px solid rgba(100,120,200,0.25)', color: 'rgba(180,200,255,0.6)' }}
                      >
                        <RefreshCw className="w-3 h-3" />
                        Re-check now
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Event type breakdown */}
            <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-xl bg-[hsl(191_97%_55%_/_0.12)] border border-[hsl(191_97%_55%_/_0.3)] flex items-center justify-center"><BarChart2 className="w-4 h-4 text-[hsl(191_97%_55%)]" /></div>
                <div>
                  <h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Webhook Events by Type — Last 24 Hours</h2>
                  <p className="text-[11px] text-muted-foreground">From webhook_events table · auto-refreshes every 30s</p>
                </div>
                <button onClick={fetchWebhookHealth} disabled={loadingWebhook} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground transition-all disabled:opacity-40">
                  <RefreshCw className={cn('w-3.5 h-3.5', loadingWebhook && 'animate-spin')} /> Refresh
                </button>
              </div>
              {!webhookHealth || Object.keys(webhookHealth.last24hCounts).length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-8 h-8 text-[hsl(38_95%_60%)] mx-auto mb-3" />
                  <p className="text-sm font-bold text-foreground/60 mb-1">No webhook events in the last 24 hours</p>
                  <p className="text-xs text-muted-foreground">Trigger a test from Stripe Dashboard → Developers → Webhooks → Send test event.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(webhookHealth.last24hCounts).sort(([, a], [, b]) => b - a).map(([type, count]) => {
                    const isPay = type.includes('paid') || type.includes('completed');
                    const isCancel = type.includes('deleted') || type.includes('cancel') || type.includes('failed');
                    const color = isPay ? 'hsl(142 70% 55%)' : isCancel ? 'hsl(4 90% 58%)' : 'hsl(191 97% 55%)';
                    const pct = webhookHealth.totalLast24h > 0 ? (count / webhookHealth.totalLast24h) * 100 : 0;
                    return (
                      <div key={type}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} /><code className="text-xs text-foreground/80">{type}</code></div>
                          <div className="flex items-center gap-3"><span className="text-xs font-bold" style={{ color }}>{count}</span><span className="text-[10px] text-muted-foreground">{pct.toFixed(1)}%</span></div>
                        </div>
                        <div className="h-1.5 bg-[hsl(224_15%_14%)] rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} /></div>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <span className="text-xs font-bold text-foreground">Total Events</span>
                    <span className="text-xl font-black text-[hsl(191_97%_55%)]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{webhookHealth.totalLast24h}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Last token credit */}
            <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4"><Coins className="w-4 h-4 text-[hsl(38_95%_60%)]" /><h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Last Successful Token Credit</h2></div>
              {webhookHealth?.lastTokenCredit ? (
                <div className="rounded-xl px-4 py-3 space-y-2" style={{ background: 'hsl(142 70% 55% / 0.06)', border: '1px solid hsl(142 70% 55% / 0.25)' }}>
                  <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Amount credited</span><span className="text-sm font-black" style={{ color: 'hsl(142 70% 55%)' }}>+{webhookHealth.lastTokenCredit.amount.toLocaleString()} tokens</span></div>
                  <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Description</span><span className="text-xs text-foreground/70 text-right max-w-[260px] truncate">{webhookHealth.lastTokenCredit.description}</span></div>
                  <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Timestamp</span><span className="text-xs text-foreground/70">{new Date(webhookHealth.lastTokenCredit.created_at).toLocaleString()}</span></div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-6">No token purchase credits yet. Make a test purchase to verify the full webhook → token flow.</p>
              )}
            </div>

            {/* Diagnostic checklist */}
            <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-6">
              <h2 className="text-sm font-bold text-foreground mb-4" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Diagnostic Checklist</h2>
              <div className="space-y-3">
                {([
                  { label: 'Stripe webhook endpoint registered', desc: 'https://zdhketzyvyblkarezdhk.backend.onspace.ai/functions/v1/stripe-webhook', status: 'manual' },
                  { label: 'STRIPE_WEBHOOK_SECRET set in backend secrets', desc: 'Required for signature verification (whsec_…)', status: 'manual' },
                  { label: 'checkout.session.completed credits tokens', desc: 'Webhook resolves price → increments user_tokens → logs token_transactions', status: webhookHealth?.lastTokenCredit ? 'ok' : 'unknown' },
                  { label: 'Events received in last 24h', desc: `${webhookHealth?.totalLast24h ?? 0} events in webhook_events table`, status: webhookHealth && webhookHealth.totalLast24h > 0 ? 'ok' : 'warn' },
                ] as { label: string; desc: string; status: string }[]).map(item => (
                  <div key={item.label} className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: 'hsl(224 15% 12%)', border: '1px solid rgba(100,120,200,0.12)' }}>
                    <div className="mt-0.5 shrink-0">
                      {item.status === 'ok' && <CheckCircle2 className="w-4 h-4" style={{ color: 'hsl(142 70% 55%)' }} />}
                      {item.status === 'warn' && <AlertCircle className="w-4 h-4" style={{ color: 'hsl(38 95% 60%)' }} />}
                      {item.status === 'unknown' && <Clock className="w-4 h-4" style={{ color: 'hsl(191 97% 55%)' }} />}
                      {item.status === 'manual' && <Eye className="w-4 h-4" style={{ color: 'hsl(265 80% 65%)' }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 break-all">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════ CRM ════ */}
        {activeTab === 'crm' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Total Contacts" value={fmt(users.length)} sub="All registered users" icon={Users} color="hsl(191 97% 55%)" />
              <KpiCard label="Paying Customers" value={fmt(users.filter(u => u.tier !== 'free' && u.subscription_status === 'active').length)} sub="Active paid plans" icon={Crown} color="hsl(38 95% 60%)" />
              <KpiCard label="At Risk" value={fmt(users.filter(u => u.subscription_status === 'past_due').length)} sub="Past due payments" icon={AlertCircle} color="hsl(4 90% 58%)" />
              <KpiCard label="Inactive (14d+)" value={fmt(users.filter(u => !u.last_sign_in || Date.now() - new Date(u.last_sign_in).getTime() > 14 * 86400000).length)} sub="No login in 2 weeks" icon={Clock} color="hsl(265 80% 65%)" />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input type="text" value={crmSearch} onChange={e => setCrmSearch(e.target.value)} placeholder="Search contacts…" className="bg-[hsl(224_15%_9%)] border border-border rounded-xl pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[hsl(191_97%_55%_/_0.5)] w-56 transition-all" />
              </div>
              <div className="flex items-center gap-1.5">
                {(['all', 'paid', 'free', 'inactive'] as const).map(f => (
                  <button key={f} onClick={() => setCrmFilter(f)} className={cn('px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all', crmFilter === f ? 'bg-[hsl(191_97%_55%_/_0.15)] border border-[hsl(191_97%_55%_/_0.4)] text-[hsl(191_97%_55%)]' : 'border border-border text-muted-foreground hover:text-foreground')}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}{f === 'paid' && ` (${paidUsers})`}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground ml-auto">{crmUsers.length} contacts</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {crmUsers.slice(0, 60).map(u => {
                const isPaid = u.tier !== 'free' && (u.subscription_status === 'active' || u.subscription_status === 'trialing');
                const isInactive = !u.last_sign_in || Date.now() - new Date(u.last_sign_in).getTime() > 14 * 86400000;
                const tierColor = isPaid ? TIER_COLORS[u.tier] ?? TIER_COLORS.free : TIER_COLORS.free;
                return (
                  <div key={u.id} onClick={() => setSelectedUser(u)} className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-4 cursor-pointer hover:border-[hsl(191_97%_55%_/_0.35)] hover:bg-[hsl(224_15%_11%)] transition-all duration-200 group">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0" style={{ background: `${tierColor.replace(')', ' / 0.12)')}`, border: `1px solid ${tierColor.replace(')', ' / 0.3)')}`, color: tierColor, fontFamily: 'Space Grotesk, sans-serif' }}>
                          {(u.username || u.email)[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate max-w-[120px]">{u.username || 'No username'}</p>
                          <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{u.email}</p>
                        </div>
                      </div>
                      <PlanBadge tier={u.tier} status={u.subscription_status} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {[{ label: 'Chat', value: u.chat_30d, color: 'hsl(191 97% 55%)' }, { label: 'Img', value: u.image_30d, color: 'hsl(265 80% 65%)' }, { label: 'Vid', value: u.video_30d, color: 'hsl(38 95% 60%)' }].map(f => (
                        <div key={f.label} className="text-center p-1.5 rounded-lg bg-[hsl(224_15%_13%)]">
                          <p className="text-sm font-bold" style={{ color: f.color, fontFamily: 'Space Grotesk, sans-serif' }}>{fmt(f.value)}</p>
                          <p className="text-[9px] text-muted-foreground">{f.label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {isInactive && <span className="text-[9px] font-semibold text-[hsl(38_95%_60%)] bg-[hsl(38_95%_60%_/_0.1)] px-1.5 py-0.5 rounded-full">Inactive</span>}
                        {u.subscription_status === 'past_due' && <span className="text-[9px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">Past Due</span>}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{fmtDateShort(u.last_sign_in)}</span>
                    </div>
                  </div>
                );
              })}
              {crmUsers.length === 0 && <div className="col-span-full text-center py-12 text-muted-foreground text-xs">No contacts match the current filter.</div>}
            </div>
          </div>
        )}
      </div>

      {selectedUser && <UserDrawer user={selectedUser} onClose={() => setSelectedUser(null)} />}
    </div>
  );
}
