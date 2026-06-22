import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${d}`);
};

// ── Price / Product → tier (live price IDs from create-checkout PRICE_MAP) ───
const PRICE_TIERS: Record<string, string> = {
  // New live price IDs
  'price_1TfUcJLNl01u4P4rAuHdpWBJ': 'pro',    // MockJ Pro  $59.99/mo
  'price_1TKeR8LNl01u4P4reRdPYnre': 'elite',  // MockJ Elite $99.99/mo
  // Legacy price IDs (keep for backward-compat)
  'price_1TfzyL2QHUxU3eIBZ8A3Hibm': 'pro',
  'price_1Tg0672QHUxU3eIBcoUuZE3Q': 'sale',
  'price_1TgHsu2QHUxU3eIBxT4YW4g0': 'plus',
  'price_1TgHsy2QHUxU3eIBC1DHjmXB': 'pro',
  'price_1TgHsz2QHUxU3eIBMmtfsbjN': 'unlimited',
};

function resolveTier(productId: string | null, priceId?: string | null): string {
  if (priceId && PRICE_TIERS[priceId]) return PRICE_TIERS[priceId];
  return productId ? 'pro' : 'free'; // unknown product → pro-level access
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Authorization header not provided");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    // ── Fast path: read from subscriptions table (written by webhook) ─────────
    const { data: dbSub } = await supabaseAdmin
      .from("subscriptions")
      .select("status, stripe_product_id, stripe_subscription_id, stripe_customer_id, price_id, current_period_end, tier")
      .eq("user_id", user.id)
      .maybeSingle();

    if (dbSub) {
      const now = new Date();

      // ── Trialing → check if trial has actually expired ──────────────────────
      if (dbSub.status === 'trialing') {
        const trialEnd = dbSub.current_period_end ? new Date(dbSub.current_period_end) : null;

        if (trialEnd && trialEnd <= now) {
          logStep("Trial expired — downgrading to free", { trialEnd: trialEnd.toISOString() });

          // Also verify with Stripe in case webhook already converted it to active
          const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
          if (stripeKey && dbSub.stripe_subscription_id) {
            try {
              const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
              const stripeSub = await stripe.subscriptions.retrieve(dbSub.stripe_subscription_id);

              if (stripeSub.status === 'active') {
                // Trial converted to paid — webhook may have been slow
                const priceId = stripeSub.items.data[0]?.price.id ?? '';
                const tier = resolveTier(typeof stripeSub.items.data[0]?.price.product === 'string' ? stripeSub.items.data[0].price.product : null, priceId);
                const subEnd = new Date(stripeSub.current_period_end * 1000).toISOString();

                await supabaseAdmin.from('subscriptions').update({
                  status: 'active', tier, price_id: priceId,
                  current_period_end: subEnd, updated_at: now.toISOString(),
                }).eq('user_id', user.id);

                logStep("Trial converted to active (Stripe confirmed)", { tier });
                return new Response(JSON.stringify({
                  subscribed: true, product_id: dbSub.stripe_product_id,
                  subscription_end: subEnd, tier, source: 'stripe_verify',
                }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
              }

              if (stripeSub.status === 'trialing') {
                // Still trialing on Stripe side — DB current_period_end might be wrong
                const realEnd = new Date(stripeSub.trial_end! * 1000);
                if (realEnd > now) {
                  logStep("Trial still valid per Stripe", { realEnd: realEnd.toISOString() });
                  await supabaseAdmin.from('subscriptions').update({
                    current_period_end: realEnd.toISOString(), updated_at: now.toISOString(),
                  }).eq('user_id', user.id);
                  const tier = dbSub.tier ?? 'pro';
                  return new Response(JSON.stringify({
                    subscribed: true, product_id: dbSub.stripe_product_id,
                    subscription_end: realEnd.toISOString(), tier, source: 'stripe_verify',
                  }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
                }
              }
            } catch (stripeErr) {
              logStep("Stripe verify error during trial check", { err: String(stripeErr) });
            }
          }

          // Trial truly expired — downgrade
          await supabaseAdmin.from('subscriptions').update({
            status: 'canceled', tier: 'free', updated_at: now.toISOString(),
          }).eq('user_id', user.id);

          return new Response(JSON.stringify({
            subscribed: false, product_id: null, subscription_end: null, tier: 'free',
            source: 'db', trialExpired: true,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
        }

        // Trial still valid
        const tier = dbSub.tier ?? resolveTier(dbSub.stripe_product_id, dbSub.price_id);
        logStep("DB hit — trialing", { tier, trialEnd: trialEnd?.toISOString() });
        return new Response(JSON.stringify({
          subscribed: true, product_id: dbSub.stripe_product_id,
          subscription_end: dbSub.current_period_end, tier, source: 'db',
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
      }

      // ── Active subscription ─────────────────────────────────────────────────
      if (dbSub.status === 'active') {
        // Double-check: if period_end is in the past, re-verify with Stripe
        const periodEnd = dbSub.current_period_end ? new Date(dbSub.current_period_end) : null;
        if (periodEnd && periodEnd < now) {
          logStep("Active sub period_end in past — re-verifying with Stripe");
          // Fall through to Stripe slow path below
        } else {
          const tier = dbSub.tier ?? resolveTier(dbSub.stripe_product_id, dbSub.price_id);
          logStep("DB hit — active", { tier });
          return new Response(JSON.stringify({
            subscribed: true, product_id: dbSub.stripe_product_id,
            subscription_end: dbSub.current_period_end, tier, source: 'db',
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
        }
      }

      // ── Definitively cancelled/inactive ────────────────────────────────────
      if (dbSub.status === 'canceled' || dbSub.status === 'inactive') {
        logStep("DB hit — cancelled/inactive");
        return new Response(JSON.stringify({
          subscribed: false, product_id: null, subscription_end: null, tier: 'free', source: 'db',
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
      }

      logStep("DB hit but needs Stripe check", { status: dbSub.status });
    } else {
      logStep("No DB row — checking Stripe");
    }

    // ── Slow path: check Stripe directly ─────────────────────────────────────
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      logStep("STRIPE_SECRET_KEY not set");
      return new Response(JSON.stringify({ subscribed: false, product_id: null, subscription_end: null, tier: 'free' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find Stripe customer by email — deduplicate: pick the one with active sub if multiple
    const customers = await stripe.customers.list({ email: user.email, limit: 5 });
    if (customers.data.length === 0) {
      logStep("No Stripe customer found");
      return new Response(JSON.stringify({ subscribed: false, product_id: null, subscription_end: null, tier: 'free' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });
    }

    // Check all customers for active/trialing subscriptions
    let activeSub: Stripe.Subscription | null = null;
    let activeCustomerId = customers.data[0].id;

    for (const customer of customers.data) {
      const subs = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 5 });
      const found = subs.data.find(s => s.status === 'active' || s.status === 'trialing');
      if (found) {
        activeSub = found;
        activeCustomerId = customer.id;
        break;
      }
    }

    if (!activeSub) {
      logStep("No active/trialing Stripe subscription across all customer records");
      return new Response(JSON.stringify({ subscribed: false, product_id: null, subscription_end: null, tier: 'free', source: 'stripe' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });
    }

    const item = activeSub.items.data[0];
    const priceId = item?.price.id ?? '';
    const productId = typeof item?.price.product === 'string' ? item.price.product : null;
    const tier = resolveTier(productId, priceId);

    // Determine end date (trial_end for trialing, current_period_end for active)
    const endTimestamp = activeSub.status === 'trialing' && activeSub.trial_end
      ? activeSub.trial_end
      : activeSub.current_period_end;
    const subscriptionEnd = new Date(endTimestamp * 1000).toISOString();

    logStep("Stripe sub found", { status: activeSub.status, tier, productId });

    // Back-fill DB for fast future reads
    await supabaseAdmin.from("subscriptions").upsert({
      user_id: user.id,
      user_email: user.email,
      stripe_customer_id: activeCustomerId,
      stripe_subscription_id: activeSub.id,
      stripe_product_id: productId,
      price_id: priceId,
      status: activeSub.status,
      tier,
      current_period_end: subscriptionEnd,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    return new Response(JSON.stringify({
      subscribed: true, product_id: productId,
      subscription_end: subscriptionEnd, tier, source: 'stripe',
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("Error", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
