/**
 * token-ops edge function
 * Handles ALL token mutations server-side — never trust the client.
 *
 * Actions:
 *  - balance       : get current balance + streak + badges
 *  - signup-bonus  : award 1,000 tokens to new verified user (once per user/device/IP)
 *  - daily-login   : claim daily streak reward
 *  - spend         : deduct tokens for AI actions
 *  - referral-apply: apply referral code at signup
 *  - packages      : list available token packages
 *  - purchase-link : create Stripe checkout for token package
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const DAILY_REWARDS = [50, 75, 100, 125, 150, 175, 250]; // day 1-7
const WEEKLY_BONUS  = 500;
const MONTHLY_BONUS = 2500;
const SIGNUP_BONUS  = 1000;
const REFERRAL_REFERRER = 250;
const REFERRAL_REFERRED = 250;
const REFERRAL_PURCHASE_PCT = 0.10; // 10% of tokens purchased

// Token costs for AI actions
const TOKEN_COSTS: Record<string, number> = {
  'chat_basic':    5,
  'chat_premium':  10,
  'image_standard': 50,
  'image_hd':       100,
  'image_ultra':    150,
  'video_4s':       300,
  'video_8s':       600,
  'video_12s':      900,
  'voice_clone':    250,
  'voice_message':  25,
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Identify caller
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  let userId: string | null = null;

  if (token) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user) userId = user.id;
  }

  const deviceId  = req.headers.get('x-device-id') ?? '';
  const clientIp  = req.headers.get('x-real-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('cf-connecting-ip')
    ?? 'unknown';

  try {
    const body = await req.json();
    const { action } = body;

    // ── balance ────────────────────────────────────────────────────────────
    if (action === 'balance') {
      if (!userId) return jsonErr('Unauthorized', 401);

      const today = new Date().toISOString().slice(0, 10);

      // Run all parallel queries simultaneously — reduce round-trips and avoid 499 timeouts
      const [tokRow, streakRow, badgesRow, txRow, refResult] = await Promise.all([
        supabaseAdmin.from('user_tokens').select('balance,lifetime_earned,lifetime_spent').eq('user_id', userId).maybeSingle(),
        supabaseAdmin.from('daily_streaks').select('current_streak,longest_streak,total_claims,last_claim_date').eq('user_id', userId).maybeSingle(),
        supabaseAdmin.from('user_badges').select('badge_id').eq('user_id', userId),
        supabaseAdmin.from('token_transactions')
          .select('id,amount,type,description,created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabaseAdmin
          .from('referrals')
          .select('id,status,referred_id,referrer_reward,created_at')
          .eq('referrer_id', userId),
      ]);

      const lastClaim = streakRow.data?.last_claim_date ?? null;
      const canClaimToday = !lastClaim || lastClaim < today;

      return json({
        balance:         tokRow.data?.balance ?? 0,
        lifetimeEarned:  tokRow.data?.lifetime_earned ?? 0,
        lifetimeSpent:   tokRow.data?.lifetime_spent ?? 0,
        streak: {
          current:      streakRow.data?.current_streak ?? 0,
          longest:      streakRow.data?.longest_streak ?? 0,
          totalClaims:  streakRow.data?.total_claims ?? 0,
          lastClaim,
          canClaimToday,
          todayReward:  dailyReward(streakRow.data?.current_streak ?? 0),
        },
        badges:        (badgesRow.data ?? []).map((b: { badge_id: string }) => b.badge_id),
        transactions:  txRow.data ?? [],
        referrals: {
          count:  refResult.data?.length ?? 0,
          rows:   refResult.data ?? [],
        },
      });
    }

    // ── signup-bonus ───────────────────────────────────────────────────────
    if (action === 'signup-bonus') {
      if (!userId) return jsonErr('Unauthorized', 401);

      // One per user
      const { data: existing } = await supabaseAdmin
        .from('signup_bonuses').select('user_id').eq('user_id', userId).maybeSingle();
      if (existing) return json({ alreadyClaimed: true, bonus: 0 });

      // Device abuse check: has this device already claimed?
      if (deviceId) {
        const { data: deviceClaim } = await supabaseAdmin
          .from('signup_bonuses').select('user_id').eq('device_id', deviceId).maybeSingle();
        if (deviceClaim) return json({ alreadyClaimed: true, bonus: 0, reason: 'device' });
      }

      // IP abuse check: max 3 signups per IP (skip localhost)
      const isLocalIp = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'unknown';
      if (!isLocalIp) {
        const { data: ipClaims } = await supabaseAdmin
          .from('signup_bonuses').select('user_id').eq('ip_address', clientIp);
        if ((ipClaims?.length ?? 0) >= 3) {
          return json({ alreadyClaimed: true, bonus: 0, reason: 'ip' });
        }
      }

      // Check if the DB trigger (handle_new_user) already credited tokens for signup
      // Avoid double-granting: trigger inserts a 'signup_bonus' transaction on auth.users insert
      const { data: existingTx } = await supabaseAdmin
        .from('token_transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'signup_bonus')
        .maybeSingle();

      // Record the bonus claim row (idempotency marker)
      await supabaseAdmin.from('signup_bonuses')
        .insert({ user_id: userId, device_id: deviceId, ip_address: clientIp })
        .then(() => {}); // ignore conflict errors silently

      if (!existingTx) {
        // Trigger did NOT grant tokens yet — grant now
        await creditTokens(supabaseAdmin, userId, SIGNUP_BONUS, 'signup_bonus', '🎁 Welcome bonus — 1,000 free tokens!', {});
      }
      // If existingTx exists, tokens were already granted by the DB trigger — no double-grant

      return json({ alreadyClaimed: false, bonus: SIGNUP_BONUS });
    }

    // ── daily-login ────────────────────────────────────────────────────────
    if (action === 'daily-login') {
      if (!userId) return jsonErr('Unauthorized', 401);

      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      const { data: streak } = await supabaseAdmin
        .from('daily_streaks').select('*').eq('user_id', userId).single();

      const lastClaim = streak?.last_claim_date ?? null;
      if (lastClaim === today) return json({ alreadyClaimed: true, streak: streak?.current_streak ?? 0 });

      const prevStreak = streak?.current_streak ?? 0;
      const newStreak  = lastClaim === yesterday ? prevStreak + 1 : 1;
      const reward     = dailyReward(newStreak - 1);

      let totalBonus = reward;
      const notes: string[] = [`Day ${newStreak} login streak — ${reward} tokens`];

      // Weekly streak bonus
      if (newStreak % 7 === 0) {
        totalBonus += WEEKLY_BONUS;
        notes.push(`7-day streak bonus — ${WEEKLY_BONUS} tokens`);
      }
      // Monthly streak bonus
      if (newStreak % 30 === 0) {
        totalBonus += MONTHLY_BONUS;
        notes.push(`30-day streak bonus — ${MONTHLY_BONUS} tokens`);
        // Award badge
        await awardBadge(supabaseAdmin, userId, 'streak_30');
      }
      if (newStreak === 7) {
        await awardBadge(supabaseAdmin, userId, 'streak_7');
      }

      const longest = Math.max(newStreak, streak?.longest_streak ?? 0);
      await Promise.all([
        supabaseAdmin.from('daily_streaks').upsert({
          user_id:        userId,
          current_streak: newStreak,
          longest_streak: longest,
          last_claim_date: today,
          total_claims:   (streak?.total_claims ?? 0) + 1,
          updated_at:     new Date().toISOString(),
        }, { onConflict: 'user_id' }),
        creditTokens(supabaseAdmin, userId, totalBonus, 'daily_login', notes.join(' · '), { streak: newStreak }),
      ]);

      return json({ alreadyClaimed: false, streak: newStreak, reward: totalBonus, notes });
    }

    // ── spend ──────────────────────────────────────────────────────────────
    if (action === 'spend') {
      if (!userId) return jsonErr('Unauthorized', 401);
      const { spendType } = body;
      const cost = TOKEN_COSTS[spendType];
      if (!cost) return jsonErr(`Unknown spend type: ${spendType}`, 400);

      const { data: tok } = await supabaseAdmin
        .from('user_tokens').select('balance').eq('user_id', userId).single();
      const balance = tok?.balance ?? 0;
      if (balance < cost) {
        return json({ allowed: false, balance, required: cost, shortfall: cost - balance });
      }

      await debitTokens(supabaseAdmin, userId, cost, `spend_${spendType.split('_')[0]}`,
        `Used ${cost} tokens for ${spendType}`, { spendType });

      return json({ allowed: true, cost, balance: balance - cost });
    }

    // ── referral-apply ─────────────────────────────────────────────────────
    if (action === 'referral-apply') {
      if (!userId) return jsonErr('Unauthorized', 401);
      const { code } = body;
      if (!code) return jsonErr('code required', 400);

      // Look up referrer
      const { data: referrer } = await supabaseAdmin
        .from('user_profiles').select('id').eq('referral_code', code.toUpperCase()).maybeSingle();
      if (!referrer) return jsonErr('Invalid referral code', 404);
      if (referrer.id === userId) return jsonErr('Cannot use your own referral code', 400);

      // Ensure referred user hasn't already been referred
      const { data: existing } = await supabaseAdmin
        .from('referrals').select('id').eq('referred_id', userId).maybeSingle();
      if (existing) return json({ alreadyApplied: true });

      await Promise.all([
        supabaseAdmin.from('referrals').insert({
          referrer_id:     referrer.id,
          referred_id:     userId,
          referral_code:   code.toUpperCase(),
          status:          'completed',
          referrer_reward: REFERRAL_REFERRER,
          referred_reward: REFERRAL_REFERRED,
        }),
        creditTokens(supabaseAdmin, referrer.id, REFERRAL_REFERRER, 'referral',
          `🎉 Referral bonus — your friend joined!`, { referred_user: userId }),
        creditTokens(supabaseAdmin, userId, REFERRAL_REFERRED, 'referral',
          `🎁 Referral bonus — welcome gift!`, { referrer: referrer.id }),
      ]);

      // Increment referrer count (simple approach)
      const { data: refCount } = await supabaseAdmin
        .from('user_profiles').select('referral_count').eq('id', referrer.id).single();
      const newCount = (refCount?.referral_count ?? 0) + 1;
      await supabaseAdmin.from('user_profiles').update({ referral_count: newCount }).eq('id', referrer.id);

      // VIP Ambassador at 25 referrals
      if (newCount >= 25) {
        await awardBadge(supabaseAdmin, referrer.id, 'vip_ambassador');
      }

      return json({ applied: true, referrerBonus: REFERRAL_REFERRER, referredBonus: REFERRAL_REFERRED });
    }

    // ── packages ───────────────────────────────────────────────────────────
    if (action === 'packages') {
      const { data } = await supabaseAdmin
        .from('token_packages').select('*').eq('is_active', true).order('sort_order');
      return json({ packages: data ?? [] });
    }

    return jsonErr('Unknown action', 400);
  } catch (err) {
    console.error('token-ops error:', err);
    return jsonErr('Internal server error', 500);
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function dailyReward(streakIndex: number): number {
  const idx = Math.min(streakIndex, DAILY_REWARDS.length - 1);
  return DAILY_REWARDS[idx];
}

async function creditTokens(
  admin: ReturnType<typeof createClient>,
  userId: string,
  amount: number,
  type: string,
  description: string,
  meta: Record<string, unknown>
) {
  await Promise.all([
    admin.from('token_transactions').insert({ user_id: userId, amount, type, description, meta }),
    admin.rpc('increment_tokens', { p_user_id: userId, p_amount: amount }),
  ]);
}

async function debitTokens(
  admin: ReturnType<typeof createClient>,
  userId: string,
  amount: number,
  type: string,
  description: string,
  meta: Record<string, unknown>
) {
  await Promise.all([
    admin.from('token_transactions').insert({ user_id: userId, amount: -amount, type, description, meta }),
    admin.rpc('decrement_tokens', { p_user_id: userId, p_amount: amount }),
  ]);
}

async function awardBadge(
  admin: ReturnType<typeof createClient>,
  userId: string,
  badgeId: string
) {
  // Use upsert with ignoreDuplicates to avoid duplicate badge errors
  await admin.from('user_badges')
    .upsert({ user_id: userId, badge_id: badgeId }, { onConflict: 'user_id,badge_id', ignoreDuplicates: true });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function jsonErr(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
