import Stripe from 'https://esm.sh/stripe@18.5.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const log = (step: string, d?: unknown) =>
  console.log(`[stripe-webhook] ${step}${d ? ' — ' + JSON.stringify(d) : ''}`);

// ── Package registry: price_id → tokens / builder credits / tier ─────────────
const PRICE_REGISTRY: Record<string, {
  tokens?: number; builderCredits?: number; tier?: string;
  monthlyTokens?: number; monthlyCredits?: number;
}> = {
  // Token packs (live)
  'price_1TjXulLNl01u4P4ryrhspzLP': { tokens: 100   },
  'price_1TjXwMLNl01u4P4rfSim6YVu': { tokens: 550   },
  'price_1TjXxjLNl01u4P4rAOpG3nnw': { tokens: 1150  },
  'price_1TjY1MLNl01u4P4rzU0Mvvds': { tokens: 6000  },
  // Builder credit packs (live)
  'price_1Tjwv9LNl01u4P4rPY50rI0m': { builderCredits: 5000  },
  'price_1TjwxhLNl01u4P4ryDfEpmqy': { builderCredits: 15000 },
  'price_1TjwzNLNl01u4P4rOl36hi2F': { builderCredits: 50000 },
  // Subscriptions (live)
  'price_1TfUcJLNl01u4P4rAuHdpWBJ': { tier: 'pro',   monthlyTokens: 2000,  monthlyCredits: 10000 },
  'price_1TKeR8LNl01u4P4reRdPYnre': { tier: 'elite', monthlyTokens: 6000,  monthlyCredits: 30000 },
};

async function resolvePackageFromDB(
  supabaseAdmin: ReturnType<typeof createClient>,
  priceId: string
) {
  const { data } = await supabaseAdmin
    .from('token_packages')
    .select('id, tokens, is_subscription')
    .eq('stripe_price_id', priceId)
    .single();
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const stripeKey     = Deno.env.get('STRIPE_SECRET_KEY');

  log('Secrets loaded', {
    webhookSecretPresent: !!webhookSecret,
    webhookSecretLen: webhookSecret?.length ?? 0,
    webhookSecretPrefix: webhookSecret ? webhookSecret.slice(0, 6) + '…' : 'MISSING',
    stripeKeyPresent: !!stripeKey,
    stripeKeyPrefix: stripeKey ? stripeKey.slice(0, 7) + '…' : 'MISSING',
  });

  if (!webhookSecret || !stripeKey) {
    log('Missing secrets');
    return new Response('Server misconfigured', { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // ── Verify Stripe signature ───────────────────────────────────────────────
  const sig = req.headers.get('stripe-signature');
  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig!, webhookSecret);
  } catch (err) {
    log('Signature verification failed', { err: String(err) });
    return new Response(`Webhook Error: ${err}`, { status: 400 });
  }

  log('Event received', { type: event.type, id: event.id });

  // ── Idempotency ───────────────────────────────────────────────────────────
  const { data: existing } = await supabaseAdmin
    .from('webhook_events')
    .select('id')
    .eq('event_id', event.id)
    .single();

  if (existing) {
    log('Duplicate event — skipped', { eventId: event.id });
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Resolve user_id ───────────────────────────────────────────────────────
  async function resolveUserId(customerId: string, metaUserId?: string): Promise<string | null> {
    if (metaUserId) return metaUserId;
    try {
      const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
      if (!customer.email) return null;
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      const match = users.find(u => u.email === customer.email);
      return match?.id ?? null;
    } catch (e) {
      log('resolveUserId error', { err: String(e) });
      return null;
    }
  }

  // ── Credit tokens ─────────────────────────────────────────────────────────
  async function creditTokens(
    userId: string, amount: number, reason: string, stripeEventId: string,
    extra?: Record<string, unknown>
  ) {
    await supabaseAdmin.from('user_tokens').upsert(
      { user_id: userId, balance: 0, lifetime_earned: 0, lifetime_spent: 0 },
      { onConflict: 'user_id', ignoreDuplicates: true }
    );
    const { error: rpcErr } = await supabaseAdmin.rpc('increment_tokens', {
      p_user_id: userId, p_amount: amount,
    });
    if (rpcErr) { log('increment_tokens error', rpcErr); return; }
    await supabaseAdmin.from('token_ledger').insert({
      user_id: userId, amount, reason, stripe_event_id: stripeEventId, ...(extra ?? {}),
    });
    log('Tokens credited', { userId, amount, reason });
  }

  // ── Credit builder credits ────────────────────────────────────────────────
  async function creditBuilderCredits(
    userId: string, amount: number, reason: string, stripeEventId: string
  ) {
    const { error: updateErr } = await supabaseAdmin.rpc('deduct_builder_credits', {
      p_user_id: userId, p_amount: -amount, // negative = add
    });
    if (updateErr) {
      // Fallback: direct update
      const { data: profile } = await supabaseAdmin
        .from('user_profiles').select('builder_credits').eq('id', userId).single();
      const current = profile?.builder_credits ?? 0;
      await supabaseAdmin
        .from('user_profiles').update({ builder_credits: current + amount }).eq('id', userId);
    }
    await supabaseAdmin.from('builder_credit_ledger').insert({
      user_id: userId, amount, reason, stripe_event_id: stripeEventId,
    });
    log('Builder credits credited', { userId, amount, reason });
  }

  // ── Log event (non-blocking, fire-and-forget) ─────────────────────────────
  supabaseAdmin.from('webhook_events').insert({
    event_id: event.id, type: event.type, payload: event,
    processed_at: new Date().toISOString(),
  }).then(({ error }) => { if (error) log('webhook_events insert error', error); });

  const OK = new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  try {

    // ════════════════════════════════════════════════════════════════════════
    // checkout.session.completed
    // ════════════════════════════════════════════════════════════════════════
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = typeof session.customer === 'string'
        ? session.customer
        : (session.customer as Stripe.Customer)?.id ?? '';
      const metaUserId = session.metadata?.user_id ?? undefined;

      // ── Subscription checkout: write initial DB row immediately ────────────
      if (session.mode === 'subscription') {
        const subId = typeof session.subscription === 'string'
          ? session.subscription
          : (session.subscription as Stripe.Subscription)?.id ?? null;
        const userId = await resolveUserId(customerId, metaUserId);

        if (userId && subId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subId);
            const priceId  = sub.items.data[0]?.price.id ?? '';
            const productId = typeof sub.items.data[0]?.price.product === 'string'
              ? sub.items.data[0].price.product : '';
            const reg = PRICE_REGISTRY[priceId];
            const tier = reg?.tier ?? session.metadata?.tier ?? 'pro';
            const endTs = (sub.status === 'trialing' && sub.trial_end)
              ? sub.trial_end : sub.current_period_end;
            const periodEnd = new Date(endTs * 1000).toISOString();

            await supabaseAdmin.from('subscriptions').upsert({
              user_id: userId,
              user_email: session.customer_details?.email ?? '',
              stripe_customer_id: customerId,
              stripe_subscription_id: subId,
              stripe_product_id: productId,
              price_id: priceId,
              status: sub.status,
              tier,
              current_period_end: periodEnd,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });
            log('Sub row written on checkout.session.completed', { userId, status: sub.status, tier, periodEnd });
          } catch (subErr) {
            log('Could not retrieve sub on checkout complete', { err: String(subErr) });
          }
        }
        return OK;
      }

      // ── One-time payment ──────────────────────────────────────────────────
      const userId = await resolveUserId(customerId, metaUserId);
      if (!userId) {
        log('No user found for one-time session', { sessionId: session.id });
        return OK;
      }

      const packageId = session.metadata?.package_id ?? '';

      // Expand line_items to get the actual price ID — webhook events don't include
      // line_items by default, so we must retrieve the session to get the price.
      let priceId = '';
      try {
        const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ['line_items'],
        });
        priceId = expandedSession.line_items?.data?.[0]?.price?.id ?? '';
        log('Expanded session line_item price', { priceId, packageId });
      } catch (e) {
        log('Could not expand line_items, falling back to metadata', { err: String(e) });
      }

      let reg = PRICE_REGISTRY[priceId] ?? null;
      if (!reg && packageId) {
        const dbPkg = await resolvePackageFromDB(supabaseAdmin, priceId);
        if (dbPkg) reg = { tokens: dbPkg.tokens };
      }
      // Last resort: derive from packageId
      if (!reg && packageId) {
        if (packageId === 'tokens-100')  reg = { tokens: 100 };
        else if (packageId === 'tokens-550')  reg = { tokens: 550 };
        else if (packageId === 'tokens-1150') reg = { tokens: 1150 };
        else if (packageId === 'tokens-6000') reg = { tokens: 6000 };
        else if (packageId === 'builder-5k')  reg = { builderCredits: 5000 };
        else if (packageId === 'builder-15k') reg = { builderCredits: 15000 };
        else if (packageId === 'builder-50k') reg = { builderCredits: 50000 };
      }

      if (reg?.tokens) {
        await creditTokens(userId, reg.tokens, `Token pack: ${packageId}`, event.id, { stripe_session_id: session.id });
      } else if (reg?.builderCredits) {
        await creditBuilderCredits(userId, reg.builderCredits, `Builder credit pack: ${packageId}`, event.id);
      } else {
        log('No registry match — fallback 100 tokens', { priceId, packageId });
        await creditTokens(userId, 100, `Token pack (fallback): ${packageId}`, event.id, { stripe_session_id: session.id });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // invoice.paid — monthly token grant for subscriptions
    // ════════════════════════════════════════════════════════════════════════
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : '';
      const subId = typeof invoice.subscription === 'string' ? invoice.subscription : '';
      const userId = await resolveUserId(customerId);
      if (!userId) { log('No user for invoice.paid', { customerId }); return OK; }

      const sub = subId ? await stripe.subscriptions.retrieve(subId) : null;
      const priceId = sub?.items.data[0]?.price.id ?? '';
      const reg = PRICE_REGISTRY[priceId];
      const tier = reg?.tier ?? sub?.metadata?.tier ?? 'pro';

      log('invoice.paid', { userId, subId, tier, priceId });

      // Sync subscription table → active
      if (sub) {
        await supabaseAdmin.from('subscriptions').upsert({
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subId,
          price_id: priceId,
          status: 'active',
          tier,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'stripe_subscription_id' });
      }

      const monthlyTokens  = reg?.monthlyTokens  ?? (tier === 'elite' ? 6000  : 2000);
      const monthlyCredits = reg?.monthlyCredits ?? (tier === 'elite' ? 30000 : 10000);
      await creditTokens(userId, monthlyTokens, `Monthly token grant — ${tier} plan`, event.id, { stripe_invoice_id: invoice.id });
      await creditBuilderCredits(userId, monthlyCredits, `Monthly builder credits — ${tier} plan`, event.id);
    }

    // ════════════════════════════════════════════════════════════════════════
    // invoice.payment_failed
    // ════════════════════════════════════════════════════════════════════════
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : '';
      const subId = typeof invoice.subscription === 'string' ? invoice.subscription : '';
      const userId = await resolveUserId(customerId);
      if (userId && subId) {
        await supabaseAdmin.from('subscriptions')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', subId);
        log('Subscription marked past_due', { userId, subId });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // customer.subscription.created / updated
    // ════════════════════════════════════════════════════════════════════════
    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : '';
      const userId = await resolveUserId(customerId, sub.metadata?.user_id);
      if (!userId) return OK;

      const priceId   = sub.items.data[0]?.price.id ?? '';
      const productId = typeof sub.items.data[0]?.price.product === 'string'
        ? sub.items.data[0].price.product : '';
      const reg  = PRICE_REGISTRY[priceId];
      const tier = reg?.tier ?? sub.metadata?.tier ?? 'pro';

      const endTs    = (sub.status === 'trialing' && sub.trial_end) ? sub.trial_end : sub.current_period_end;
      const periodEnd = new Date(endTs * 1000).toISOString();

      await supabaseAdmin.from('subscriptions').upsert({
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        price_id: priceId,
        stripe_product_id: productId,
        status: sub.status,
        tier,
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'stripe_subscription_id' });
      log('Subscription upserted', { userId, tier, status: sub.status, periodEnd });

      // ── Trial → active conversion: grant tokens if not already done via invoice.paid
      const prevAttrs = event.data.previous_attributes as Record<string, unknown> | undefined;
      if (prevAttrs?.status === 'trialing' && sub.status === 'active') {
        log('Trial → active: granting monthly tokens', { userId, tier });
        const monthlyTokens  = reg?.monthlyTokens  ?? (tier === 'elite' ? 6000  : 2000);
        const monthlyCredits = reg?.monthlyCredits ?? (tier === 'elite' ? 30000 : 10000);
        // De-duplicate: skip if invoice.paid already granted tokens in last 3 days
        const { data: recentGrant } = await supabaseAdmin
          .from('token_ledger')
          .select('id')
          .eq('user_id', userId)
          .like('reason', 'Monthly token grant%')
          .gte('created_at', new Date(Date.now() - 3 * 86400_000).toISOString())
          .maybeSingle();
        if (!recentGrant) {
          await creditTokens(userId, monthlyTokens, `Monthly token grant — ${tier} plan`, event.id);
          await creditBuilderCredits(userId, monthlyCredits, `Monthly builder credits — ${tier} plan`, event.id);
        } else {
          log('Monthly grant already issued — skipping', { userId });
        }
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // customer.subscription.deleted
    // ════════════════════════════════════════════════════════════════════════
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      await supabaseAdmin.from('subscriptions')
        .update({ status: 'canceled', tier: 'free', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', sub.id);
      log('Subscription canceled', { subId: sub.id });
    }

  } catch (handlerErr) {
    log('Handler error', { err: String(handlerErr) });
  }

  return OK;
});
