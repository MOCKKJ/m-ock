import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Users, MessageSquare, Image, Video, TrendingUp,
  RefreshCw, ShieldAlert, DollarSign, Activity,
  Zap, Eye, MousePointerClick, ArrowLeft,
  Mic, Volume2, Radio, MessageCircle, CheckCircle, XCircle, Loader2,
  Webhook, CreditCard, BadgeCheck, Package, AlertCircle,
  ChevronUp as SortAsc, ChevronDown as SortDown, Crown,
  Lock, LockOpen, Globe, ServerCrash, Copy, ClipboardCheck, Download,
  FlaskConical, UserCheck, ChevronDown,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// ─── Admin email list ─────────────────────────────────────────────────────────
const ADMIN_EMAILS = ['mltxpro@gmail.com', 'jenny@mltxpro.com', 'admin@mockj.online'];

// ─── Types ────────────────────────────────────────────────────────────────────
interface DailyStats {
  date: string; chats: number; images: number; videos: number;
  voice_input: number; tts: number; page_views: number; events: number;
}
interface TopEvent { event_name: string; count: number; }
interface TopPage { path: string; count: number; }
interface KpiCard { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string; }

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[hsl(224_20%_8%)] border border-border rounded-xl p-3 shadow-xl text-xs">
      <p className="text-muted-foreground mb-2 font-medium">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-foreground capitalize">{p.name}:</span>
          <span className="font-bold text-foreground">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export default function AdminAnalyticsPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [daily, setDaily] = useState<DailyStats[]>([]);
  const [topEvents, setTopEvents] = useState<TopEvent[]>([]);
  const [topPages, setTopPages] = useState<TopPage[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [dau, setDau] = useState(0);
  const [mau, setMau] = useState(0);
  const [totalSubs, setTotalSubs] = useState(0);
  const [lifetimeRevenue, setLifetimeRevenue] = useState(0);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // ── Monthly revenue chart ─────────────────────────────────────────────────
  interface MonthlyRevBar { month: string; revenue: number; label: string; }
  const [monthlyRevData, setMonthlyRevData] = useState<MonthlyRevBar[]>([]);

  // ── DAU Heatmap (28 days) ─────────────────────────────────────────────────
  interface HeatmapDay { date: string; label: string; count: number; dayOfWeek: number; }
  const [heatmapData, setHeatmapData] = useState<HeatmapDay[]>([]);

  // ── Token Economy ─────────────────────────────────────────────────────────
  interface TopSpender { user_id: string; balance: number; lifetime_earned: number; lifetime_spent: number; }
  interface SpendTypeRow { type: string; total: number; }
  interface TokenEconomyData {
    totalMinted: number; totalSpent: number;
    topSpenders: TopSpender[]; spendByType: SpendTypeRow[];
  }
  const [tokenEconomy, setTokenEconomy] = useState<TokenEconomyData | null>(null);

  // ── Purchase alert banner ─────────────────────────────────────────────────
  interface PurchaseAlert { email: string; packageName: string; amountPaid: number; tokensCredited: number; processedAt: string; }
  const [purchaseAlert, setPurchaseAlert] = useState<PurchaseAlert | null>(null);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── SSL status ────────────────────────────────────────────────────────────
  type SslStatus = 'idle' | 'checking' | 'valid' | 'expiring_soon' | 'expired' | 'unreachable' | 'unknown';
  interface SslInfo {
    status: SslStatus; daysLeft: number | null; expiryDate: string | null;
    grade: string | null; reachable: boolean | null; checkedAt: Date | null; error: string | null;
  }
  const [sslInfo, setSslInfo] = useState<SslInfo>({ status: 'idle', daysLeft: null, expiryDate: null, grade: null, reachable: null, checkedAt: null, error: null });

  const checkSSL = useCallback(async () => {
    setSslInfo(prev => ({ ...prev, status: 'checking', error: null }));
    let reachable = false;
    try { await fetch('https://mockj.online', { method: 'HEAD', mode: 'no-cors', cache: 'no-store' }); reachable = true; } catch { reachable = false; }
    if (!reachable) { setSslInfo({ status: 'unreachable', daysLeft: null, expiryDate: null, grade: null, reachable: false, checkedAt: new Date(), error: 'HTTPS request failed — domain unreachable or SSL error' }); return; }
    try {
      const res = await fetch('https://api.ssllabs.com/api/v3/analyze?host=mockj.online&fromCache=on&maxAge=24', { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`SSL Labs API ${res.status}`);
      const json = await res.json();
      type SslEndpoint = { details?: { cert?: { notAfter?: number } }; grade?: string };
      const endpoints: SslEndpoint[] = json.endpoints ?? [];
      let earliestExpiry: number | null = null; let grade: string | null = null;
      for (const ep of endpoints) {
        if (ep.grade && !grade) grade = ep.grade;
        const notAfterMs = ep.details?.cert?.notAfter;
        if (typeof notAfterMs === 'number') { if (earliestExpiry === null || notAfterMs < earliestExpiry) earliestExpiry = notAfterMs; }
      }
      if (earliestExpiry) {
        const expiryMs = earliestExpiry * 1000; const daysLeft = Math.floor((expiryMs - Date.now()) / 86_400_000);
        const expiryDate = new Date(expiryMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const status: SslStatus = daysLeft <= 0 ? 'expired' : daysLeft <= 30 ? 'expiring_soon' : 'valid';
        setSslInfo({ status, daysLeft, expiryDate, grade, reachable: true, checkedAt: new Date(), error: null });
      } else if (json.status === 'IN_PROGRESS' || json.status === 'DNS') {
        setSslInfo({ status: 'unknown', daysLeft: null, expiryDate: null, grade: null, reachable: true, checkedAt: new Date(), error: 'SSL Labs analysis in progress — try again in ~60 seconds' });
      } else {
        setSslInfo({ status: 'valid', daysLeft: null, expiryDate: null, grade: grade ?? null, reachable: true, checkedAt: new Date(), error: null });
      }
    } catch { setSslInfo({ status: 'valid', daysLeft: null, expiryDate: null, grade: null, reachable: true, checkedAt: new Date(), error: 'SSL cert details unavailable (SSL Labs API unreachable) — HTTPS is reachable' }); }
  }, []);

  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  // ── ElevenLabs health ─────────────────────────────────────────────────────
  interface ElevenLabsHealth { status: 'idle' | 'checking' | 'ok' | 'error'; httpStatus: number | null; responseTime: number | null; checkedAt: Date | null; errorDetail: string | null; }
  const [elHealth, setElHealth] = useState<ElevenLabsHealth>({ status: 'idle', httpStatus: null, responseTime: null, checkedAt: null, errorDetail: null });

  const runElevenLabsProbe = useCallback(async () => {
    setElHealth(prev => ({ ...prev, status: 'checking', errorDetail: null }));
    const t0 = performance.now();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const funcUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;
      const res = await fetch(funcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Authorization': `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}` }, body: JSON.stringify({ text: 'hey' }) });
      const elapsed = Math.round(performance.now() - t0);
      if (res.ok) { await res.arrayBuffer(); setElHealth({ status: 'ok', httpStatus: res.status, responseTime: elapsed, checkedAt: new Date(), errorDetail: null }); }
      else { const errText = await res.text().catch(() => `HTTP ${res.status}`); setElHealth({ status: 'error', httpStatus: res.status, responseTime: elapsed, checkedAt: new Date(), errorDetail: errText.slice(0, 300) }); }
    } catch (err) { const elapsed = Math.round(performance.now() - t0); setElHealth({ status: 'error', httpStatus: null, responseTime: elapsed, checkedAt: new Date(), errorDetail: err instanceof Error ? err.message : 'Network error' }); }
  }, []);

  // ── Subscriptions table ───────────────────────────────────────────────────
  interface SubscriptionRow { id: string; user_email: string | null; tier: string; price_id: string | null; status: string; current_period_end: string | null; stripe_customer_id: string; updated_at: string; }
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subSort, setSubSort] = useState<{ key: keyof SubscriptionRow; dir: 'asc' | 'desc' }>({ key: 'updated_at', dir: 'desc' });

  const fetchSubscriptions = useCallback(async () => {
    setSubsLoading(true);
    const { data } = await supabase.from('subscriptions').select('id, user_email, tier, price_id, status, current_period_end, stripe_customer_id, updated_at').order('updated_at', { ascending: false }).limit(50);
    setSubscriptions((data as SubscriptionRow[]) ?? []);
    setSubsLoading(false);
  }, []);

  useEffect(() => { if (authorized === true) fetchSubscriptions(); }, [authorized, fetchSubscriptions]);

  const sortedSubs = [...subscriptions].sort((a, b) => {
    const av = a[subSort.key] ?? ''; const bv = b[subSort.key] ?? '';
    const cmp = String(av).localeCompare(String(bv));
    return subSort.dir === 'asc' ? cmp : -cmp;
  });
  const handleSubSort = (key: keyof SubscriptionRow) => setSubSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });

  // ── Webhook events log ────────────────────────────────────────────────────
  interface WebhookEvent { id: string; event_id: string; type: string; user_id: string | null; stripe_customer_id: string | null; processed_at: string; payload: Record<string, unknown> | null; }
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookExpanded, setWebhookExpanded] = useState<string | null>(null);
  const [webhookLive, setWebhookLive] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);

  const fetchWebhookEvents = useCallback(async () => {
    setWebhookLoading(true);
    const { data } = await supabase.from('webhook_events').select('id, event_id, type, user_id, stripe_customer_id, processed_at, payload').order('processed_at', { ascending: false }).limit(20);
    setWebhookEvents((data as WebhookEvent[]) ?? []);
    setWebhookLoading(false);
  }, []);

  useEffect(() => { if (authorized === true) fetchWebhookEvents(); }, [authorized, fetchWebhookEvents]);

  // Purchase alert: watch for recent checkout events
  useEffect(() => {
    if (webhookEvents.length === 0) return;
    const latest = webhookEvents.find(e => e.type === 'checkout.session.completed');
    if (!latest) return;
    const age = (Date.now() - new Date(latest.processed_at).getTime()) / 1000;
    if (age > 3600) return;
    const p = latest.payload as Record<string, unknown> | null;
    const PACKAGE_NAMES: Record<string, string> = { starter: 'Starter Pack', creator: 'Creator Pack', pro_pack: 'Pro Pack', elite: 'Elite Pack', titan: 'Titan Pack' };
    const pkgId = String(p?.package_id ?? p?.plan ?? '');
    const alert: PurchaseAlert = {
      email: String(p?.customer_email ?? p?.user_email ?? 'Unknown'),
      packageName: PACKAGE_NAMES[pkgId] ?? pkgId ?? 'Subscription',
      amountPaid: typeof p?.amount_total === 'number' ? p.amount_total / 100 : typeof p?.amount === 'number' ? p.amount / 100 : 0,
      tokensCredited: typeof p?.tokens_credited === 'number' ? p.tokens_credited : 0,
      processedAt: latest.processed_at,
    };
    setAlertDismissed(false);
    setPurchaseAlert(alert);
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    alertTimerRef.current = setTimeout(() => setAlertDismissed(true), 60000);
  }, [webhookEvents]);

  // 10-second auto-refresh for webhook events
  useEffect(() => {
    if (authorized !== true) return;
    setWebhookLive(true);
    const id = setInterval(fetchWebhookEvents, 10_000);
    return () => { clearInterval(id); setWebhookLive(false); };
  }, [authorized, fetchWebhookEvents]);

  // ── Send Test Event ─────────────────────────────────────────────────────
  interface TestEventResult { success: boolean; eventId: string; tokensCredited: number; badgeAwarded: string | null; newBalance: number | null; packageLabel: string; }
  type TestEventState = 'idle' | 'loading' | 'success' | 'error';
  const [testEventState, setTestEventState] = useState<TestEventState>('idle');
  const [testEventResult, setTestEventResult] = useState<TestEventResult | null>(null);
  const [testEventError, setTestEventError] = useState<string | null>(null);
  const [testEventUserId, setTestEventUserId] = useState('');
  const [testEventPackage, setTestEventPackage] = useState('starter');
  const [showTestEventPanel, setShowTestEventPanel] = useState(false);

  const sendTestEvent = useCallback(async () => {
    if (!testEventUserId.trim()) { toast.error('Enter a user ID to send the test event to.'); return; }
    setTestEventState('loading');
    setTestEventResult(null);
    setTestEventError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const funcUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-test-event`;
      const res = await fetch(funcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Authorization': `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ userId: testEventUserId.trim(), packageId: testEventPackage }),
      });
      const json = await res.json();
      if (!res.ok) { setTestEventState('error'); setTestEventError(json.error ?? `HTTP ${res.status}`); return; }
      setTestEventState('success');
      setTestEventResult(json as TestEventResult);
      toast.success(`✅ Test event fired — ${json.tokensCredited?.toLocaleString()} tokens credited!`);
      setTimeout(() => { fetchWebhookEvents(); fetchData(); }, 800);
    } catch (err) { setTestEventState('error'); setTestEventError(err instanceof Error ? err.message : 'Network error'); }
  }, [testEventUserId, testEventPackage, fetchWebhookEvents, fetchData]);

  // ── Export Revenue CSV ────────────────────────────────────────────────────
  const exportRevenueCsv = useCallback(async () => {
    const { data } = await supabase.from('webhook_events').select('processed_at, payload').eq('type', 'checkout.session.completed').order('processed_at', { ascending: false }).limit(500);
    if (!data || data.length === 0) { toast.info('No checkout events to export yet.'); return; }
    const PACKAGE_NAMES: Record<string, string> = { starter: 'Starter Pack (500 tkn)', creator: 'Creator Pack (1,500 tkn)', pro_pack: 'Pro Pack (5,000 tkn)', elite: 'Elite Pack (12,000 tkn)', titan: 'Titan Pack (30,000 tkn)' };
    const rows = ['date,user_email,package_id,tokens_credited,amount_paid_usd'];
    for (const ev of data) {
      const p = ev.payload as Record<string, unknown> | null;
      const date = ev.processed_at.slice(0, 10);
      const email = String(p?.customer_email ?? p?.user_email ?? '');
      const pkgId = String(p?.package_id ?? p?.plan ?? '');
      const pkgName = PACKAGE_NAMES[pkgId] ?? pkgId;
      const tokens = p?.tokens_credited ?? '';
      const amount = typeof p?.amount_total === 'number' ? (p.amount_total / 100).toFixed(2) : typeof p?.amount_paid === 'number' ? (p.amount_paid / 100).toFixed(2) : '';
      rows.push(`"${date}","${email}","${pkgName}","${tokens}","${amount}"`);
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `mockj-revenue-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ElevenLabs playback test
  const [ttsTestState, setTtsTestState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [ttsTestError, setTtsTestError] = useState<string | null>(null);

  const handleVoiceTest = async () => {
    setTtsTestState('loading'); setTtsTestError(null);
    if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current = null; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const funcUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;
      const res = await fetch(funcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Authorization': `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}` }, body: JSON.stringify({ text: "Hey! It's Mock. Voice is online and ElevenLabs is working perfectly. Let's get it." }) });
      if (!res.ok) { const errText = await res.text(); throw new Error(`[${res.status}] ${errText.slice(0, 200)}`); }
      const arrayBuffer = await res.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url); ttsAudioRef.current = audio; audio.onended = () => URL.revokeObjectURL(url); await audio.play();
      setTtsTestState('success'); setTimeout(() => setTtsTestState('idle'), 5000);
    } catch (err) { setTtsTestError(err instanceof Error ? err.message : 'Unknown error'); setTtsTestState('error'); }
  };

  const [totalWakewords, setTotalWakewords] = useState(0);
  const [totalTTSPlays, setTotalTTSPlays] = useState(0);
  const [totalVoiceInputs, setTotalVoiceInputs] = useState(0);
  const [totalAutoSpeak, setTotalAutoSpeak] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setAuthorized(false); return; }
    setAuthorized(ADMIN_EMAILS.includes(user.email));
  }, [user, authLoading]);

  useEffect(() => { if (authorized === true) checkSSL(); }, [authorized, checkSSL]);
  useEffect(() => { if (authorized === true) runElevenLabsProbe(); }, [authorized, runElevenLabsProbe]);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const today = new Date();
      const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const oneMonthAgo = new Date(today); oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const isoToday = today.toISOString().slice(0, 10);
      const iso30 = thirtyDaysAgo.toISOString();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

      const [usageRows, voiceUsageRows, pvRows, evRows, topEvData, topPvData, profileCount, dauData, mauData, subCount, revenueRows] = await Promise.all([
        supabase.from('user_daily_usage').select('date, chat_count, image_count, video_count').gte('date', sevenDaysAgo.toISOString().slice(0, 10)).order('date', { ascending: true }),
        supabase.from('feature_usage').select('feature, date, count').in('feature', ['voice_input', 'tts']).gte('date', sevenDaysAgo.toISOString().slice(0, 10)).order('date', { ascending: true }),
        supabase.from('page_views').select('created_at').gte('created_at', sevenDaysAgo.toISOString()),
        supabase.from('user_events').select('created_at').gte('created_at', sevenDaysAgo.toISOString()),
        supabase.from('user_events').select('event_name').gte('created_at', iso30),
        supabase.from('page_views').select('path').gte('created_at', iso30),
        supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
        supabase.from('user_daily_usage').select('user_id').eq('date', isoToday),
        supabase.from('user_daily_usage').select('user_id').gte('date', oneMonthAgo.toISOString().slice(0, 10)),
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }).in('status', ['active', 'trialing']),
        supabase.from('webhook_events').select('payload, processed_at').eq('type', 'checkout.session.completed'),
      ]);

      // Revenue
      let lifetimeCents = 0; let monthCents = 0;
      (revenueRows.data ?? []).forEach(r => {
        const cents = (r.payload as Record<string, unknown>)?.amount_total;
        if (typeof cents === 'number') { lifetimeCents += cents; if (r.processed_at >= startOfMonth) monthCents += cents; }
      });
      setLifetimeRevenue(lifetimeCents / 100);
      setMonthRevenue(monthCents / 100);

      // Monthly revenue buckets (last 6 months)
      const monthBuckets: Record<string, number> = {}; const monthLabels: Record<string, string> = {};
      for (let mi = 5; mi >= 0; mi--) {
        const d = new Date(today.getFullYear(), today.getMonth() - mi, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthBuckets[key] = 0; monthLabels[key] = d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
      }
      (revenueRows.data ?? []).forEach(r => {
        const key = r.processed_at.slice(0, 7);
        if (key in monthBuckets) { const cents = (r.payload as Record<string, unknown>)?.amount_total; if (typeof cents === 'number') monthBuckets[key] += cents; }
      });
      setMonthlyRevData(Object.entries(monthBuckets).map(([key, cents]) => ({ month: key, label: monthLabels[key], revenue: parseFloat((cents / 100).toFixed(2)) })));

      // DAU Heatmap (last 28 days)
      const heatStart = new Date(today); heatStart.setDate(heatStart.getDate() - 27);
      const { data: heatRows } = await supabase.from('user_daily_usage').select('date, user_id').gte('date', heatStart.toISOString().slice(0, 10));
      const heatMap: Record<string, Set<string>> = {};
      (heatRows ?? []).forEach(r => { if (!heatMap[r.date]) heatMap[r.date] = new Set(); heatMap[r.date].add(r.user_id); });
      const heatDays: HeatmapDay[] = [];
      for (let i = 27; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        heatDays.push({ date: key, label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), count: heatMap[key]?.size ?? 0, dayOfWeek: d.getDay() });
      }
      setHeatmapData(heatDays);

      // Token economy
      const [mintedRes, spentRes, topSpendersRes, spendTypeRes, voiceKpiRows] = await Promise.all([
        supabase.from('token_transactions').select('amount').gt('amount', 0),
        supabase.from('token_transactions').select('amount').lt('amount', 0),
        supabase.from('user_tokens').select('user_id, balance, lifetime_earned, lifetime_spent').order('lifetime_spent', { ascending: false }).limit(8),
        supabase.from('token_transactions').select('type, amount').lt('amount', 0).like('type', 'spend_%'),
        supabase.from('feature_usage').select('feature, count').in('feature', ['voice_input', 'tts', 'wakeword', 'auto_speak']),
      ]);
      const totalMinted = (mintedRes.data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
      const totalSpent  = (spentRes.data ?? []).reduce((s, r) => s + Math.abs(r.amount ?? 0), 0);
      const spendTypeMap: Record<string, number> = {};
      (spendTypeRes.data ?? []).forEach(r => { const t = r.type.replace('spend_', ''); spendTypeMap[t] = (spendTypeMap[t] ?? 0) + Math.abs(r.amount ?? 0); });
      const spendByType: SpendTypeRow[] = Object.entries(spendTypeMap).map(([type, total]) => ({ type, total })).sort((a, b) => b.total - a.total);
      setTokenEconomy({ totalMinted, totalSpent, topSpenders: (topSpendersRes.data ?? []) as TopSpender[], spendByType });

      // Daily stats map
      const dateMap: Record<string, DailyStats> = {};
      for (let i = 6; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); const key = d.toISOString().slice(0, 10); dateMap[key] = { date: key.slice(5), chats: 0, images: 0, videos: 0, voice_input: 0, tts: 0, page_views: 0, events: 0 }; }
      (usageRows.data ?? []).forEach(r => { if (dateMap[r.date]) { dateMap[r.date].chats += r.chat_count ?? 0; dateMap[r.date].images += r.image_count ?? 0; dateMap[r.date].videos += r.video_count ?? 0; } });
      (voiceUsageRows.data ?? []).forEach(r => { if (dateMap[r.date]) { if (r.feature === 'voice_input') dateMap[r.date].voice_input += r.count ?? 0; if (r.feature === 'tts') dateMap[r.date].tts += r.count ?? 0; } });
      (pvRows.data ?? []).forEach(r => { const key = r.created_at.slice(0, 10); if (dateMap[key]) dateMap[key].page_views += 1; });
      (evRows.data ?? []).forEach(r => { const key = r.created_at.slice(0, 10); if (dateMap[key]) dateMap[key].events += 1; });
      setDaily(Object.values(dateMap));

      const evCount: Record<string, number> = {};
      (topEvData.data ?? []).forEach(r => { evCount[r.event_name] = (evCount[r.event_name] ?? 0) + 1; });
      setTopEvents(Object.entries(evCount).map(([event_name, count]) => ({ event_name, count })).sort((a, b) => b.count - a.count).slice(0, 10));

      const pvCount: Record<string, number> = {};
      (topPvData.data ?? []).forEach(r => { pvCount[r.path] = (pvCount[r.path] ?? 0) + 1; });
      setTopPages(Object.entries(pvCount).map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count).slice(0, 10));

      setTotalUsers(profileCount.count ?? 0);
      setDau(new Set((dauData.data ?? []).map(r => r.user_id)).size);
      setMau(new Set((mauData.data ?? []).map(r => r.user_id)).size);
      setTotalSubs(subCount.count ?? 0);

      const voiceKpiMap: Record<string, number> = {};
      (voiceKpiRows.data ?? []).forEach(r => { voiceKpiMap[r.feature] = (voiceKpiMap[r.feature] ?? 0) + (r.count ?? 0); });
      setTotalWakewords(voiceKpiMap['wakeword'] ?? 0);
      setTotalTTSPlays(voiceKpiMap['tts'] ?? 0);
      setTotalVoiceInputs(voiceKpiMap['voice_input'] ?? 0);
      setTotalAutoSpeak(voiceKpiMap['auto_speak'] ?? 0);

      setLastRefresh(new Date());
      fetchSubscriptions();
      fetchWebhookEvents();
    } catch (err) { console.error('[AdminAnalytics] fetch error', err); }
    finally { setRefreshing(false); }
  }, [fetchWebhookEvents, fetchSubscriptions]);

  useEffect(() => { if (authorized === true) fetchData(); }, [authorized, fetchData]);
  useEffect(() => { if (authorized !== true) return; const id = setInterval(fetchData, 30_000); return () => clearInterval(id); }, [authorized, fetchData]);

  if (authLoading || authorized === null) return <div className="min-h-screen bg-[hsl(224_20%_6%)] flex items-center justify-center"><div className="flex flex-col items-center gap-3 text-muted-foreground"><RefreshCw className="w-8 h-8 animate-spin" /><p className="text-sm">Verifying access…</p></div></div>;
  if (authorized === false) return (
    <div className="min-h-screen bg-[hsl(224_20%_6%)] flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/30 flex items-center justify-center mx-auto mb-4"><ShieldAlert className="w-8 h-8 text-destructive" /></div>
        <h1 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Access Restricted</h1>
        <p className="text-sm text-muted-foreground mb-6">This dashboard is only accessible to MockJ administrators.</p>
        <button onClick={() => navigate('/')} className="flex items-center gap-2 mx-auto px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-[hsl(191_97%_55%_/_0.4)] transition-all"><ArrowLeft className="w-4 h-4" />Back to MockJ</button>
      </div>
    </div>
  );

  const totalAI = daily.reduce((s, d) => s + d.chats + d.images + d.videos, 0);
  const totalPV = daily.reduce((s, d) => s + d.page_views, 0);
  const kpis: KpiCard[] = [
    { label: 'Total Users', value: totalUsers.toLocaleString(), sub: 'All time', icon: Users, color: 'hsl(191 97% 55%)' },
    { label: 'DAU', value: dau.toLocaleString(), sub: 'Active today', icon: Activity, color: 'hsl(142 70% 50%)' },
    { label: 'MAU', value: mau.toLocaleString(), sub: 'Last 30 days', icon: TrendingUp, color: 'hsl(265 80% 65%)' },
    { label: 'Pro Subscribers', value: totalSubs.toLocaleString(), sub: 'Active / Trialing', icon: DollarSign, color: 'hsl(38 95% 60%)' },
    { label: 'AI Requests (7d)', value: totalAI.toLocaleString(), sub: 'Chat + Image + Video', icon: Zap, color: 'hsl(191 97% 55%)' },
    { label: 'Page Views (7d)', value: totalPV.toLocaleString(), sub: 'Across all pages', icon: Eye, color: 'hsl(328 80% 65%)' },
  ];
  const CHART_COLORS = { chats: 'hsl(191 97% 55%)', images: 'hsl(265 80% 65%)', videos: 'hsl(38 95% 60%)', voice_input: 'hsl(4 90% 58%)', tts: 'hsl(48 95% 55%)', page_views: 'hsl(142 70% 50%)', events: 'hsl(328 80% 65%)' };
  const voice7dTotal = daily.reduce((s, d) => s + d.voice_input + d.tts, 0);
  const voice7dVoiceInput = daily.reduce((s, d) => s + d.voice_input, 0);
  const voice7dTTS = daily.reduce((s, d) => s + d.tts, 0);
  const voice7dAvgPerDay = daily.length > 0 ? (voice7dTotal / daily.length).toFixed(1) : '0';
  const ttsVoiceRatio = voice7dVoiceInput > 0 ? (voice7dTTS / voice7dVoiceInput).toFixed(1) + '×' : 'N/A';
  const allAI7d = daily.reduce((s, d) => s + d.chats + d.images + d.videos + d.voice_input + d.tts, 0);
  const voiceSharePct = allAI7d > 0 ? Math.round((voice7dTotal / allAI7d) * 100) + '%' : '0%';
  const maxVoiceDay = Math.max(...daily.map(d => d.voice_input + d.tts), 1);

  const elIsOk = elHealth.status === 'ok'; const elIsError = elHealth.status === 'error'; const elIsChecking = elHealth.status === 'checking';
  const elAccentColor = elIsOk ? 'hsl(142 70% 55%)' : elIsError ? 'hsl(0 72% 58%)' : elIsChecking ? 'hsl(191 97% 55%)' : 'hsl(210 20% 50%)';
  const elStatusLabel = elIsOk ? 'ElevenLabs Healthy' : elIsError ? 'ElevenLabs Unavailable' : elIsChecking ? 'Probing API…' : 'Not Checked';
  const httpBadgeColor = (code: number | null) => { if (!code) return 'hsl(210 20% 50%)'; if (code >= 200 && code < 300) return 'hsl(142 70% 55%)'; if (code === 401 || code === 403) return 'hsl(0 72% 58%)'; if (code === 402) return 'hsl(38 95% 60%)'; if (code >= 400) return 'hsl(0 72% 58%)'; return 'hsl(328 80% 65%)'; };

  return (
    <div className="min-h-screen bg-[hsl(224_20%_6%)] text-foreground">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[hsl(224_20%_7%)] border-b border-border px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground border border-border hover:border-[hsl(191_97%_55%_/_0.4)] transition-all"><ArrowLeft className="w-4 h-4" /></button>
            <div>
              <h1 className="text-base font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>MockJ Analytics</h1>
              <p className="text-[11px] text-muted-foreground">Admin Dashboard · Last updated {lastRefresh.toLocaleTimeString()}</p>
            </div>
          </div>
          <button onClick={() => navigate('/admin/dashboard')} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[hsl(191_97%_55%_/_0.4)] text-xs text-[hsl(191_97%_55%)] hover:bg-[hsl(191_97%_55%_/_0.08)] transition-all">Full Dashboard →</button>
          <button onClick={fetchData} disabled={refreshing} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground hover:border-[hsl(191_97%_55%_/_0.4)] transition-all disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* ── Webhook Health Banner ─────────────────────────────────────────── */}
        {(() => {
          const ENDPOINT = 'https://zdhketzyvyblkarezdhk.backend.onspace.ai/functions/v1/stripe-webhook';
          const lastEvent = webhookEvents[0];
          const hoursAgo = lastEvent ? (Date.now() - new Date(lastEvent.processed_at).getTime()) / 3_600_000 : null;
          type HealthLevel = 'healthy' | 'warning' | 'critical' | 'unknown';
          const level: HealthLevel = hoursAgo === null ? 'unknown' : hoursAgo < 24 ? 'healthy' : hoursAgo < 72 ? 'warning' : 'critical';
          const levelMap: Record<HealthLevel, { color: string; bg: string; border: string; dot: string; label: string; sub: string }> = {
            healthy: { color: 'hsl(142 70% 60%)', bg: 'hsl(142 70% 50% / 0.05)', border: 'hsl(142 70% 50% / 0.22)', dot: 'bg-[hsl(142_70%_55%)]', label: 'Webhook Active', sub: hoursAgo !== null ? `Last event ${hoursAgo < 1 ? `${Math.round(hoursAgo * 60)}m` : `${hoursAgo.toFixed(1)}h`} ago` : '' },
            warning: { color: 'hsl(38 95% 62%)', bg: 'hsl(38 95% 60% / 0.05)', border: 'hsl(38 95% 60% / 0.25)', dot: 'bg-[hsl(38_95%_62%)]', label: 'No Events in 24 h', sub: hoursAgo !== null ? `Last event ${hoursAgo.toFixed(0)}h ago — verify Stripe webhook is firing` : '' },
            critical: { color: 'hsl(0 72% 62%)', bg: 'hsl(0 72% 55% / 0.05)', border: 'hsl(0 72% 55% / 0.25)', dot: 'bg-[hsl(0_72%_62%)]', label: 'Webhook Silent > 72 h', sub: hoursAgo !== null ? `Last event ${(hoursAgo / 24).toFixed(1)} days ago — check Stripe Dashboard immediately` : '' },
            unknown: { color: 'hsl(210 20% 55%)', bg: 'hsl(224 15% 10% / 0.6)', border: 'hsl(215 15% 22% / 0.5)', dot: 'bg-[hsl(210_20%_45%)]', label: 'No Webhook Events Yet', sub: 'Events will appear here after the first live Stripe payment' },
          };
          const h = levelMap[level];
          return (
            <div className="rounded-2xl border px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4" style={{ background: h.bg, borderColor: h.border }}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="relative flex h-3 w-3 shrink-0">
                  {level === 'healthy' && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-50 ${h.dot}`} />}
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${h.dot}`} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold leading-none" style={{ fontFamily: 'Space Grotesk, sans-serif', color: h.color }}>{h.label}</p>
                    {lastEvent && <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase" style={{ background: h.color.replace(')', ' / 0.12)'), border: `1px solid ${h.color.replace(')', ' / 0.3)')}`, color: h.color }}>{lastEvent.type}</span>}
                  </div>
                  {h.sub && <p className="text-[11px] text-muted-foreground mt-0.5">{h.sub}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border px-3 py-2 min-w-0 max-w-full sm:max-w-sm" style={{ background: 'hsl(224 15% 7% / 0.7)', borderColor: 'hsl(215 15% 18% / 0.6)' }}>
                <Webhook className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
                <p className="text-[10px] font-mono text-muted-foreground truncate flex-1" title={ENDPOINT}>{ENDPOINT}</p>
                <button onClick={() => { navigator.clipboard.writeText(ENDPOINT).then(() => { setCopiedEndpoint(true); setTimeout(() => setCopiedEndpoint(false), 2200); }); }} className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:bg-white/[0.07]" style={{ color: copiedEndpoint ? 'hsl(142 70% 55%)' : 'hsl(210 20% 50%)' }}>
                  {copiedEndpoint ? <ClipboardCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          );
        })()}

        {/* ── Purchase Alert Banner ─────────────────────────────────────────── */}
        {purchaseAlert && !alertDismissed && (() => {
          const age = (Date.now() - new Date(purchaseAlert.processedAt).getTime()) / 1000;
          const timeLabel = age < 60 ? 'just now' : `${Math.round(age / 60)}m ago`;
          return (
            <div className="rounded-2xl border px-5 py-4 flex items-center gap-4 relative overflow-hidden" style={{ background: 'hsl(142 70% 50% / 0.06)', borderColor: 'hsl(142 70% 50% / 0.35)', boxShadow: '0 0 40px hsl(142 70% 50% / 0.1)' }}>
              <div className="absolute inset-0 opacity-[0.03]" style={{ background: 'radial-gradient(ellipse at left, hsl(142 70% 55%), transparent 60%)' }} />
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(142_70%_55%)] opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[hsl(142_70%_55%)]" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif', color: 'hsl(142 70% 60%)' }}>💳 New Purchase</span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase" style={{ background: 'hsl(142 70% 50% / 0.12)', border: '1px solid hsl(142 70% 50% / 0.3)', color: 'hsl(142 70% 60%)' }}>{timeLabel}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  <strong className="text-foreground/90">{purchaseAlert.email}</strong>
                  {purchaseAlert.packageName && <> · {purchaseAlert.packageName}</>}
                  {purchaseAlert.amountPaid > 0 && <> · <strong className="text-[hsl(142_70%_55%)]">${purchaseAlert.amountPaid.toFixed(2)}</strong></>}
                  {purchaseAlert.tokensCredited > 0 && <> · <strong className="text-[hsl(191_97%_55%)]">{purchaseAlert.tokensCredited.toLocaleString()} tokens credited</strong></>}
                </p>
              </div>
              <button onClick={() => setAlertDismissed(true)} className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground border border-border hover:border-[hsl(142_70%_55%_/_0.4)] transition-all text-xs">✕</button>
            </div>
          );
        })()}

        {/* ── Revenue KPI Banner ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative rounded-2xl border p-5 flex items-center gap-5 overflow-hidden" style={{ background: 'hsl(142 70% 50% / 0.05)', borderColor: 'hsl(142 70% 50% / 0.25)', boxShadow: '0 0 40px hsl(142 70% 50% / 0.07)' }}>
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: 'hsl(142 70% 50%)' }} />
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'hsl(142 70% 50% / 0.12)', border: '1px solid hsl(142 70% 50% / 0.35)' }}><DollarSign className="w-6 h-6" style={{ color: 'hsl(142 70% 55%)' }} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">Lifetime Revenue</p>
              <p className="text-3xl font-black leading-none" style={{ fontFamily: 'Space Grotesk, sans-serif', color: 'hsl(142 70% 60%)' }}>${lifetimeRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-[10px] text-muted-foreground mt-1">All completed Stripe checkouts · sum of amount_total</p>
            </div>
          </div>
          <div className="relative rounded-2xl border p-5 flex items-center gap-5 overflow-hidden" style={{ background: 'hsl(38 95% 60% / 0.05)', borderColor: 'hsl(38 95% 60% / 0.25)', boxShadow: '0 0 40px hsl(38 95% 60% / 0.07)' }}>
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: 'hsl(38 95% 60%)' }} />
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'hsl(38 95% 60% / 0.12)', border: '1px solid hsl(38 95% 60% / 0.35)' }}><TrendingUp className="w-6 h-6" style={{ color: 'hsl(38 95% 65%)' }} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">{new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })} Revenue</p>
              <p className="text-3xl font-black leading-none" style={{ fontFamily: 'Space Grotesk, sans-serif', color: 'hsl(38 95% 65%)' }}>${monthRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Month-to-date from checkout webhooks</p>
            </div>
          </div>
        </div>

        {/* ── Monthly Revenue Chart ─────────────────────────────────────────── */}
        {monthlyRevData.length > 0 && (
          <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-xl bg-[hsl(142_70%_50%_/_0.12)] border border-[hsl(142_70%_50%_/_0.3)] flex items-center justify-center"><TrendingUp className="w-4 h-4 text-[hsl(142_70%_50%)]" /></div>
              <div><h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Monthly Revenue — Last 6 Months</h2><p className="text-[11px] text-muted-foreground">Sum of amount_total from checkout.session.completed webhook events</p></div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyRevData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <defs><linearGradient id="grad-rev-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(142 70% 55%)" stopOpacity={1} /><stop offset="100%" stopColor="hsl(142 70% 40%)" stopOpacity={0.7} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(224 15% 15%)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'hsl(215 20% 50%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'hsl(215 20% 50%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v}`} />
                <Tooltip content={({ active, payload, label }) => { if (!active || !payload?.length) return null; return <div className="bg-[hsl(224_20%_8%)] border border-border rounded-xl p-3 shadow-xl text-xs"><p className="text-muted-foreground mb-1 font-medium">{label}</p><p className="font-bold" style={{ color: 'hsl(142 70% 60%)' }}>${(payload[0].value as number).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>; }} />
                <Bar dataKey="revenue" fill="url(#grad-rev-bar)" radius={[6, 6, 0, 0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── DAU Heatmap ───────────────────────────────────────────────────── */}
        {heatmapData.length > 0 && (() => {
          const maxCount = Math.max(...heatmapData.map(d => d.count), 1);
          const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const firstDow = heatmapData[0].dayOfWeek;
          const padded: (HeatmapDay | null)[] = [...Array(firstDow).fill(null), ...heatmapData];
          while (padded.length % 7 !== 0) padded.push(null);
          const weeks: (HeatmapDay | null)[][] = [];
          for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));
          const cellColor = (count: number) => {
            if (count === 0) return 'hsl(224 15% 13%)';
            const pct = count / maxCount;
            if (pct < 0.2) return 'hsl(191 97% 55% / 0.15)';
            if (pct < 0.4) return 'hsl(191 97% 55% / 0.3)';
            if (pct < 0.6) return 'hsl(191 97% 55% / 0.5)';
            if (pct < 0.8) return 'hsl(191 97% 55% / 0.75)';
            return 'hsl(191 97% 55%)';
          };
          return (
            <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[hsl(191_97%_55%_/_0.12)] border border-[hsl(191_97%_55%_/_0.3)] flex items-center justify-center"><Users className="w-4 h-4 text-[hsl(191_97%_55%)]" /></div>
                  <div><h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Daily Active Users — Last 28 Days</h2><p className="text-[11px] text-muted-foreground">Unique users with at least one AI action per day</p></div>
                </div>
                <div className="hidden sm:flex items-center gap-1.5">
                  {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => <div key={i} className="w-4 h-4 rounded-sm" style={{ background: pct === 0 ? 'hsl(224 15% 13%)' : `hsl(191 97% 55% / ${pct * 0.9 + 0.1})` }} />)}
                  <span className="text-[9px] text-muted-foreground ml-1">Less → More</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <div className="grid grid-cols-7 gap-1.5 mb-1 min-w-[320px]">
                  {DAY_LABELS.map(d => <div key={d} className="text-center text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-widest">{d}</div>)}
                </div>
                <div className="space-y-1.5 min-w-[320px]">
                  {weeks.map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7 gap-1.5">
                      {week.map((day, di) => (
                        <div key={di} title={day ? `${day.label}: ${day.count} active users` : undefined} className="aspect-square rounded-md transition-all duration-200 cursor-default" style={{ background: day ? cellColor(day.count) : 'transparent', border: day ? `1px solid ${day.count > 0 ? 'hsl(191 97% 55% / 0.2)' : 'hsl(224 15% 18%)'}` : 'none' }} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Token Economy ─────────────────────────────────────────────────── */}
        {tokenEconomy && (
          <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[hsl(191_97%_55%_/_0.12)] border border-[hsl(191_97%_55%_/_0.3)] flex items-center justify-center"><Zap className="w-4 h-4 text-[hsl(191_97%_55%)]" /></div>
                <div><h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Token Economy</h2><p className="text-[11px] text-muted-foreground">Lifetime minted vs. spent · top spenders · spend breakdown by feature</p></div>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Total Tokens Minted', value: tokenEconomy.totalMinted, sub: 'Signups + purchases + bonuses + streaks', color: 'hsl(142 70% 55%)', icon: TrendingUp },
                  { label: 'Total Tokens Spent', value: tokenEconomy.totalSpent, sub: 'Chat + image + video consumption', color: 'hsl(4 90% 58%)', icon: Zap },
                  { label: 'Circulation Rate', value: tokenEconomy.totalMinted > 0 ? `${Math.round((tokenEconomy.totalSpent / tokenEconomy.totalMinted) * 100)}%` : '0%', sub: 'Tokens spent ÷ tokens minted', color: 'hsl(265 80% 65%)', icon: Activity },
                ].map(kv => (
                  <div key={kv.label} className="relative rounded-2xl border p-5 overflow-hidden" style={{ borderColor: kv.color.replace(')', ' / 0.25)'), background: kv.color.replace(')', ' / 0.04)') }}>
                    <div className="absolute top-0 inset-x-0 h-0.5 rounded-t-2xl" style={{ background: kv.color }} />
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: kv.color.replace(')', ' / 0.12)'), border: `1px solid ${kv.color.replace(')', ' / 0.3)')}` }}><kv.icon className="w-4 h-4" style={{ color: kv.color }} /></div>
                    <p className="text-2xl font-black" style={{ fontFamily: 'Space Grotesk, sans-serif', color: kv.color }}>{typeof kv.value === 'number' ? kv.value.toLocaleString() : kv.value}</p>
                    <p className="text-xs font-semibold text-foreground/90 mt-0.5">{kv.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{kv.sub}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Spend by Feature</p>
                  {tokenEconomy.spendByType.length === 0 ? <p className="text-xs text-muted-foreground/50 italic">No spend events recorded yet.</p> : (
                    <div className="space-y-3">
                      {(() => {
                        const maxVal = Math.max(...tokenEconomy.spendByType.map(s => s.total), 1);
                        const typeColors: Record<string, string> = { chat: 'hsl(191 97% 55%)', image: 'hsl(265 80% 65%)', video: 'hsl(38 95% 60%)' };
                        return tokenEconomy.spendByType.map(s => {
                          const color = typeColors[s.type] ?? 'hsl(210 20% 55%)';
                          return (
                            <div key={s.type}>
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} /><span className="text-xs font-semibold capitalize text-foreground/90">{s.type}</span></div>
                                <div className="flex items-center gap-2"><span className="text-xs font-bold" style={{ color }}>{s.total.toLocaleString()} tkn</span><span className="text-[10px] text-muted-foreground">{tokenEconomy.totalSpent > 0 ? Math.round((s.total / tokenEconomy.totalSpent) * 100) : 0}%</span></div>
                              </div>
                              <div className="h-2 bg-[hsl(224_15%_15%)] rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.round((s.total / maxVal) * 100)}%`, background: color }} /></div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Top Spenders</p>
                  {tokenEconomy.topSpenders.length === 0 ? <p className="text-xs text-muted-foreground/50 italic">No spend data yet.</p> : (
                    <div className="space-y-2">
                      {tokenEconomy.topSpenders.map((s, i) => {
                        const spentPct = s.lifetime_earned > 0 ? Math.round((s.lifetime_spent / s.lifetime_earned) * 100) : 0;
                        return (
                          <div key={s.user_id} className="flex items-center gap-3 p-3 rounded-xl bg-[hsl(224_15%_12%)] border border-border/60">
                            <span className="text-sm shrink-0 w-6 text-center">{['🥇', '🥈', '🥉'][i] ?? `#${i + 1}`}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-mono text-foreground/80 truncate">{s.user_id.slice(0, 8)}…</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-muted-foreground">Spent: <strong className="text-[hsl(4_90%_58%)]">{s.lifetime_spent.toLocaleString()}</strong></span>
                                <span className="text-[10px] text-muted-foreground/40">·</span>
                                <span className="text-[10px] text-muted-foreground">Bal: <strong className="text-[hsl(142_70%_55%)]">{s.balance.toLocaleString()}</strong></span>
                              </div>
                            </div>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'hsl(4 90% 58% / 0.12)', border: '1px solid hsl(4 90% 58% / 0.3)', color: 'hsl(4 90% 60%)' }}>{spentPct}% used</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {kpis.map(kpi => (
            <div key={kpi.label} className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-4 flex flex-col gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: kpi.color.replace(')', ' / 0.12)'), border: `1px solid ${kpi.color.replace(')', ' / 0.3)')}` }}><kpi.icon className="w-4 h-4" style={{ color: kpi.color }} /></div>
              <div>
                <p className="text-xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{kpi.value}</p>
                <p className="text-[11px] font-semibold text-foreground/80 leading-tight">{kpi.label}</p>
                {kpi.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.sub}</p>}
              </div>
            </div>
          ))}
        </div>

        {/* ── 7-Day AI Usage Chart ─────────────────────────────────────────────── */}
        <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-xl bg-[hsl(191_97%_55%_/_0.12)] border border-[hsl(191_97%_55%_/_0.3)] flex items-center justify-center"><MessageSquare className="w-4 h-4 text-[hsl(191_97%_55%)]" /></div>
            <div><h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>AI Usage — Last 7 Days</h2><p className="text-[11px] text-muted-foreground">Chat, images, videos + voice engagement</p></div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={daily} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>{(['chats', 'images', 'videos', 'voice_input', 'tts'] as const).map(key => (<linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CHART_COLORS[key]} stopOpacity={0.3} /><stop offset="95%" stopColor={CHART_COLORS[key]} stopOpacity={0} /></linearGradient>))}</defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(224 15% 15%)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: 'hsl(215 20% 50%)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'hsl(215 20% 50%)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 16 }} />
              <Area type="monotone" dataKey="chats" stroke={CHART_COLORS.chats} fill="url(#grad-chats)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="images" stroke={CHART_COLORS.images} fill="url(#grad-images)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="videos" stroke={CHART_COLORS.videos} fill="url(#grad-videos)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="voice_input" name="Voice Input" stroke={CHART_COLORS.voice_input} fill="url(#grad-voice_input)" strokeWidth={2} dot={false} strokeDasharray="4 2" />
              <Area type="monotone" dataKey="tts" name="Text-to-Speech" stroke={CHART_COLORS.tts} fill="url(#grad-tts)" strokeWidth={2} dot={false} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* ── Voice Usage Card ─────────────────────────────────────────────────── */}
        <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-xl bg-[hsl(4_90%_58%_/_0.12)] border border-[hsl(4_90%_58%_/_0.3)] flex items-center justify-center"><Mic className="w-4 h-4 text-[hsl(4_90%_58%)]" /></div>
            <div className="flex-1"><h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Voice Usage</h2><p className="text-[11px] text-muted-foreground">Wakeword activations, TTS plays, voice inputs &amp; auto-speak sessions</p></div>
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[hsl(4_90%_58%_/_0.3)] bg-[hsl(4_90%_58%_/_0.07)]"><span className="w-1.5 h-1.5 rounded-full bg-[hsl(4_90%_58%)] animate-pulse" /><span className="text-[10px] font-semibold text-[hsl(4_90%_58%)]">{voice7dTotal.toLocaleString()} voice events · 7d</span></div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: '"Hey Mock" Activations', sublabel: 'All-time wakeword fires', value: totalWakewords, trend: 0, icon: Radio, color: 'hsl(142 70% 55%)', note: 'Fires when "Hey Mock" is detected' },
              { label: 'Voice Inputs', sublabel: 'All-time mic recordings', value: totalVoiceInputs, trend: voice7dVoiceInput, icon: Mic, color: 'hsl(4 90% 58%)', note: '' },
              { label: 'TTS Plays', sublabel: 'All-time ElevenLabs plays', value: totalTTSPlays, trend: voice7dTTS, icon: Volume2, color: 'hsl(48 95% 55%)', note: '' },
              { label: 'Auto-Speak Sessions', sublabel: 'All-time enables', value: totalAutoSpeak, trend: 0, icon: MessageCircle, color: 'hsl(265 80% 65%)', note: 'Voice loop session activations' },
            ].map(kv => (
              <div key={kv.label} className="rounded-2xl border p-4 flex flex-col gap-2 relative overflow-hidden" style={{ borderColor: kv.color.replace(')', ' / 0.25)'), background: kv.color.replace(')', ' / 0.04)') }}>
                <div className="absolute top-0 inset-x-0 h-0.5 rounded-t-2xl" style={{ background: kv.color.replace(')', ' / 0.6)') }} />
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: kv.color.replace(')', ' / 0.12)'), border: `1px solid ${kv.color.replace(')', ' / 0.3)')}` }}><kv.icon style={{ width: '18px', height: '18px', color: kv.color }} /></div>
                <div>
                  <p className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{kv.value > 0 ? kv.value.toLocaleString() : <span className="text-muted-foreground text-xl">0</span>}</p>
                  <p className="text-[11px] font-semibold text-foreground/90 leading-tight mt-0.5">{kv.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{kv.sublabel}</p>
                </div>
                {kv.trend > 0 ? (<div className="flex items-center gap-1 mt-auto pt-1 border-t" style={{ borderColor: kv.color.replace(')', ' / 0.2)') }}><TrendingUp className="w-3 h-3" style={{ color: kv.color }} /><span className="text-[10px] font-semibold" style={{ color: kv.color }}>{kv.trend.toLocaleString()} this week</span></div>) : kv.note ? (<div className="flex items-center gap-1 mt-auto pt-1 border-t" style={{ borderColor: kv.color.replace(')', ' / 0.2)') }}><span className="text-[10px] text-muted-foreground">{kv.note}</span></div>) : null}
              </div>
            ))}
          </div>
          <div className="mb-5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">7-Day Voice Trend (STT + TTS combined)</p>
            <div className="grid grid-cols-7 gap-1.5 items-end" style={{ height: '80px' }}>
              {daily.map((d, i) => {
                const voiceTotal = d.voice_input + d.tts; const pct = Math.round((voiceTotal / maxVoiceDay) * 100); const isToday = i === daily.length - 1;
                return (
                  <div key={d.date} className="flex flex-col items-center gap-1 h-full justify-end" title={`${d.date}: ${voiceTotal} voice events`}>
                    <span className="text-[9px] text-muted-foreground/60 font-medium leading-none">{voiceTotal > 0 ? voiceTotal : ''}</span>
                    <div className="w-full flex gap-px rounded-t-md overflow-hidden" style={{ height: `${Math.max(pct * 0.52, 4)}px`, minHeight: '4px' }}>
                      <div className="transition-all duration-500" style={{ flex: d.voice_input, background: isToday ? 'hsl(4 90% 58%)' : 'hsl(4 90% 58% / 0.45)', boxShadow: isToday ? '0 0 6px hsl(4 90% 58% / 0.5)' : 'none' }} />
                      <div className="transition-all duration-500" style={{ flex: d.tts, background: isToday ? 'hsl(48 95% 55%)' : 'hsl(48 95% 55% / 0.45)', boxShadow: isToday ? '0 0 6px hsl(48 95% 55% / 0.5)' : 'none' }} />
                    </div>
                    <span className="text-[9px] text-muted-foreground/50 leading-none">{d.date.slice(3)}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3"><div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[hsl(4_90%_58%)]" /><span className="text-[10px] text-muted-foreground">Voice Input (STT)</span></div><div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[hsl(48_95%_55%)]" /><span className="text-[10px] text-muted-foreground">Text-to-Speech (TTS)</span></div></div>
          </div>
          <div className="pt-5 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[{ label: 'Avg Voice Events / Day', value: voice7dAvgPerDay, sub: 'STT + TTS combined · 7-day window', color: 'hsl(4 90% 58%)' }, { label: 'TTS / Voice Input Ratio', value: ttsVoiceRatio, sub: 'How often MockJ speaks per mic activation', color: 'hsl(48 95% 55%)' }, { label: 'Voice Share of All AI', value: voiceSharePct, sub: 'Voice events vs. all AI interactions (7d)', color: 'hsl(142 70% 55%)' }].map(m => (
              <div key={m.label} className="bg-[hsl(224_20%_12%)] rounded-xl p-4"><p className="text-xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif', color: m.color }}>{m.value}</p><p className="text-xs font-semibold text-foreground/90 mt-0.5">{m.label}</p><p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{m.sub}</p></div>
            ))}
          </div>
        </div>

        {/* ── Traffic Chart ─────────────────────────────────────────────────── */}
        <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-xl bg-[hsl(142_70%_50%_/_0.12)] border border-[hsl(142_70%_50%_/_0.3)] flex items-center justify-center"><Eye className="w-4 h-4 text-[hsl(142_70%_50%)]" /></div>
            <div><h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Traffic — Last 7 Days</h2><p className="text-[11px] text-muted-foreground">Page views and interaction events</p></div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={daily} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>{(['page_views', 'events'] as const).map(key => (<linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={CHART_COLORS[key]} stopOpacity={0.3} /><stop offset="95%" stopColor={CHART_COLORS[key]} stopOpacity={0} /></linearGradient>))}</defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(224 15% 15%)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: 'hsl(215 20% 50%)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'hsl(215 20% 50%)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 16 }} />
              <Area type="monotone" dataKey="page_views" name="Page Views" stroke={CHART_COLORS.page_views} fill="url(#grad-page_views)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="events" name="Events" stroke={CHART_COLORS.events} fill="url(#grad-events)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* ── Top Events + Top Pages ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6"><div className="w-8 h-8 rounded-xl bg-[hsl(38_95%_60%_/_0.12)] border border-[hsl(38_95%_60%_/_0.3)] flex items-center justify-center"><MousePointerClick className="w-4 h-4 text-[hsl(38_95%_60%)]" /></div><div><h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Top Events (30d)</h2><p className="text-[11px] text-muted-foreground">Most fired events last 30 days</p></div></div>
            {topEvents.length === 0 ? <div className="text-center py-8 text-muted-foreground text-xs">No events tracked yet.</div> : (
              <ResponsiveContainer width="100%" height={220}><BarChart data={topEvents} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="hsl(224 15% 15%)" horizontal={false} /><XAxis type="number" tick={{ fill: 'hsl(215 20% 50%)', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="event_name" tick={{ fill: 'hsl(215 20% 65%)', fontSize: 10 }} axisLine={false} tickLine={false} width={110} /><Tooltip content={<CustomTooltip />} /><Bar dataKey="count" fill="hsl(38 95% 60%)" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer>
            )}
          </div>
          <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6"><div className="w-8 h-8 rounded-xl bg-[hsl(265_80%_65%_/_0.12)] border border-[hsl(265_80%_65%_/_0.3)] flex items-center justify-center"><Image className="w-4 h-4 text-[hsl(265_80%_65%)]" /></div><div><h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Top Pages (30d)</h2><p className="text-[11px] text-muted-foreground">Most visited pages last 30 days</p></div></div>
            {topPages.length === 0 ? <div className="text-center py-8 text-muted-foreground text-xs">No page views tracked yet.</div> : (
              <div className="space-y-2">{topPages.map((p, i) => (<div key={p.path} className="flex items-center gap-3"><span className="w-5 text-[11px] text-muted-foreground font-medium shrink-0">{i + 1}</span><div className="flex-1 min-w-0"><div className="flex items-center justify-between mb-1"><span className="text-xs text-foreground truncate">{p.path || '/'}</span><span className="text-xs font-bold text-[hsl(265_80%_65%)] ml-2 shrink-0">{p.count.toLocaleString()}</span></div><div className="h-1.5 bg-[hsl(224_15%_15%)] rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.round((p.count / (topPages[0]?.count || 1)) * 100)}%`, background: 'hsl(265 80% 65%)' }} /></div></div></div>))}</div>
            )}
          </div>
        </div>

        {/* ── Feature Breakdown ─────────────────────────────────────────────── */}
        <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6"><div className="w-8 h-8 rounded-xl bg-[hsl(191_97%_55%_/_0.12)] border border-[hsl(191_97%_55%_/_0.3)] flex items-center justify-center"><Zap className="w-4 h-4 text-[hsl(191_97%_55%)]" /></div><div><h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>AI Feature Breakdown (7d)</h2><p className="text-[11px] text-muted-foreground">Total requests per AI capability</p></div></div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[{ label: 'Chat', icon: MessageSquare, key: 'chats' as const, color: 'hsl(191 97% 55%)' }, { label: 'Images', icon: Image, key: 'images' as const, color: 'hsl(265 80% 65%)' }, { label: 'Videos', icon: Video, key: 'videos' as const, color: 'hsl(38 95% 60%)' }, { label: 'Voice Input', icon: Zap, key: 'voice_input' as const, color: 'hsl(4 90% 58%)' }, { label: 'Text-to-Speech', icon: Activity, key: 'tts' as const, color: 'hsl(48 95% 55%)' }].map(feat => {
              const total = daily.reduce((s, d) => s + d[feat.key], 0); const allTotal = daily.reduce((s, d) => s + d.chats + d.images + d.videos + d.voice_input + d.tts, 0); const pct = allTotal > 0 ? Math.round((total / allTotal) * 100) : 0;
              return (<div key={feat.key} className="bg-[hsl(224_20%_12%)] rounded-xl p-4 text-center"><div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: feat.color.replace(')', ' / 0.12)'), border: `1px solid ${feat.color.replace(')', ' / 0.3)')}` }}><feat.icon className="w-5 h-5" style={{ color: feat.color }} /></div><p className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{total.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">{feat.label}</p><p className="text-[11px] font-semibold mt-1" style={{ color: feat.color }}>{pct}% of total</p></div>);
            })}
          </div>
        </div>

        {/* ── ElevenLabs API Health Card ─────────────────────────────────────── */}
        <div className="rounded-2xl border overflow-hidden" style={{ background: elAccentColor.replace(')', ' / 0.03)'), borderColor: elAccentColor.replace(')', ' / 0.22)'), boxShadow: `0 0 32px ${elAccentColor.replace(')', ' / 0.06)')}` }}>
          <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: elAccentColor.replace(')', ' / 0.15)') }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: elAccentColor.replace(')', ' / 0.12)'), border: `1px solid ${elAccentColor.replace(')', ' / 0.3)')}` }}>
                {elIsChecking ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: elAccentColor }} /> : elIsOk ? <CheckCircle className="w-4 h-4" style={{ color: elAccentColor }} /> : elIsError ? <XCircle className="w-4 h-4" style={{ color: elAccentColor }} /> : <Volume2 className="w-4 h-4" style={{ color: elAccentColor }} />}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif', color: elAccentColor }}>{elStatusLabel}</h2>
                  {elHealth.httpStatus !== null && <span className="px-2 py-0.5 rounded-full text-[10px] font-black font-mono" style={{ background: httpBadgeColor(elHealth.httpStatus).replace(')', ' / 0.12)'), border: `1px solid ${httpBadgeColor(elHealth.httpStatus).replace(')', ' / 0.35)')}`, color: httpBadgeColor(elHealth.httpStatus) }}>HTTP {elHealth.httpStatus}</span>}
                  {elHealth.responseTime !== null && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'hsl(224 15% 12%)', border: '1px solid hsl(215 15% 20%)', color: 'hsl(215 20% 55%)' }}>{elHealth.responseTime}ms</span>}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{elHealth.checkedAt ? `Last checked: ${elHealth.checkedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'ElevenLabs TTS API · elevenlabs-tts edge function probe'}</p>
              </div>
            </div>
            <button onClick={runElevenLabsProbe} disabled={elIsChecking} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95 disabled:opacity-40 shrink-0" style={{ borderColor: elAccentColor.replace(')', ' / 0.35)'), color: elAccentColor, background: elAccentColor.replace(')', ' / 0.07)') }}>
              <RefreshCw className={`w-3 h-3 ${elIsChecking ? 'animate-spin' : ''}`} />{elIsChecking ? 'Testing…' : 'Test Voice'}
            </button>
          </div>
          <div className="px-6 py-5 space-y-4">
            {elIsError && elHealth.errorDetail && (
              <div className="px-4 py-3 rounded-xl bg-[hsl(0_72%_55%_/_0.07)] border border-[hsl(0_72%_55%_/_0.25)]">
                <p className="text-[10px] font-semibold text-[hsl(0_72%_65%)] mb-1 uppercase tracking-widest">Error Detail</p>
                <p className="text-[11px] font-mono text-muted-foreground break-all leading-relaxed">{elHealth.errorDetail}</p>
                {elHealth.httpStatus === 401 && <p className="mt-2 text-[11px] text-[hsl(38_95%_62%)] font-semibold">⚠️ HTTP 401 = Invalid or expired ELEVENLABS_API_KEY → update in Cloud → Secrets</p>}
                {elHealth.httpStatus === 402 && <p className="mt-2 text-[11px] text-[hsl(38_95%_62%)] font-semibold">⚠️ HTTP 402 = Quota exhausted → top up at elevenlabs.io/subscription</p>}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[{ label: 'Voice ID', value: 'N2lVS1w4EtoT3dr4eOWO', mono: true }, { label: 'Model', value: 'eleven_flash_v2_5', mono: true }, { label: 'Edge Function', value: 'elevenlabs-tts', mono: true }, { label: 'Max Concurrent', value: '3 slots', mono: false }].map(({ label, value, mono }) => (
                <div key={label} className="flex flex-col gap-1 px-3 py-2.5 rounded-xl bg-[hsl(224_15%_12%)] border border-border"><span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-widest">{label}</span><span className={`text-[11px] font-bold text-foreground ${mono ? 'font-mono' : ''}`}>{value}</span></div>
              ))}
            </div>
            <div className="flex items-center gap-4 flex-wrap pt-1 border-t border-border/50">
              <p className="text-[11px] text-muted-foreground flex-1 min-w-[140px]">Play full audio test — fires a real TTS request and plays the audio response in your browser:</p>
              <button onClick={handleVoiceTest} disabled={ttsTestState === 'loading'} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0" style={{ background: ttsTestState === 'success' ? 'hsl(142 70% 55% / 0.15)' : ttsTestState === 'error' ? 'hsl(0 70% 55% / 0.15)' : 'hsl(191 97% 55% / 0.1)', border: `1px solid ${ttsTestState === 'success' ? 'hsl(142 70% 55% / 0.5)' : ttsTestState === 'error' ? 'hsl(0 70% 55% / 0.5)' : 'hsl(191 97% 55% / 0.35)'}`, color: ttsTestState === 'success' ? 'hsl(142 70% 55%)' : ttsTestState === 'error' ? 'hsl(0 70% 60%)' : 'hsl(191 97% 55%)' }}>
                {ttsTestState === 'loading' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calling…</> : ttsTestState === 'success' ? <><CheckCircle className="w-3.5 h-3.5" /> Playing ✓</> : ttsTestState === 'error' ? <><XCircle className="w-3.5 h-3.5" /> Failed</> : <><Volume2 className="w-3.5 h-3.5" /> Play Audio Test</>}
              </button>
              {ttsTestState === 'error' && ttsTestError && <p className="text-[10px] font-mono text-destructive break-all max-w-xs">{ttsTestError}</p>}
            </div>
          </div>
        </div>

        {/* ── Stripe Subscriptions Table ─────────────────────────────────────── */}
        <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-border">
            <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-xl bg-[hsl(265_80%_65%_/_0.12)] border border-[hsl(265_80%_65%_/_0.3)] flex items-center justify-center"><Crown className="w-4 h-4 text-[hsl(265_80%_65%)]" /></div><div><h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Stripe Subscriptions</h2><p className="text-[11px] text-muted-foreground">{subscriptions.length > 0 ? `${subscriptions.filter(s => s.status === 'active').length} active · ${subscriptions.length} total` : 'Live subscription records from DB'}</p></div></div>
            <button onClick={fetchSubscriptions} disabled={subsLoading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground hover:border-[hsl(265_80%_65%_/_0.4)] transition-all disabled:opacity-50"><RefreshCw className={`w-3 h-3 ${subsLoading ? 'animate-spin' : ''}`} />Refresh</button>
          </div>
          {subsLoading && <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
          {!subsLoading && subscriptions.length === 0 && <div className="flex flex-col items-center gap-4 py-10 text-center px-6"><div className="w-12 h-12 rounded-2xl bg-[hsl(224_15%_12%)] border border-border flex items-center justify-center"><Crown className="w-6 h-6 text-muted-foreground opacity-30" /></div><p className="text-sm text-muted-foreground">No subscriptions found in DB</p></div>}
          {!subsLoading && subscriptions.length > 0 && (() => {
            const cols: { key: keyof SubscriptionRow; label: string; span: string }[] = [{ key: 'user_email', label: 'Email', span: 'col-span-3' }, { key: 'tier', label: 'Tier', span: 'col-span-2' }, { key: 'status', label: 'Status', span: 'col-span-2' }, { key: 'current_period_end', label: 'Renews', span: 'col-span-2' }, { key: 'price_id', label: 'Price ID', span: 'col-span-3' }];
            const tierColor = (t: string) => t === 'pro' ? 'hsl(191 97% 55%)' : t === 'sale' ? 'hsl(4 90% 58%)' : t === 'free' ? 'hsl(210 20% 55%)' : 'hsl(265 80% 65%)';
            const statusColor = (s: string) => s === 'active' ? 'hsl(142 70% 55%)' : s === 'trialing' ? 'hsl(191 97% 55%)' : s === 'canceled' ? 'hsl(0 70% 55%)' : 'hsl(38 95% 60%)';
            return (<><div className="hidden sm:grid grid-cols-12 gap-2 px-6 py-2.5 bg-[hsl(224_15%_8%)] border-b border-border/60">{cols.map(col => (<button key={col.key} onClick={() => handleSubSort(col.key)} className={`${col.span} flex items-center gap-1 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest hover:text-muted-foreground transition-colors text-left`}>{col.label}{subSort.key === col.key ? subSort.dir === 'asc' ? <SortAsc className="w-2.5 h-2.5" /> : <SortDown className="w-2.5 h-2.5" /> : null}</button>))}</div><div className="divide-y divide-border/40">{sortedSubs.map(sub => { const endDate = sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'; const isExpiringSoon = sub.current_period_end ? new Date(sub.current_period_end).getTime() - Date.now() < 7 * 86400_000 : false; return (<div key={sub.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 px-6 py-3.5 items-center hover:bg-[hsl(224_15%_10%)] transition-colors"><div className="col-span-3 min-w-0"><p className="text-xs text-foreground truncate font-medium">{sub.user_email ?? <span className="text-muted-foreground/40 italic">no email</span>}</p></div><div className="col-span-2"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase" style={{ background: tierColor(sub.tier).replace(')', ' / 0.1)'), border: `1px solid ${tierColor(sub.tier).replace(')', ' / 0.3)')}`, color: tierColor(sub.tier) }}><Crown className="w-2 h-2" />{sub.tier}</span></div><div className="col-span-2"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ background: statusColor(sub.status).replace(')', ' / 0.1)'), border: `1px solid ${statusColor(sub.status).replace(')', ' / 0.3)')}`, color: statusColor(sub.status) }}><span className="w-1 h-1 rounded-full" style={{ background: statusColor(sub.status) }} />{sub.status}</span></div><div className="col-span-2"><p className={`text-[11px] font-semibold ${isExpiringSoon ? 'text-[hsl(38_95%_60%)]' : 'text-foreground'}`}>{endDate}</p>{isExpiringSoon && <p className="text-[9px] text-[hsl(38_95%_60%)] font-bold">Expiring soon</p>}</div><div className="col-span-3 min-w-0"><p className="text-[10px] font-mono text-muted-foreground truncate">{sub.price_id ?? '—'}</p></div></div>); })}</div></>);
          })()}
        </div>

        {/* ── Stripe Webhook Events Log ─────────────────────────────────────── */}
        <div className="bg-[hsl(224_20%_9%)] border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[hsl(38_95%_60%_/_0.12)] border border-[hsl(38_95%_60%_/_0.3)] flex items-center justify-center"><Webhook className="w-4 h-4 text-[hsl(38_95%_60%)]" /></div>
              <div>
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Stripe Webhook Events{webhookLive && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ background: 'hsl(142 70% 55% / 0.1)', border: '1px solid hsl(142 70% 55% / 0.3)', color: 'hsl(142 70% 60%)' }}><span className="w-1 h-1 rounded-full bg-[hsl(142_70%_55%)] animate-pulse" />Live · 10s</span>}</h2>
                <p className="text-[11px] text-muted-foreground">Last 20 processed events · {webhookEvents.length === 0 ? 'None yet' : `${webhookEvents.length} event${webhookEvents.length === 1 ? '' : 's'}`}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowTestEventPanel(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[hsl(265_80%_65%_/_0.35)] text-xs text-[hsl(265_80%_65%)] hover:bg-[hsl(265_80%_65%_/_0.08)] transition-all"><FlaskConical className="w-3 h-3" />Test Event<ChevronDown className={`w-3 h-3 transition-transform ${showTestEventPanel ? 'rotate-180' : ''}`} /></button>
              <button onClick={exportRevenueCsv} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[hsl(142_70%_55%_/_0.3)] text-xs text-[hsl(142_70%_60%)] hover:bg-[hsl(142_70%_55%_/_0.08)] transition-all" title="Export checkout events as CSV"><Download className="w-3 h-3" />Export CSV</button>
              <button onClick={fetchWebhookEvents} disabled={webhookLoading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground hover:border-[hsl(38_95%_60%_/_0.4)] transition-all disabled:opacity-50"><RefreshCw className={`w-3 h-3 ${webhookLoading ? 'animate-spin' : ''}`} />Refresh</button>
            </div>
          </div>
          {/* ── Send Test Event Panel ── */}
          {showTestEventPanel && (
            <div className="px-6 py-5 border-b border-border bg-[hsl(265_80%_65%_/_0.04)]">
              <div className="flex items-center gap-2 mb-4">
                <FlaskConical className="w-4 h-4 text-[hsl(265_80%_65%)]" />
                <p className="text-xs font-bold text-[hsl(265_80%_65%)]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Simulate checkout.session.completed</p>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase" style={{ background: 'hsl(265 80% 65% / 0.12)', border: '1px solid hsl(265 80% 65% / 0.3)', color: 'hsl(265 80% 70%)' }}>ADMIN ONLY · NO REAL CHARGE</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest block mb-1.5">Target User ID</label>
                  <input value={testEventUserId} onChange={e => setTestEventUserId(e.target.value)} placeholder="UUID from user_profiles table" className="w-full bg-[hsl(224_15%_11%)] border border-border rounded-xl px-3 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-[hsl(265_80%_65%_/_0.5)] transition-colors" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest block mb-1.5">Token Package</label>
                  <select value={testEventPackage} onChange={e => setTestEventPackage(e.target.value)} className="w-full bg-[hsl(224_15%_11%)] border border-border rounded-xl px-3 py-2.5 text-xs text-foreground outline-none focus:border-[hsl(265_80%_65%_/_0.5)] transition-colors">
                    <option value="starter">Starter — 500 tokens ($4.99)</option>
                    <option value="creator">Creator — 1,500 tokens ($9.99)</option>
                    <option value="pro_pack">Pro Pack — 5,000 tokens ($24.99)</option>
                    <option value="elite">Elite — 12,000 tokens ($49.99)</option>
                    <option value="titan">Titan — 30,000 tokens ($99.99)</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={sendTestEvent} disabled={testEventState === 'loading' || !testEventUserId.trim()} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: 'hsl(265 80% 65% / 0.15)', border: '1px solid hsl(265 80% 65% / 0.45)', color: 'hsl(265 80% 70%)' }}>
                  {testEventState === 'loading' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Firing…</> : <><FlaskConical className="w-3.5 h-3.5" />Fire Test Event</>}
                </button>
                {testEventState === 'success' && testEventResult && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'hsl(142 70% 50% / 0.1)', border: '1px solid hsl(142 70% 50% / 0.3)' }}>
                    <UserCheck className="w-3.5 h-3.5 text-[hsl(142_70%_55%)]" />
                    <span className="text-xs font-semibold text-[hsl(142_70%_60%)]">
                      ✅ {testEventResult.tokensCredited.toLocaleString()} tokens credited{testEventResult.badgeAwarded && ` + 🏅 ${testEventResult.badgeAwarded} badge`}{testEventResult.newBalance !== null && ` · New balance: ${testEventResult.newBalance.toLocaleString()}`}
                    </span>
                  </div>
                )}
                {testEventState === 'error' && testEventError && <p className="text-xs font-mono text-destructive">{testEventError}</p>}
              </div>
              <p className="text-[10px] text-muted-foreground/50 mt-3 leading-relaxed">Fires the full webhook → increment_tokens RPC → token_transactions → user_badges pipeline without a real Stripe charge. Writes a simulated event to webhook_events so the live log updates. Find user IDs in Cloud → Data → user_profiles.</p>
            </div>
          )}
          {webhookLoading && <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
          {!webhookLoading && webhookEvents.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-12 text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-[hsl(224_15%_12%)] border border-border flex items-center justify-center"><Webhook className="w-6 h-6 text-muted-foreground opacity-30" /></div>
              <div><p className="text-sm font-semibold text-foreground">No webhook events yet</p><p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">Events appear here after the first live Stripe payment completes.</p></div>
              <div className="px-4 py-3 rounded-xl bg-[hsl(38_95%_60%_/_0.06)] border border-[hsl(38_95%_60%_/_0.25)] text-[11px] text-left max-w-sm w-full"><p className="font-semibold text-[hsl(38_95%_65%)] mb-1">Verify webhook endpoint:</p><p className="font-mono text-[10px] text-[hsl(38_95%_60%)] break-all">https://zdhketzyvyblkarezdhk.backend.onspace.ai/functions/v1/stripe-webhook</p></div>
            </div>
          )}
          {!webhookLoading && webhookEvents.length > 0 && (
            <>
              <div className="hidden sm:grid grid-cols-12 gap-2 px-6 py-2.5 bg-[hsl(224_15%_8%)] border-b border-border/60">{[['Event Type', 'col-span-4'], ['User / Customer', 'col-span-3'], ['Status', 'col-span-2'], ['Processed At', 'col-span-2'], ['', 'col-span-1']].map(([h, cls]) => <p key={h} className={`text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest ${cls}`}>{h}</p>)}</div>
              <div className="divide-y divide-border/40">
                {webhookEvents.map(ev => {
                  const isExpanded = webhookExpanded === ev.id;
                  const eventColor = ev.type.includes('checkout') ? 'hsl(142 70% 55%)' : ev.type.includes('subscription') ? 'hsl(191 97% 55%)' : ev.type.includes('invoice') ? 'hsl(265 80% 65%)' : 'hsl(210 20% 60%)';
                  const EventIcon = ev.type.includes('checkout') ? CreditCard : ev.type.includes('subscription') ? BadgeCheck : ev.type.includes('invoice') ? Package : AlertCircle;
                  const date = new Date(ev.processed_at);
                  return (
                    <div key={ev.id}>
                      <div className="grid grid-cols-12 gap-2 px-6 py-3.5 items-center hover:bg-[hsl(224_15%_10%)] transition-colors cursor-pointer" onClick={() => setWebhookExpanded(isExpanded ? null : ev.id)}>
                        <div className="col-span-11 sm:col-span-4 flex items-center gap-2 min-w-0"><div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: eventColor.replace(')', ' / 0.12)'), border: `1px solid ${eventColor.replace(')', ' / 0.3)')}` }}><EventIcon className="w-3.5 h-3.5" style={{ color: eventColor }} /></div><span className="text-xs font-mono font-semibold truncate" style={{ color: eventColor }}>{ev.type}</span></div>
                        <div className="hidden sm:block col-span-3 min-w-0">{ev.user_id && <p className="text-[11px] font-mono text-foreground truncate">{ev.user_id.slice(0, 8)}…</p>}{ev.stripe_customer_id && <p className="text-[10px] text-muted-foreground font-mono truncate">{ev.stripe_customer_id.slice(0, 14)}…</p>}{!ev.user_id && !ev.stripe_customer_id && <span className="text-[10px] text-muted-foreground/40">—</span>}</div>
                        <div className="hidden sm:block col-span-2"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ background: 'hsl(142 70% 55% / 0.1)', border: '1px solid hsl(142 70% 55% / 0.3)', color: 'hsl(142 70% 60%)' }}><span className="w-1 h-1 rounded-full bg-[hsl(142_70%_55%)]" />OK</span></div>
                        <div className="hidden sm:block col-span-2"><p className="text-[11px] text-foreground font-semibold">{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p><p className="text-[10px] text-muted-foreground font-mono">{date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p></div>
                        <div className="col-span-1 flex justify-end"><span className="text-[10px] text-muted-foreground transition-transform duration-200" style={{ display: 'inline-block', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▼</span></div>
                      </div>
                      {isExpanded && <div className="px-6 pb-5"><div className="rounded-xl bg-[hsl(224_15%_7%)] border border-border p-4"><div className="flex items-center justify-between mb-3"><p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Event Payload</p><span className="text-[10px] font-mono text-muted-foreground/60">{ev.event_id.slice(0, 24)}…</span></div>{ev.payload ? <pre className="text-[10px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-64">{JSON.stringify(ev.payload, null, 2)}</pre> : <p className="text-[11px] text-muted-foreground/50 italic">No payload recorded</p>}</div></div>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ── SSL / HTTPS Status ─────────────────────────────────────────────── */}
        {(() => {
          const statusMap: Record<string, { label: string; sub: string; color: string; icon: typeof Lock }> = { idle: { label: 'Not checked', sub: 'Click check to verify', color: 'hsl(210 20% 50%)', icon: Globe }, checking: { label: 'Checking…', sub: 'Pinging mockj.online + SSL Labs', color: 'hsl(191 97% 55%)', icon: Globe }, valid: { label: 'HTTPS Valid', sub: 'Certificate is healthy', color: 'hsl(142 70% 55%)', icon: Lock }, expiring_soon: { label: 'Expiring Soon', sub: 'Renew within 30 days', color: 'hsl(38 95% 60%)', icon: LockOpen }, expired: { label: 'Certificate Expired', sub: 'SSL is invalid — renew immediately', color: 'hsl(0 72% 60%)', icon: LockOpen }, unreachable: { label: 'HTTPS Unreachable', sub: 'Domain/SSL error — check DNS + cert', color: 'hsl(0 72% 60%)', icon: ServerCrash }, unknown: { label: 'Analysis Pending', sub: 'SSL Labs is running a fresh scan', color: 'hsl(265 80% 65%)', icon: Globe } };
          const s = statusMap[sslInfo.status] ?? statusMap.idle; const Icon = s.icon; const isChecking = sslInfo.status === 'checking';
          return (
            <div className="rounded-2xl border p-5 flex flex-col sm:flex-row sm:items-center gap-5" style={{ background: s.color.replace(')', ' / 0.04)'), borderColor: s.color.replace(')', ' / 0.22)'), boxShadow: `0 0 32px ${s.color.replace(')', ' / 0.06)')}` }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: s.color.replace(')', ' / 0.12)'), border: `1px solid ${s.color.replace(')', ' / 0.3)')}` }}><Icon className={isChecking ? 'animate-pulse' : ''} style={{ width: '22px', height: '22px', color: s.color }} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap"><p className="text-sm font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif', color: s.color }}>{s.label}</p>{sslInfo.grade && <span className="px-2 py-0.5 rounded-full text-[9px] font-black" style={{ background: s.color.replace(')', ' / 0.15)'), border: `1px solid ${s.color.replace(')', ' / 0.35)')}`, color: s.color }}>Grade {sslInfo.grade}</span>}{sslInfo.daysLeft !== null && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ background: s.color.replace(')', ' / 0.12)'), border: `1px solid ${s.color.replace(')', ' / 0.3)')}`, color: s.color }}>{sslInfo.daysLeft}d remaining</span>}</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{s.sub}</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2"><span className="text-[10px] text-muted-foreground/70"><span className="font-semibold text-foreground/60">Domain:</span> mockj.online</span>{sslInfo.reachable !== null && <span className="text-[10px] text-muted-foreground/70"><span className="font-semibold text-foreground/60">HTTPS:</span> <span style={{ color: sslInfo.reachable ? 'hsl(142 70% 55%)' : 'hsl(0 72% 60%)' }}>{sslInfo.reachable ? 'Reachable ✓' : 'Unreachable ✗'}</span></span>}{sslInfo.expiryDate && <span className="text-[10px] text-muted-foreground/70"><span className="font-semibold text-foreground/60">Expires:</span> {sslInfo.expiryDate}</span>}{sslInfo.checkedAt && <span className="text-[10px] text-muted-foreground/70"><span className="font-semibold text-foreground/60">Checked:</span> {sslInfo.checkedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}</div>
                {sslInfo.error && <p className="mt-2 text-[10px] font-mono text-muted-foreground/60 bg-[hsl(224_15%_7%)] rounded-lg px-3 py-2 border border-border/50">{sslInfo.error}</p>}
              </div>
              <button onClick={checkSSL} disabled={isChecking} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0" style={{ borderColor: s.color.replace(')', ' / 0.35)'), color: s.color, background: s.color.replace(')', ' / 0.07)') }}><RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />{isChecking ? 'Checking…' : 'Re-check SSL'}</button>
            </div>
          );
        })()}

        <p className="text-center text-[11px] text-muted-foreground/50 pb-4">MockJ Analytics · Admin only · Auto-refreshes every 30s</p>
      </div>
    </div>
  );
}
