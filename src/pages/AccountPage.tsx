import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Crown, Zap, MessageSquare, Image, Video, Calendar, CreditCard,
  ArrowLeft, RefreshCw, CheckCircle, AlertCircle, Loader2, User,
  Sparkles, Lock, Camera, Upload, BarChart3, Settings, KeyRound,
  Pencil, Trash2, ShieldAlert, Eye, EyeOff, Check, X as XIcon, Bell, BellOff,
  Receipt, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut } from 'lucide-react';
import { useUsageLimits } from '@/hooks/useUsageLimits';
import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import logoImg from '@/assets/mockj-logo.png';
import { requestNotificationPermission, notificationsEnabled } from '@/hooks/useNotifications';

const FREE_LIMITS = { chat: 10, image: 3, video: 1 };

// ── 7-Day Usage Chart ────────────────────────────────────────────────────────
interface DailyUsageRow {
  date: string;
  chat: number;
  image: number;
  video: number;
}

const chartColors = {
  chat:  'hsl(4 90% 58%)',
  image: 'hsl(265 80% 65%)',
  video: 'hsl(191 97% 55%)',
};

function UsageChart({ data, loading }: { data: DailyUsageRow[]; loading: boolean }) {
  if (loading && data.length === 0) {
    return (
      <div className="h-48 rounded-2xl bg-[hsl(224_15%_9%)] border border-border animate-pulse flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 rounded-2xl bg-[hsl(224_15%_9%)] border border-border">
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
          <defs>
            <linearGradient id="gradChat" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={chartColors.chat} stopOpacity={0.35} />
              <stop offset="95%" stopColor={chartColors.chat} stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id="gradImage" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={chartColors.image} stopOpacity={0.35} />
              <stop offset="95%" stopColor={chartColors.image} stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id="gradVideo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={chartColors.video} stopOpacity={0.35} />
              <stop offset="95%" stopColor={chartColors.video} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(224 15% 14%)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: 'hsl(210 20% 45%)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'hsl(210 20% 45%)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(224 20% 7%)',
              border: '1px solid hsl(224 15% 18%)',
              borderRadius: '10px',
              fontSize: '11px',
              color: 'hsl(210 20% 85%)',
            }}
            labelStyle={{ color: 'hsl(210 20% 60%)', marginBottom: 4 }}
            cursor={{ stroke: 'hsl(224 15% 22%)', strokeWidth: 1 }}
          />
          <Legend
            wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }}
            formatter={(value) => <span style={{ color: 'hsl(210 20% 55%)' }}>{value}</span>}
          />
          <Area
            type="monotone"
            dataKey="chat"
            name="Chat"
            stroke={chartColors.chat}
            strokeWidth={2}
            fill="url(#gradChat)"
            dot={false}
            activeDot={{ r: 4, fill: chartColors.chat, strokeWidth: 0 }}
            isAnimationActive
          />
          <Area
            type="monotone"
            dataKey="image"
            name="Images"
            stroke={chartColors.image}
            strokeWidth={2}
            fill="url(#gradImage)"
            dot={false}
            activeDot={{ r: 4, fill: chartColors.image, strokeWidth: 0 }}
            isAnimationActive
          />
          <Area
            type="monotone"
            dataKey="video"
            name="Videos"
            stroke={chartColors.video}
            strokeWidth={2}
            fill="url(#gradVideo)"
            dot={false}
            activeDot={{ r: 4, fill: chartColors.video, strokeWidth: 0 }}
            isAnimationActive
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Today's compact meters ───────────────────────────────────────────────────
function UsageMeter({
  label,
  icon: Icon,
  used,
  total,
  color,
}: {
  label: string;
  icon: React.ElementType;
  used: number;
  total: number | typeof Infinity;
  color: string;
}) {
  const isUnlimited = total === Infinity;
  const pct = isUnlimited ? 100 : Math.min(100, (used / total) * 100);
  const remaining = isUnlimited ? '∞' : Math.max(0, total - used);
  const almostOut = !isUnlimited && (total - used) <= 1;

  return (
    <div className="flex flex-col gap-2 p-4 rounded-2xl bg-[hsl(224_15%_9%)] border border-border hover:border-[hsl(224_15%_20%)] transition-all duration-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              background: `${color.replace(')', ' / 0.12)')}`,
              border: `1px solid ${color.replace(')', ' / 0.3)')}`,
            }}
          >
            <Icon className="w-3.5 h-3.5" style={{ color }} />
          </div>
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <div className="text-right">
          {isUnlimited ? (
            <span className="text-xs font-bold" style={{ color: 'hsl(4 90% 58%)' }}>Unlimited</span>
          ) : (
            <span className={cn('text-xs font-bold', almostOut ? 'text-[hsl(0_70%_60%)]' : 'text-foreground')}>
              {remaining} left
            </span>
          )}
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-[hsl(224_15%_14%)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: isUnlimited
              ? 'linear-gradient(90deg, hsl(4 90% 58%), hsl(265 80% 65%))'
              : almostOut
              ? 'hsl(0 70% 55%)'
              : color,
          }}
        />
      </div>
      {!isUnlimited && (
        <p className="text-[10px] text-muted-foreground">
          {used} of {total} used today · resets at midnight UTC
        </p>
      )}
    </div>
  );
}

// ── Webhook Event Log ────────────────────────────────────────────────────────
interface WebhookEvent {
  id: string;
  event_id: string;
  type: string;
  payload: Record<string, unknown> | null;
  processed_at: string;
}

const EVENT_TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  'checkout.session.completed':    { label: 'Checkout completed',    color: 'hsl(142 70% 55%)', icon: '✅' },
  'customer.subscription.created': { label: 'Subscription created',  color: 'hsl(142 70% 55%)', icon: '🎉' },
  'customer.subscription.updated': { label: 'Subscription updated',  color: 'hsl(38 95% 60%)',  icon: '🔄' },
  'customer.subscription.deleted': { label: 'Subscription cancelled',color: 'hsl(0 70% 60%)',   icon: '❌' },
  'invoice.paid':                  { label: 'Invoice paid',           color: 'hsl(191 97% 55%)', icon: '💳' },
};

function getEventMeta(type: string) {
  return EVENT_TYPE_META[type] ?? { label: type, color: 'hsl(210 20% 55%)', icon: '📋' };
}

function EventPayloadRow({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === '') return null;
  const isAmount = label.includes('amount') || label.includes('paid');
  const display = isAmount && typeof value === 'number'
    ? `$${(Number(value) / 100).toFixed(2)}`
    : String(value);
  return (
    <div className="flex items-center justify-between text-[10px] py-0.5">
      <span className="text-muted-foreground/60 capitalize">{label.replace(/_/g, ' ')}</span>
      <span className="font-mono text-muted-foreground/90 max-w-[55%] truncate text-right">{display}</span>
    </div>
  );
}

function EventCard({ event }: { event: WebhookEvent }) {
  const [expanded, setExpanded] = useState(false);
  const meta = getEventMeta(event.type);
  const date = new Date(event.processed_at);
  const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const payloadEntries = event.payload
    ? Object.entries(event.payload).filter(([, v]) => v !== null && v !== undefined && v !== '')
    : [];

  return (
    <div className="rounded-xl border border-border bg-[hsl(224_15%_9%)] overflow-hidden transition-all duration-200 hover:border-[hsl(224_15%_22%)]">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
          style={{
            background: meta.color.replace(')', ' / 0.1)'),
            border: `1px solid ${meta.color.replace(')', ' / 0.3)')}`,
          }}
        >
          {meta.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{meta.label}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">{dateStr} · {timeStr}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>

      {expanded && payloadEntries.length > 0 && (
        <div className="px-4 pb-3 border-t border-border/50 pt-2 space-y-0.5">
          {payloadEntries.map(([k, v]) => (
            <EventPayloadRow key={k} label={k} value={v} />
          ))}
          <p className="text-[9px] font-mono text-muted-foreground/25 pt-1 truncate">{event.event_id}</p>
        </div>
      )}
    </div>
  );
}

function EventLog({ userId }: { userId: string }) {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('webhook_events')
      .select('id, event_id, type, payload, processed_at')
      .eq('user_id', userId)
      .order('processed_at', { ascending: false })
      .limit(10);
    if (!error && data) setEvents(data as WebhookEvent[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchEvents();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchEvents();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchEvents]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-widest">Billing Events</h2>
        </div>
        <button
          onClick={fetchEvents}
          disabled={loading}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-muted-foreground border border-border hover:text-foreground hover:border-[hsl(224_15%_24%)] transition-all"
        >
          <RefreshCw className={cn('w-2.5 h-2.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {loading && events.length === 0 && (
        <div className="space-y-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-14 rounded-xl bg-[hsl(224_15%_9%)] border border-border animate-pulse" />
          ))}
        </div>
      )}

      {!loading && events.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10 rounded-xl border border-dashed border-border text-center">
          <Receipt className="w-8 h-8 text-muted-foreground opacity-25" />
          <div>
            <p className="text-sm font-semibold text-foreground">No billing events yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Events appear here after your first Stripe webhook fires.
            </p>
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div className="space-y-2">
          {events.map(event => <EventCard key={event.id} event={event} />)}
          <p className="text-[10px] text-muted-foreground/40 text-right pt-1">
            Last {events.length} event{events.length !== 1 ? 's' : ''} · read-only · click to expand
          </p>
        </div>
      )}
    </div>
  );
}

// ── Avatar Upload Component ──────────────────────────────────────────────────
function AvatarUpload({ userId, currentAvatar }: { userId: string; currentAvatar?: string }) {
  const { refreshUser } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [preview, setPreview] = useState<string | null>(currentAvatar ?? null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) { toast.error('Image must be under 20MB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Please upload an image file'); return; }

    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    setUploadPct(0);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${userId}/avatar.${ext}`;

      // Simulate progress in 3 steps while upload completes
      const progTimer = setInterval(() => {
        setUploadPct(p => (p < 80 ? p + 20 : p));
      }, 300);

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });

      clearInterval(progTimer);
      setUploadPct(100);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const avatarUrl = `${publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } });
      if (updateError) throw updateError;

      await refreshUser();
      setPreview(avatarUrl);
      toast.success('Avatar updated!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
      setPreview(currentAvatar ?? null);
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  return (
    <div className="relative group shrink-0">
      <div
        className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-[hsl(4_90%_58%_/_0.4)] bg-[hsl(4_90%_58%_/_0.1)] flex items-center justify-center cursor-pointer relative"
        onClick={() => !uploading && fileRef.current?.click()}
        title="Click to upload new avatar"
      >
        {preview
          ? <img src={preview} alt="Avatar" className="w-full h-full object-cover" />
          : <User className="w-6 h-6 text-[hsl(4_90%_58%)]" />}
        {/* Upload progress ring */}
        {uploading && uploadPct > 0 && (
          <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="30" fill="none" stroke="hsl(4 90% 58% / 0.2)" strokeWidth="3" />
            <circle
              cx="32" cy="32" r="30" fill="none"
              stroke="hsl(4 90% 58%)" strokeWidth="3"
              strokeDasharray={`${(uploadPct / 100) * 188.5} 188.5`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.3s ease' }}
            />
          </svg>
        )}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-2xl flex items-center justify-center">
          {uploading
            ? <span className="text-[10px] font-black text-white">{uploadPct}%</span>
            : <Camera className="w-5 h-5 text-white" />}
        </div>
      </div>
      <button
        onClick={() => !uploading && fileRef.current?.click()}
        disabled={uploading}
        className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center border-2 border-[hsl(224_20%_5%)] transition-all"
        style={{ background: 'hsl(4 90% 58%)' }}
      >
        {uploading
          ? <Loader2 className="w-3 h-3 text-white animate-spin" />
          : <Upload className="w-3 h-3 text-white" />}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </div>
  );
}

// ── Account Settings Component ──────────────────────────────────────────────
function AccountSettings({ user }: { user: { id: string; email: string; username: string } }) {
  const { refreshUser } = useAuth();
  const [username, setUsername]     = useState(user.username);
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [usernameSuccess, setUsernameSuccess] = useState(false);

  const [currentPw, setCurrentPw]   = useState('');
  const [newPw, setNewPw]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [pwLoading, setPwLoading]     = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading]         = useState(false);

  const handleUpdateUsername = async () => {
    if (!username.trim() || username.trim() === user.username) return;
    setUsernameLoading(true);
    setUsernameSuccess(false);
    try {
      const { error } = await supabase.auth.updateUser({ data: { username: username.trim() } });
      if (error) throw error;
      await supabase.from('user_profiles').update({ username: username.trim() }).eq('id', user.id);
      await refreshUser();
      setUsernameSuccess(true);
      toast.success('Username updated!');
      setTimeout(() => setUsernameSuccess(false), 2500);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update username');
    } finally {
      setUsernameLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPw || newPw.length < 6) { toast.error('New password must be at least 6 characters'); return; }
    if (newPw !== confirmPw)        { toast.error('Passwords do not match'); return; }
    setPwLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPw });
      if (signInError) throw new Error('Current password is incorrect');
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      toast.success('Password changed successfully!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeleteLoading(true);
    try {
      // Call edge function to permanently delete from auth.users (cascades all data)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      const { error: fnErr } = await supabase.functions.invoke('delete-account', {});
      if (fnErr) {
        // Check for FunctionsHttpError details
        let msg = fnErr.message;
        if ((fnErr as { context?: { text?: () => Promise<string> } }).context?.text) {
          try { msg = await (fnErr as { context: { text: () => Promise<string> } }).context.text(); } catch { /* ignore */ }
        }
        throw new Error(msg);
      }

      // Sign out client-side after successful deletion
      await supabase.auth.signOut();
      toast.success('Account permanently deleted. Goodbye!');
      window.location.href = '/';
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete account');
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-bold text-foreground uppercase tracking-widest">Account Settings</h2>
      </div>

      {/* Username */}
      <div className="p-5 rounded-2xl bg-[hsl(224_15%_9%)] border border-border space-y-4">
        <div className="flex items-center gap-2">
          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Display Name</p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={username}
            onChange={e => { setUsername(e.target.value); setUsernameSuccess(false); }}
            placeholder="Enter username"
            maxLength={32}
            className="flex-1 bg-[hsl(224_15%_6%)] border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-[hsl(4_90%_58%_/_0.5)] transition-all"
          />
          <button
            onClick={handleUpdateUsername}
            disabled={usernameLoading || !username.trim() || username.trim() === user.username}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed',
              usernameSuccess
                ? 'bg-[hsl(142_70%_55%_/_0.15)] border border-[hsl(142_70%_55%_/_0.4)] text-[hsl(142_70%_55%)]'
                : 'bg-[hsl(4_90%_58%_/_0.12)] border border-[hsl(4_90%_58%_/_0.4)] text-[hsl(4_90%_58%)] hover:bg-[hsl(4_90%_58%_/_0.2)]'
            )}
          >
            {usernameLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {usernameLoading ? 'Saving…' : usernameSuccess ? 'Saved!' : 'Save'}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground/50">This name appears in your profile and chat messages.</p>
      </div>

      {/* Password */}
      <div className="p-5 rounded-2xl bg-[hsl(224_15%_9%)] border border-border space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Change Password</p>
        </div>
        <div className="space-y-2.5">
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
              placeholder="Current password"
              className="w-full bg-[hsl(224_15%_6%)] border border-border rounded-xl px-3.5 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-[hsl(4_90%_58%_/_0.5)] transition-all"
            />
            <button onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showCurrent ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="New password (min. 6 characters)"
              className="w-full bg-[hsl(224_15%_6%)] border border-border rounded-xl px-3.5 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-[hsl(4_90%_58%_/_0.5)] transition-all"
            />
            <button onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showNew ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <input
            type="password"
            value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
            placeholder="Confirm new password"
            className="w-full bg-[hsl(224_15%_6%)] border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-[hsl(4_90%_58%_/_0.5)] transition-all"
          />
          {newPw && confirmPw && newPw !== confirmPw && (
            <p className="text-[11px] text-destructive flex items-center gap-1.5">
              <XIcon className="w-3 h-3" /> Passwords do not match
            </p>
          )}
        </div>
        <button
          onClick={handleChangePassword}
          disabled={pwLoading || !currentPw || !newPw || !confirmPw || newPw !== confirmPw}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[hsl(4_90%_58%_/_0.12)] border border-[hsl(4_90%_58%_/_0.4)] text-[hsl(4_90%_58%)] hover:bg-[hsl(4_90%_58%_/_0.2)] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pwLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
          {pwLoading ? 'Updating…' : 'Update Password'}
        </button>
      </div>

      {/* Danger Zone */}
      <div className="p-5 rounded-2xl bg-[hsl(0_60%_8%)] border border-[hsl(0_70%_30%_/_0.4)] space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 text-destructive" />
          <p className="text-sm font-semibold text-destructive">Danger Zone</p>
        </div>
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="text-xs font-semibold text-foreground">Delete Account</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
          </div>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-destructive/40 text-destructive hover:bg-destructive/10 transition-all shrink-0"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="bg-[hsl(224_15%_8%)] border border-destructive/30 rounded-2xl p-6 max-w-sm w-full space-y-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 border border-destructive/30 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Delete Account</p>
                <p className="text-[11px] text-muted-foreground">This cannot be undone.</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              All your conversations, images, videos, and account data will be permanently deleted.
              Type <span className="font-bold text-destructive">DELETE</span> below to confirm.
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              className="w-full bg-[hsl(224_15%_6%)] border border-destructive/30 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-destructive/60 transition-all"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(''); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-border text-muted-foreground hover:text-foreground transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || deleteLoading}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold bg-destructive/15 border border-destructive/40 text-destructive hover:bg-destructive/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {deleteLoading ? 'Deleting…' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AccountPage() {
  const navigate = useNavigate();
  const { user, subscription, refreshSubscription, logout } = useAuth();
  const { getRemaining } = useUsageLimits();
  const [portalLoading, setPortalLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(() => notificationsEnabled());

  const [serverUsage, setServerUsage] = useState<{ chat: number; image: number; video: number } | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [chartData, setChartData] = useState<DailyUsageRow[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  const fetchServerUsage = useCallback(async () => {
    if (!user) return;
    setUsageLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('user_daily_usage')
      .select('chat_count, image_count, video_count')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle();
    if (!error && data) {
      setServerUsage({ chat: data.chat_count ?? 0, image: data.image_count ?? 0, video: data.video_count ?? 0 });
    } else {
      setServerUsage({ chat: 0, image: 0, video: 0 });
    }
    setUsageLoading(false);
  }, [user]);

  const fetchChartData = useCallback(async () => {
    if (!user) return;
    setChartLoading(true);
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    const { data, error } = await supabase
      .from('user_daily_usage')
      .select('date, chat_count, image_count, video_count')
      .eq('user_id', user.id)
      .in('date', dates)
      .order('date', { ascending: true });

    const rowMap = new Map<string, { chat: number; image: number; video: number }>();
    if (!error && data) {
      for (const row of data) {
        rowMap.set(row.date, { chat: row.chat_count ?? 0, image: row.image_count ?? 0, video: row.video_count ?? 0 });
      }
    }
    const filled: DailyUsageRow[] = dates.map(d => {
      const dt = new Date(d + 'T00:00:00');
      const label = dt.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
      const row = rowMap.get(d);
      return { date: label, chat: row?.chat ?? 0, image: row?.image ?? 0, video: row?.video ?? 0 };
    });
    setChartData(filled);
    setChartLoading(false);
  }, [user]);

  useEffect(() => {
    fetchServerUsage();
    fetchChartData();
    const interval = setInterval(() => { fetchServerUsage(); fetchChartData(); }, 30_000);
    const handleFocus = () => { fetchServerUsage(); fetchChartData(); };
    window.addEventListener('focus', handleFocus);
    const handleVis = () => {
      if (document.visibilityState === 'visible') { fetchServerUsage(); fetchChartData(); }
    };
    document.addEventListener('visibilitychange', handleVis);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVis);
    };
  }, [fetchServerUsage, fetchChartData]);

  const isPro = subscription.subscribed;
  const tierLabel = subscription.tier === 'sale' ? 'Intro' : 'Pro';
  const renewDate = subscription.subscriptionEnd
    ? new Date(subscription.subscriptionEnd).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const resolvedUsage = {
    chat:  serverUsage?.chat  ?? (FREE_LIMITS.chat  - getRemaining('chat')),
    image: serverUsage?.image ?? (FREE_LIMITS.image - getRemaining('image')),
    video: serverUsage?.video ?? (FREE_LIMITS.video - getRemaining('video')),
  };

  // For Pro users: show actual usage counts (not 0) so they can see their activity
  // Total is Infinity so the progress bar stays full and shows "Unlimited"
  const usageMetrics = [
    { label: 'Chat Messages',      icon: MessageSquare, color: 'hsl(4 90% 58%)',   used: resolvedUsage.chat,  total: isPro ? Infinity : FREE_LIMITS.chat  },
    { label: 'Image Generations',  icon: Image,         color: 'hsl(265 80% 65%)', used: resolvedUsage.image, total: isPro ? Infinity : FREE_LIMITS.image },
    { label: 'Video Generations',  icon: Video,         color: 'hsl(38 95% 60%)',  used: resolvedUsage.video, total: isPro ? Infinity : FREE_LIMITS.video },
  ];

  const handleManageSubscription = async () => {
    if (!user?.email) { toast.error('You must be signed in to manage your subscription.'); return; }
    setPortalLoading(true);
    const { data, error } = await supabase.functions.invoke('customer-portal', { body: { email: user.email } });
    if (error) {
      let msg = error.message;
      if (error instanceof FunctionsHttpError) {
        try { msg = (await error.context?.text()) || msg; } catch { /* ignore */ }
      }
      toast.error(`Could not open billing portal: ${msg}`);
      setPortalLoading(false);
      return;
    }
    if (data?.url) window.open(data.url, '_blank');
    setPortalLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshSubscription();
    setRefreshing(false);
    toast.success('Subscription status refreshed');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-border bg-[hsl(224_20%_5%)]">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to MockJ
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg overflow-hidden">
            <img src={logoImg} alt="MockJ" className="w-full h-full object-cover" />
          </div>
          <span className="font-bold text-sm text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            MockJ <span style={{ color: 'hsl(4 90% 58%)' }}>4</span>
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            My Account
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your profile, plan, usage, and billing settings.
          </p>
        </div>

        {/* Profile card */}
        <div className="flex items-center gap-4 p-5 rounded-2xl bg-[hsl(224_15%_9%)] border border-border">
          {user
            ? <AvatarUpload userId={user.id} currentAvatar={user.avatar} />
            : <div className="w-16 h-16 rounded-2xl bg-[hsl(4_90%_58%_/_0.1)] border border-[hsl(4_90%_58%_/_0.3)] flex items-center justify-center shrink-0"><User className="w-6 h-6 text-[hsl(4_90%_58%)]" /></div>
          }
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground truncate">{user?.username ?? 'Anonymous'}</p>
            <p className="text-sm text-muted-foreground truncate">{user?.email ?? 'Not signed in'}</p>
            {user && <p className="text-[11px] text-muted-foreground/50 mt-0.5">Click avatar to upload a new photo</p>}
          </div>
          {isPro && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0"
              style={{
                background: 'linear-gradient(135deg, hsl(4 90% 58% / 0.15), hsl(265 80% 65% / 0.15))',
                border: '1px solid hsl(4 90% 58% / 0.4)',
                color: 'hsl(4 90% 78%)',
              }}
            >
              <Crown className="w-3 h-3" />
              MockJ {tierLabel}
            </div>
          )}
        </div>

        {/* Plan card */}
        <div
          className={cn(
            'relative rounded-2xl border p-6 overflow-hidden',
            isPro ? 'border-[hsl(4_90%_58%_/_0.35)] bg-[hsl(224_15%_8%)]' : 'border-border bg-[hsl(224_15%_9%)]'
          )}
        >
          {isPro && (
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse 80% 60% at 50% -10%, hsl(4 90% 58% / 0.07) 0%, transparent 70%)' }} />
          )}

          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center shrink-0',
                isPro
                  ? 'bg-gradient-to-br from-[hsl(4_90%_58%_/_0.2)] to-[hsl(265_80%_65%_/_0.2)] border border-[hsl(4_90%_58%_/_0.4)]'
                  : 'bg-[hsl(224_15%_14%)] border border-border'
              )}>
                {isPro ? <Crown className="w-5 h-5 text-[hsl(4_90%_58%)]" /> : <Zap className="w-5 h-5 text-muted-foreground" />}
              </div>
              <div>
                <h2 className="font-bold text-foreground text-base" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  {isPro ? `MockJ ${tierLabel}` : 'Free Plan'}
                </h2>
                <div className="flex items-center gap-1.5 mt-1">
                  {isPro ? (
                    <><CheckCircle className="w-3.5 h-3.5 text-[hsl(142_70%_55%)]" /><span className="text-xs text-[hsl(142_70%_65%)] font-medium">Active subscription</span></>
                  ) : (
                    <><AlertCircle className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Limited daily usage</span></>
                  )}
                </div>
              </div>
            </div>
            <button onClick={handleRefresh} disabled={refreshing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground border border-border hover:text-foreground hover:border-[hsl(224_15%_24%)] transition-all">
              <RefreshCw className={cn('w-3 h-3', refreshing && 'animate-spin')} />
              Refresh
            </button>
          </div>

          {isPro && renewDate && (
            <div className="relative mt-5 flex flex-wrap gap-4">
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[hsl(224_15%_6%)] border border-border flex-1 min-w-0">
                <Calendar className="w-4 h-4 text-[hsl(4_90%_58%)] shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Next renewal</p>
                  <p className="text-sm font-semibold text-foreground">{renewDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[hsl(224_15%_6%)] border border-border flex-1 min-w-0">
                <CreditCard className="w-4 h-4 text-[hsl(265_80%_65%)] shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Billing</p>
                  <p className="text-sm font-semibold text-foreground">Monthly</p>
                </div>
              </div>
            </div>
          )}

          {isPro && (
            <div className="relative mt-4 grid grid-cols-2 gap-2">
              {['Unlimited chat messages','Unlimited image generations','Unlimited video generations','ElevenLabs voice output','Advanced creator tools','Commercial image license'].map(feat => (
                <div key={feat} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle className="w-3 h-3 text-[hsl(4_90%_58%)] shrink-0" />{feat}
                </div>
              ))}
            </div>
          )}

          {!isPro && (
            <div className="relative mt-5 p-4 rounded-xl bg-[hsl(265_80%_65%_/_0.06)] border border-[hsl(265_80%_65%_/_0.2)]">
              <div className="flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-[hsl(265_80%_65%)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Upgrade to MockJ Pro</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Unlock unlimited chat, images, videos, ElevenLabs voice, and advanced creator tools.
                  </p>
                  <button
                    onClick={() => {
                      navigate('/');
                      // Dispatch event so Index.tsx opens the pricing modal
                      setTimeout(() => window.dispatchEvent(new CustomEvent('mockj:open-pricing')), 300);
                    }}
                    className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white hover:opacity-90 transition-all active:scale-95"
                    style={{ background: 'hsl(265 80% 65%)', boxShadow: '0 0 14px hsl(265 80% 65% / 0.3)' }}
                  >
                    <Crown className="w-3.5 h-3.5" /> See Plans
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Usage section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-bold text-foreground uppercase tracking-widest">Usage Analytics</h2>
            </div>
            <div className="flex items-center gap-2">
              {isPro && (
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'hsl(4 90% 58%)' }}>
                  No limits · Pro
                </span>
              )}
              {user && (
                <button
                  onClick={() => { fetchServerUsage(); fetchChartData(); }}
                  disabled={usageLoading || chartLoading}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-muted-foreground border border-border hover:text-foreground hover:border-[hsl(224_15%_24%)] transition-all"
                >
                  <RefreshCw className={cn('w-2.5 h-2.5', (usageLoading || chartLoading) && 'animate-spin')} />
                  Sync
                </button>
              )}
            </div>
          </div>

          {user && (
            <>
              <p className="text-[10px] text-muted-foreground/60 mb-2">Last 7 days · auto-refreshes every 30s</p>
              <UsageChart data={chartData} loading={chartLoading} />
            </>
          )}

          <div className="mt-4 space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Today</p>
            {usageLoading && !serverUsage ? (
              <div className="space-y-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="p-4 rounded-2xl bg-[hsl(224_15%_9%)] border border-border animate-pulse">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[hsl(224_15%_14%)]" />
                        <div className="w-28 h-3 rounded bg-[hsl(224_15%_14%)]" />
                      </div>
                      <div className="w-12 h-3 rounded bg-[hsl(224_15%_14%)]" />
                    </div>
                    <div className="h-1.5 rounded-full bg-[hsl(224_15%_14%)]" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {usageMetrics.map(m => <UsageMeter key={m.label} {...m} />)}
              </div>
            )}
          </div>

          {user && serverUsage && (
            <p className="text-[10px] text-muted-foreground/50 mt-2 text-right">
              Live server data · resets at midnight UTC
            </p>
          )}
          {!user && (
            <p className="text-[10px] text-muted-foreground/50 mt-2">
              Sign in to sync live usage data from the server.
            </p>
          )}
        </div>

        {/* Notification permission card */}
        {user && (
          <div className="p-4 rounded-2xl bg-[hsl(224_15%_9%)] border border-border flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-[hsl(4_90%_58%_/_0.1)] border border-[hsl(4_90%_58%_/_0.3)] flex items-center justify-center shrink-0">
              {notifEnabled
                ? <Bell className="w-4 h-4 text-[hsl(4_90%_58%)]" />
                : <BellOff className="w-4 h-4 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {notifEnabled ? 'Notifications enabled' : 'Enable notifications'}
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                {notifEnabled
                  ? 'You will be notified when MockJ finishes speaking or a video is ready.'
                  : 'Get notified when Auto-Speak finishes or your video is ready, even when the tab is in the background.'}
              </p>
            </div>
            {!notifEnabled && (
              <button
                onClick={async () => {
                  const granted = await requestNotificationPermission();
                  setNotifEnabled(granted);
                  if (granted) toast.success('Notifications enabled!');
                  else toast.error('Permission denied — enable in browser settings.');
                }}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[hsl(4_90%_58%_/_0.12)] border border-[hsl(4_90%_58%_/_0.4)] text-[hsl(4_90%_58%)] hover:bg-[hsl(4_90%_58%_/_0.22)] transition-all"
              >
                <Bell className="w-3 h-3" /> Enable
              </button>
            )}
          </div>
        )}

        {/* Billing Event Log — Pro only */}
        {isPro && user && <EventLog userId={user.id} />}

        {/* Manage subscription */}
        {isPro && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-widest">Billing Management</h2>
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={handleManageSubscription}
                disabled={portalLoading || !user}
                className={cn(
                  'flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95',
                  'border text-[hsl(4_90%_58%)] hover:shadow-[0_0_16px_hsl(4_90%_58%_/_0.2)]',
                  (portalLoading || !user) && 'opacity-50 cursor-not-allowed'
                )}
                style={{ background: 'hsl(4 90% 58% / 0.12)', borderColor: 'hsl(4 90% 58% / 0.4)' }}
              >
                {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                {portalLoading ? 'Opening portal…' : 'Manage Subscription'}
              </button>
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-[hsl(224_15%_24%)] transition-all"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Chat
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
              The Stripe Customer Portal lets you update payment methods, view invoices, and cancel your subscription at any time.
            </p>
          </div>
        )}

        {/* Account Settings */}
        {user && <AccountSettings user={user} />}

        {/* Sign Out */}
        {user && (
          <div className="p-4 rounded-2xl bg-[hsl(224_15%_9%)] border border-border flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Sign Out</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Signed in as {user.email}</p>
            </div>
            <button
              onClick={() => { logout(); navigate('/'); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all active:scale-95"
              style={{ background: 'hsl(4 90% 58% / 0.08)', borderColor: 'hsl(4 90% 58% / 0.35)', color: 'hsl(4 90% 65%)' }}
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        )}

        {/* Signed-out state */}
        {!user && (
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl border border-dashed border-border text-center">
            <Lock className="w-8 h-8 text-muted-foreground opacity-40" />
            <div>
              <p className="text-sm font-semibold text-foreground">Sign in to access your account</p>
              <p className="text-xs text-muted-foreground mt-1">View your plan, billing, and usage details.</p>
            </div>
            <button
              onClick={() => navigate('/auth')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
              style={{ background: 'hsl(4 90% 58%)' }}
            >
              Sign In
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
