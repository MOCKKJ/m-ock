/**
 * admin-users edge function
 * Requires: Authorization header with admin user JWT
 * Admin email list is checked server-side for security.
 *
 * Actions:
 *   get_users   — full user list with subscription + usage data
 *   get_revenue — revenue KPIs from subscriptions table
 *   get_usage   — aggregated AI usage totals
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

const ADMIN_EMAILS = ['mltxpro@gmail.com', 'jenny@mltxpro.com', 'admin@mockj.online'];

// Pricing map by tier
const TIER_PRICE: Record<string, number> = {
  pro:  50.99,
  sale:  2.99,
  free:  0,
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the requesting user is an admin
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const email = user.email ?? '';
    if (!ADMIN_EMAILS.includes(email)) {
      return new Response(JSON.stringify({ error: 'Forbidden — admin access only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Service role client for full data access ──────────────────────────────
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { action } = await req.json().catch(() => ({ action: 'get_users' }));

    // ── Action: get_users ─────────────────────────────────────────────────────
    if (action === 'get_users') {
      // Fetch all profiles
      const { data: profiles, error: profErr } = await admin
        .from('user_profiles')
        .select('id, username, email')
        .order('email', { ascending: true });

      if (profErr) throw profErr;

      // Fetch all subscriptions
      const { data: subs } = await admin
        .from('subscriptions')
        .select('user_id, status, tier, current_period_end, stripe_customer_id, created_at, updated_at');

      // Fetch today's usage + last 30d cumulative per user
      const today = new Date().toISOString().slice(0, 10);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

      const { data: usageRows } = await admin
        .from('user_daily_usage')
        .select('user_id, date, chat_count, image_count, video_count')
        .gte('date', thirtyDaysAgo);

      // Fetch last login from auth.users via admin auth API
      // We use auth.admin.listUsers for last_sign_in_at
      const { data: authListData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const authUsers = authListData?.users ?? [];
      const authMap: Record<string, { last_sign_in_at?: string; created_at?: string }> = {};
      for (const au of authUsers) {
        authMap[au.id] = {
          last_sign_in_at: au.last_sign_in_at,
          created_at: au.created_at,
        };
      }

      // Build sub map
      const subMap: Record<string, typeof subs[0]> = {};
      for (const s of (subs ?? [])) {
        subMap[s.user_id] = s;
      }

      // Build usage map per user (30d totals)
      const usageMap: Record<string, { chat: number; image: number; video: number; lastActive: string }> = {};
      for (const r of (usageRows ?? [])) {
        if (!usageMap[r.user_id]) {
          usageMap[r.user_id] = { chat: 0, image: 0, video: 0, lastActive: r.date };
        }
        usageMap[r.user_id].chat += r.chat_count ?? 0;
        usageMap[r.user_id].image += r.image_count ?? 0;
        usageMap[r.user_id].video += r.video_count ?? 0;
        if (r.date > usageMap[r.user_id].lastActive) {
          usageMap[r.user_id].lastActive = r.date;
        }
      }

      // Assemble user records
      const users = (profiles ?? []).map(p => {
        const sub = subMap[p.id];
        const usage = usageMap[p.id] ?? { chat: 0, image: 0, video: 0, lastActive: null };
        const auth = authMap[p.id] ?? {};
        return {
          id: p.id,
          username: p.username ?? '',
          email: p.email,
          plan: sub?.status === 'active' || sub?.status === 'trialing' ? (sub.tier ?? 'free') : 'free',
          subscription_status: sub?.status ?? 'none',
          tier: sub?.tier ?? 'free',
          current_period_end: sub?.current_period_end ?? null,
          stripe_customer_id: sub?.stripe_customer_id ?? null,
          chat_30d: usage.chat,
          image_30d: usage.image,
          video_30d: usage.video,
          total_ai_30d: usage.chat + usage.image + usage.video,
          last_active: usage.lastActive,
          last_sign_in: auth.last_sign_in_at ?? null,
          created_at: auth.created_at ?? null,
        };
      });

      // Sort: paid first, then by last active desc
      users.sort((a, b) => {
        const aPaid = a.plan !== 'free' ? 1 : 0;
        const bPaid = b.plan !== 'free' ? 1 : 0;
        if (aPaid !== bPaid) return bPaid - aPaid;
        return (b.last_sign_in ?? '').localeCompare(a.last_sign_in ?? '');
      });

      return new Response(JSON.stringify({ users }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Action: get_revenue ───────────────────────────────────────────────────
    if (action === 'get_revenue') {
      const { data: activeSubs } = await admin
        .from('subscriptions')
        .select('tier, status, created_at, updated_at')
        .in('status', ['active', 'trialing']);

      const subs = activeSubs ?? [];
      const mrr = subs.reduce((sum, s) => sum + (TIER_PRICE[s.tier ?? 'free'] ?? 0), 0);

      // Estimate all-time revenue from all subscriptions ever created
      const { data: allSubs } = await admin
        .from('subscriptions')
        .select('tier, status, created_at');

      const allRevenue = (allSubs ?? []).reduce((sum, s) => {
        if (s.status === 'active' || s.status === 'trialing' || s.status === 'past_due') {
          return sum + (TIER_PRICE[s.tier ?? 'free'] ?? 0);
        }
        return sum;
      }, 0);

      // Breakdown by tier
      const tierBreakdown: Record<string, { count: number; mrr: number }> = {};
      for (const s of subs) {
        const t = s.tier ?? 'free';
        if (!tierBreakdown[t]) tierBreakdown[t] = { count: 0, mrr: 0 };
        tierBreakdown[t].count++;
        tierBreakdown[t].mrr += TIER_PRICE[t] ?? 0;
      }

      // Recent Stripe webhook events for payment history
      const { data: webhooks } = await admin
        .from('webhook_events')
        .select('type, processed_at, payload')
        .order('processed_at', { ascending: false })
        .limit(20);

      return new Response(JSON.stringify({
        mrr: Math.round(mrr * 100) / 100,
        arr: Math.round(mrr * 12 * 100) / 100,
        active_subscribers: subs.length,
        tier_breakdown: tierBreakdown,
        estimated_total_revenue: Math.round(allRevenue * 100) / 100,
        recent_events: webhooks ?? [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Action: get_usage ─────────────────────────────────────────────────────
    if (action === 'get_usage') {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

      const { data: usage7 } = await admin
        .from('user_daily_usage')
        .select('chat_count, image_count, video_count')
        .gte('date', sevenDaysAgo);

      const { data: usage30 } = await admin
        .from('user_daily_usage')
        .select('chat_count, image_count, video_count')
        .gte('date', thirtyDaysAgo);

      const sum = (rows: typeof usage7, key: 'chat_count' | 'image_count' | 'video_count') =>
        (rows ?? []).reduce((s, r) => s + (r[key] ?? 0), 0);

      // Daily breakdown for chart (last 14d)
      const { data: dailyRows } = await admin
        .from('user_daily_usage')
        .select('date, chat_count, image_count, video_count')
        .gte('date', sevenDaysAgo)
        .order('date', { ascending: true });

      const dateMap: Record<string, { date: string; chat: number; images: number; videos: number }> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        dateMap[d] = { date: d.slice(5), chat: 0, images: 0, videos: 0 };
      }
      for (const r of (dailyRows ?? [])) {
        if (dateMap[r.date]) {
          dateMap[r.date].chat += r.chat_count ?? 0;
          dateMap[r.date].images += r.image_count ?? 0;
          dateMap[r.date].videos += r.video_count ?? 0;
        }
      }

      return new Response(JSON.stringify({
        chat_7d: sum(usage7, 'chat_count'),
        image_7d: sum(usage7, 'image_count'),
        video_7d: sum(usage7, 'video_count'),
        chat_30d: sum(usage30, 'chat_count'),
        image_30d: sum(usage30, 'image_count'),
        video_30d: sum(usage30, 'video_count'),
        daily: Object.values(dateMap),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[admin-users] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
