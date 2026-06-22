/**
 * admin-test-event — Simulate a checkout.session.completed event
 * WITHOUT Stripe signature verification.
 *
 * ADMIN ONLY — caller must provide a valid admin JWT.
 * Runs the exact same token credit + DB write logic as stripe-webhook so the
 * full payment → token pipeline can be smoke-tested without a real charge.
 *
 * POST body:
 *  { userId: string, packageId: string }
 *
 * Supported packageIds: tokens-100, tokens-550, tokens-1150, tokens-6000,
 *                        builder-5k, builder-15k, builder-50k,
 *                        starter, creator, pro_pack, elite, titan (legacy)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

const ADMIN_EMAILS = ["mltxpro@gmail.com", "jenny@mltxpro.com", "admin@mockj.online"];

const TOKEN_PACKAGE_MAP: Record<string, {
  tokens: number;
  builderCredits?: number;
  badge?: string;
  price: number;
  label: string;
}> = {
  // Legacy
  starter:  { tokens: 500,   price: 499,   label: "MockJ Starter Pack"  },
  creator:  { tokens: 1500,  badge: "creator",     price: 999,   label: "MockJ Creator Pack" },
  pro_pack: { tokens: 5000,  badge: "pro_creator", price: 2499,  label: "MockJ Pro Pack"     },
  elite:    { tokens: 12000, badge: "elite",        price: 4999,  label: "MockJ Elite Pack"   },
  titan:    { tokens: 30000, badge: "titan",        price: 9999,  label: "MockJ Titan Pack"   },
  // Live token packs
  "tokens-100":  { tokens: 100,  price: 199,  label: "100 Tokens"   },
  "tokens-550":  { tokens: 550,  price: 799,  label: "550 Tokens"   },
  "tokens-1150": { tokens: 1150, price: 1499, label: "1,150 Tokens" },
  "tokens-6000": { tokens: 6000, price: 5999, label: "6,000 Tokens" },
  // Live builder credit packs
  "builder-5k":  { tokens: 0, builderCredits: 5000,  price: 499,  label: "5K Builder Credits"  },
  "builder-15k": { tokens: 0, builderCredits: 15000, price: 1299, label: "15K Builder Credits" },
  "builder-50k": { tokens: 0, builderCredits: 50000, price: 3999, label: "50K Builder Credits" },
};

const logStep = (step: string, d?: unknown) =>
  console.log(`[ADMIN-TEST-EVENT] ${step}${d ? " — " + JSON.stringify(d) : ""}`);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // ── Verify caller is an admin ─────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);
  if (!ADMIN_EMAILS.includes(user.email ?? "")) {
    logStep("Rejected non-admin caller", { email: user.email });
    return json({ error: "Forbidden — admin only" }, 403);
  }
  logStep("Admin verified", { email: user.email });

  // ── Parse request body ────────────────────────────────────────────────────
  let body: { userId?: string; packageId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { userId, packageId } = body;
  if (!userId || !packageId) return json({ error: "userId and packageId are required" }, 400);

  const pkgInfo = TOKEN_PACKAGE_MAP[packageId];
  if (!pkgInfo) {
    return json({
      error: `Unknown packageId '${packageId}'. Valid options: ${Object.keys(TOKEN_PACKAGE_MAP).join(", ")}`,
    }, 400);
  }

  // ── Verify target user exists ─────────────────────────────────────────────
  const { data: targetProfile, error: profileErr } = await supabase
    .from("user_profiles")
    .select("id, email, builder_credits")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr || !targetProfile) {
    logStep("Target user not found", { userId, profileErr: profileErr?.message });
    return json({ error: `User not found: ${userId}` }, 404);
  }
  logStep("Target user found", { userId, email: targetProfile.email });

  const testEventId = `evt_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fakeSessionId = `cs_test_simulated_${Date.now()}`;

  // ── Credit builder credits (if applicable) ────────────────────────────────
  let builderCreditsAwarded = 0;
  if (pkgInfo.builderCredits) {
    const current = targetProfile.builder_credits ?? 0;
    await supabase
      .from("user_profiles")
      .update({ builder_credits: current + pkgInfo.builderCredits })
      .eq("id", userId);

    await supabase.from("builder_credit_ledger").insert({
      user_id: userId,
      amount: pkgInfo.builderCredits,
      reason: `[TEST] Simulated purchase — ${pkgInfo.label}`,
      stripe_event_id: testEventId,
    });
    builderCreditsAwarded = pkgInfo.builderCredits;
    logStep("Builder credits awarded", { userId, builderCredits: pkgInfo.builderCredits });
  }

  // ── Credit tokens (if applicable) ─────────────────────────────────────────
  let tokensActuallyCredited = 0;
  if (pkgInfo.tokens > 0) {
    const { error: tokenErr } = await supabase.rpc("increment_tokens", {
      p_user_id: userId,
      p_amount: pkgInfo.tokens,
    });
    if (tokenErr) {
      logStep("Token credit RPC error", { error: tokenErr.message });
      return json({ error: `Token credit failed: ${tokenErr.message}` }, 500);
    }
    tokensActuallyCredited = pkgInfo.tokens;
    logStep("Tokens credited", { userId, tokens: pkgInfo.tokens });

    // Write token_transactions ledger entry
    const { error: txErr } = await supabase.from("token_transactions").insert({
      user_id: userId,
      amount: pkgInfo.tokens,
      type: "purchase",
      description: `[TEST] 💳 Simulated purchase — ${pkgInfo.tokens.toLocaleString()} tokens (${packageId})`,
      meta: {
        packageId,
        stripeSessionId: fakeSessionId,
        amountPaid: pkgInfo.price,
        simulated: true,
        simulatedBy: user.email,
      },
    });
    if (txErr) logStep("Transaction insert error (non-fatal)", { error: txErr.message });
  }

  // ── Award badge if applicable ─────────────────────────────────────────────
  let badgeAwarded: string | null = null;
  if (pkgInfo.badge) {
    const { error: badgeErr } = await supabase
      .from("user_badges")
      .upsert({ user_id: userId, badge_id: pkgInfo.badge }, { onConflict: "user_id,badge_id", ignoreDuplicates: true });
    if (!badgeErr) {
      badgeAwarded = pkgInfo.badge;
      logStep("Badge awarded", { badge: pkgInfo.badge, userId });
    }
  }

  // ── Write webhook_events log ──────────────────────────────────────────────
  await supabase.from("webhook_events").upsert({
    event_id: testEventId,
    type: "checkout.session.completed",
    user_id: userId,
    stripe_customer_id: null,
    payload: {
      session_id: fakeSessionId,
      package_id: packageId,
      tokens_credited: tokensActuallyCredited,
      builder_credits_credited: builderCreditsAwarded,
      badge_awarded: badgeAwarded,
      amount_total: pkgInfo.price,
      currency: "usd",
      customer_email: targetProfile.email,
      simulated: true,
      simulated_by: user.email,
    },
    processed_at: new Date().toISOString(),
  }, { onConflict: "event_id", ignoreDuplicates: true });

  // ── Read updated balance for response ─────────────────────────────────────
  const { data: tokRow } = await supabase
    .from("user_tokens")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  logStep("Test event complete", {
    userId, packageId,
    tokens: tokensActuallyCredited,
    builderCredits: builderCreditsAwarded,
    badge: badgeAwarded,
    eventId: testEventId,
  });

  return json({
    success: true,
    eventId: testEventId,
    sessionId: fakeSessionId,
    userId,
    packageId,
    packageLabel: pkgInfo.label,
    tokensCredited: tokensActuallyCredited,
    builderCreditsCredited: builderCreditsAwarded,
    badgeAwarded,
    newBalance: tokRow?.balance ?? null,
    simulatedBy: user.email,
  });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
