/**
 * LeaderboardPage.tsx
 * Top Token Holders · Top Referrers · Top Creators
 * Route: /leaderboard
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trophy, Coins, Users, Image, ArrowLeft, RefreshCw, Crown,
  Medal, Flame, Loader2, Star, Video,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import logoImg from '@/assets/mockj-logo.png';

// ── Types ─────────────────────────────────────────────────────────────────────
interface TokenHolder {
  user_id: string;
  balance: number;
  username: string | null;
}

interface TopReferrer {
  referrer_id: string;
  count: number;
  username: string | null;
}

interface TopCreator {
  user_id: string;
  image_count: number;
  video_count: number;
  total: number;
  username: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function maskName(name: string | null, uid: string): string {
  const base = name ?? uid.slice(0, 8);
  if (base.length <= 3) return base + '***';
  return base.slice(0, 3) + '•'.repeat(Math.min(4, base.length - 3));
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return (
    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: 'linear-gradient(135deg, hsl(38 95% 60%), hsl(38 95% 40%))', boxShadow: '0 0 12px hsl(38 95% 60% / 0.5)' }}>
      <Crown className="w-4 h-4 text-[hsl(224_20%_6%)]" />
    </div>
  );
  if (rank === 2) return (
    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: 'hsl(210 20% 65% / 0.2)', border: '1px solid hsl(210 20% 65% / 0.4)' }}>
      <Medal className="w-4 h-4 text-[hsl(210_20%_65%)]" />
    </div>
  );
  if (rank === 3) return (
    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: 'hsl(20 70% 55% / 0.15)', border: '1px solid hsl(20 70% 55% / 0.4)' }}>
      <Medal className="w-4 h-4 text-[hsl(20_70%_55%)]" />
    </div>
  );
  return (
    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-[hsl(224_15%_12%)] border border-border">
      <span className="text-xs font-black text-muted-foreground">{rank}</span>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-[hsl(224_15%_9%)] animate-pulse">
      <div className="w-8 h-8 rounded-xl bg-[hsl(224_15%_14%)] shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-32 rounded bg-[hsl(224_15%_14%)]" />
        <div className="h-2.5 w-20 rounded bg-[hsl(224_15%_14%)]" />
      </div>
      <div className="h-4 w-16 rounded bg-[hsl(224_15%_14%)]" />
    </div>
  );
}

// ── Token Holders Tab ─────────────────────────────────────────────────────────
function TokenHoldersTab({ currentUserId }: { currentUserId?: string }) {
  const [data, setData] = useState<TokenHolder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    // Get top 20 token balances
    const { data: tokens } = await supabase
      .from('user_tokens')
      .select('user_id, balance')
      .order('balance', { ascending: false })
      .limit(20);

    if (!tokens || tokens.length === 0) { setData([]); setLoading(false); return; }

    // Fetch usernames for those IDs
    const ids = tokens.map((t: { user_id: string }) => t.user_id);
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, username')
      .in('id', ids);

    const profileMap = new Map((profiles ?? []).map((p: { id: string; username: string | null }) => [p.id, p.username]));

    setData(tokens.map((t: { user_id: string; balance: number }) => ({
      user_id: t.user_id,
      balance: t.balance,
      username: profileMap.get(t.user_id) ?? null,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted-foreground">Top 20 token holders across the MockJ ecosystem</p>
        <button onClick={fetch} disabled={loading} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] border border-border text-muted-foreground hover:text-foreground transition-all">
          <RefreshCw className={cn('w-2.5 h-2.5', loading && 'animate-spin')} /> Refresh
        </button>
      </div>

      {loading && [0,1,2,3,4].map(i => <RowSkeleton key={i} />)}

      {!loading && data.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Coins className="w-10 h-10 text-muted-foreground opacity-20" />
          <p className="text-sm text-muted-foreground">No data yet — be the first on the leaderboard!</p>
        </div>
      )}

      {!loading && data.map((row, i) => {
        const rank = i + 1;
        const isMe = row.user_id === currentUserId;
        return (
          <div
            key={row.user_id}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200',
              rank <= 3
                ? 'bg-[hsl(224_15%_10%)] border-[hsl(38_95%_60%_/_0.25)]'
                : 'bg-[hsl(224_15%_9%)] border-border',
              isMe && 'ring-1 ring-[hsl(191_97%_55%_/_0.4)]'
            )}
          >
            <RankBadge rank={rank} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground truncate">
                  {maskName(row.username, row.user_id)}
                </p>
                {isMe && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[hsl(191_97%_55%_/_0.15)] text-[hsl(191_97%_55%)] border border-[hsl(191_97%_55%_/_0.3)]">
                    YOU
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">MockJ Token Holder</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Coins className="w-3.5 h-3.5 text-[hsl(38_95%_60%)]" />
              <span className="text-sm font-black text-[hsl(38_95%_60%)]">
                {row.balance.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Top Referrers Tab ─────────────────────────────────────────────────────────
function TopReferrersTab({ currentUserId }: { currentUserId?: string }) {
  const [data, setData] = useState<TopReferrer[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data: refs } = await supabase
      .from('referrals')
      .select('referrer_id')
      .eq('status', 'completed');

    if (!refs || refs.length === 0) { setData([]); setLoading(false); return; }

    // Count per referrer
    const countMap = new Map<string, number>();
    for (const r of refs) {
      countMap.set(r.referrer_id, (countMap.get(r.referrer_id) ?? 0) + 1);
    }
    const sorted = [...countMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    const ids = sorted.map(([id]) => id);
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, username')
      .in('id', ids);

    const profileMap = new Map((profiles ?? []).map((p: { id: string; username: string | null }) => [p.id, p.username]));

    setData(sorted.map(([referrer_id, count]) => ({
      referrer_id,
      count,
      username: profileMap.get(referrer_id) ?? null,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted-foreground">Top community builders by referral count</p>
        <button onClick={fetch} disabled={loading} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] border border-border text-muted-foreground hover:text-foreground transition-all">
          <RefreshCw className={cn('w-2.5 h-2.5', loading && 'animate-spin')} /> Refresh
        </button>
      </div>

      {loading && [0,1,2,3,4].map(i => <RowSkeleton key={i} />)}

      {!loading && data.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Users className="w-10 h-10 text-muted-foreground opacity-20" />
          <p className="text-sm text-muted-foreground">No referrals yet — share your link to climb the board!</p>
        </div>
      )}

      {!loading && data.map((row, i) => {
        const rank = i + 1;
        const isMe = row.referrer_id === currentUserId;
        return (
          <div
            key={row.referrer_id}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200',
              rank <= 3
                ? 'bg-[hsl(224_15%_10%)] border-[hsl(265_80%_65%_/_0.25)]'
                : 'bg-[hsl(224_15%_9%)] border-border',
              isMe && 'ring-1 ring-[hsl(191_97%_55%_/_0.4)]'
            )}
          >
            <RankBadge rank={rank} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground truncate">
                  {maskName(row.username, row.referrer_id)}
                </p>
                {isMe && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[hsl(191_97%_55%_/_0.15)] text-[hsl(191_97%_55%)] border border-[hsl(191_97%_55%_/_0.3)]">
                    YOU
                  </span>
                )}
                {rank <= 3 && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[hsl(265_80%_65%_/_0.15)] text-[hsl(265_80%_65%)] border border-[hsl(265_80%_65%_/_0.3)]">
                    VIP
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">Community Ambassador</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Users className="w-3.5 h-3.5 text-[hsl(265_80%_65%)]" />
              <span className="text-sm font-black text-[hsl(265_80%_65%)]">
                {row.count} referral{row.count !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Top Creators Tab ──────────────────────────────────────────────────────────
function TopCreatorsTab({ currentUserId }: { currentUserId?: string }) {
  const [data, setData] = useState<TopCreator[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);

    // Count image generations per user
    const { data: imgs } = await supabase
      .from('image_generations')
      .select('user_id')
      .not('user_id', 'is', null);

    // Count video generations per user
    const { data: vids } = await supabase
      .from('video_generations')
      .select('user_id')
      .not('user_id', 'is', null);

    const imgMap = new Map<string, number>();
    for (const r of (imgs ?? [])) {
      imgMap.set(r.user_id, (imgMap.get(r.user_id) ?? 0) + 1);
    }
    const vidMap = new Map<string, number>();
    for (const r of (vids ?? [])) {
      vidMap.set(r.user_id, (vidMap.get(r.user_id) ?? 0) + 1);
    }

    const allIds = new Set([...imgMap.keys(), ...vidMap.keys()]);
    const combined = [...allIds].map(uid => ({
      user_id: uid,
      image_count: imgMap.get(uid) ?? 0,
      video_count: vidMap.get(uid) ?? 0,
      total: (imgMap.get(uid) ?? 0) + (vidMap.get(uid) ?? 0) * 3, // weight videos more
    })).sort((a, b) => b.total - a.total).slice(0, 20);

    if (combined.length === 0) { setData([]); setLoading(false); return; }

    const ids = combined.map(c => c.user_id);
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, username')
      .in('id', ids);

    const profileMap = new Map((profiles ?? []).map((p: { id: string; username: string | null }) => [p.id, p.username]));

    setData(combined.map(c => ({ ...c, username: profileMap.get(c.user_id) ?? null })));
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted-foreground">Most prolific AI creators — images + videos combined</p>
        <button onClick={fetch} disabled={loading} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] border border-border text-muted-foreground hover:text-foreground transition-all">
          <RefreshCw className={cn('w-2.5 h-2.5', loading && 'animate-spin')} /> Refresh
        </button>
      </div>

      {loading && [0,1,2,3,4].map(i => <RowSkeleton key={i} />)}

      {!loading && data.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Image className="w-10 h-10 text-muted-foreground opacity-20" />
          <p className="text-sm text-muted-foreground">No generations yet — create something amazing!</p>
        </div>
      )}

      {!loading && data.map((row, i) => {
        const rank = i + 1;
        const isMe = row.user_id === currentUserId;
        return (
          <div
            key={row.user_id}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200',
              rank <= 3
                ? 'bg-[hsl(224_15%_10%)] border-[hsl(4_90%_58%_/_0.25)]'
                : 'bg-[hsl(224_15%_9%)] border-border',
              isMe && 'ring-1 ring-[hsl(191_97%_55%_/_0.4)]'
            )}
          >
            <RankBadge rank={rank} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground truncate">
                  {maskName(row.username, row.user_id)}
                </p>
                {isMe && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[hsl(191_97%_55%_/_0.15)] text-[hsl(191_97%_55%)] border border-[hsl(191_97%_55%_/_0.3)]">
                    YOU
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Image className="w-2.5 h-2.5" /> {row.image_count.toLocaleString()} images
                </span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Video className="w-2.5 h-2.5" /> {row.video_count.toLocaleString()} videos
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Star className="w-3.5 h-3.5 text-[hsl(4_90%_58%)]" />
              <span className="text-sm font-black text-[hsl(4_90%_58%)]">
                {(row.image_count + row.video_count).toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
type LeaderboardTab = 'tokens' | 'referrers' | 'creators';

const TABS: { id: LeaderboardTab; label: string; icon: typeof Trophy; color: string }[] = [
  { id: 'tokens',    label: 'Token Holders', icon: Coins,  color: 'hsl(38 95% 60%)' },
  { id: 'referrers', label: 'Top Referrers',  icon: Users,  color: 'hsl(265 80% 65%)' },
  { id: 'creators',  label: 'Top Creators',   icon: Flame,  color: 'hsl(4 90% 58%)' },
];

export default function LeaderboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<LeaderboardTab>('tokens');

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[hsl(224_20%_5%)] border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2.5 flex-1">
            <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0">
              <img src={logoImg} alt="MockJ" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="font-black text-base text-foreground leading-none flex items-center gap-1.5"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                <Trophy className="w-4 h-4 text-[hsl(38_95%_60%)]" />
                Leaderboard
              </h1>
              <p className="text-[10px] text-muted-foreground mt-0.5">MockJ ecosystem rankings</p>
            </div>
          </div>
          {!user && (
            <button
              onClick={() => navigate('/auth')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[hsl(4_90%_58%)] text-white transition-all"
            >
              Sign in
            </button>
          )}
        </div>

        {/* Tab bar */}
        <div className="max-w-2xl mx-auto px-4 pb-0 flex gap-0">
          {TABS.map(({ id, label, icon: Icon, color }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold flex-1 justify-center border-b-2 transition-all duration-200',
                tab === id
                  ? 'border-current'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
              style={tab === id ? { color, borderColor: color } : undefined}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Hero strip — top 3 podium */}
      <div className="bg-gradient-to-b from-[hsl(224_20%_7%)] to-transparent border-b border-border/50">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-end justify-center gap-4">
            {/* 2nd */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-[hsl(210_20%_65%_/_0.15)] border border-[hsl(210_20%_65%_/_0.35)] flex items-center justify-center">
                <Medal className="w-6 h-6 text-[hsl(210_20%_65%)]" />
              </div>
              <div className="w-16 h-14 rounded-t-xl bg-[hsl(210_20%_65%_/_0.1)] border-x border-t border-[hsl(210_20%_65%_/_0.25)] flex items-center justify-center">
                <span className="text-xl font-black text-[hsl(210_20%_65%)]">2</span>
              </div>
            </div>
            {/* 1st */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, hsl(38 95% 60%), hsl(38 95% 40%))', boxShadow: '0 0 20px hsl(38 95% 60% / 0.4)' }}>
                <Crown className="w-7 h-7 text-[hsl(224_20%_6%)]" />
              </div>
              <div className="w-18 h-20 rounded-t-xl flex items-center justify-center"
                style={{ width: '4.5rem', background: 'linear-gradient(to top, hsl(38 95% 60% / 0.08), hsl(38 95% 60% / 0.18))', border: '1px solid hsl(38 95% 60% / 0.35)', borderBottom: 'none' }}>
                <span className="text-2xl font-black text-[hsl(38_95%_60%)]">1</span>
              </div>
            </div>
            {/* 3rd */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-[hsl(20_70%_55%_/_0.15)] border border-[hsl(20_70%_55%_/_0.35)] flex items-center justify-center">
                <Medal className="w-6 h-6 text-[hsl(20_70%_55%)]" />
              </div>
              <div className="w-16 h-10 rounded-t-xl bg-[hsl(20_70%_55%_/_0.1)] border-x border-t border-[hsl(20_70%_55%_/_0.25)] flex items-center justify-center">
                <span className="text-xl font-black text-[hsl(20_70%_55%)]">3</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Sign-in nudge */}
        {!user && (
          <div className="mb-6 p-4 rounded-2xl border border-dashed border-[hsl(4_90%_58%_/_0.3)] bg-[hsl(4_90%_58%_/_0.04)] flex items-center gap-3">
            <Trophy className="w-8 h-8 text-[hsl(4_90%_58%)] opacity-60 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Sign in to see your ranking</p>
              <p className="text-xs text-muted-foreground">Your position is highlighted once you're logged in.</p>
            </div>
            <button onClick={() => navigate('/auth')} className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold bg-[hsl(4_90%_58%)] text-white">
              Sign In
            </button>
          </div>
        )}

        {tab === 'tokens'    && <TokenHoldersTab  currentUserId={user?.id} />}
        {tab === 'referrers' && <TopReferrersTab  currentUserId={user?.id} />}
        {tab === 'creators'  && <TopCreatorsTab   currentUserId={user?.id} />}
      </div>
    </div>
  );
}
