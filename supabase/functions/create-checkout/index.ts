import Stripe from 'https://esm.sh/stripe@18.5.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const logStep = (step: string, details?: unknown) => {
  const str = details ? ` — ${JSON.stringify(details)}` : '';
  console.log(`[create-checkout] ${step}${str}`);
};

const PRICE_MAP: Record<string, {
  priceId: string;
  mode: 'payment' | 'subscription';
  tokens?: number;
  builderCredits?: number;
  tier?: string;
  monthlyTokens?: number;
  monthlyCredits?: number;
}> = {
  'pro-monthly':   { priceId: 'price_1TfUcJLNl01u4P4rAuHdpWBJ', mode: 'subscription', tier: 'pro',   monthlyTokens: 2000,  monthlyCredits: 10000 },
  'elite-monthly': { priceId: 'price_1TKeR8LNl01u4P4reRdPYnre', mode: 'subscription', tier: 'elite', monthlyTokens: 6000,  monthlyCredits: 30000 },

  'tokens-100':    { priceId: 'price_1TjXulLNl01u4P4ryrhspzLP', mode: 'payment', tokens: 100   },
  'tokens-550':    { priceId: 'price_1TjXwMLNl01u4P4rfSim6YVu', mode: 'payment', tokens: 550   },
  'tokens-1150':   { priceId: 'price_1TjXxjLNl01u4P4rAOpG3nnw', mode: 'payment', tokens: 1150  },
  'tokens-6000':   { priceId: 'price_1TjY1MLNl01u4P4rzU0Mvvds', mode: 'payment', tokens: 6000  },

  'builder-5k':    { priceId: 'price_1Tjwv9LNl01u4P4rPY50rI0m', mode: 'payment', builderCredits: 5000  },
  'builder-15k':   { priceId: 'price_1TjwxhLNl01u4P4ryDfEpmqy', mode: 'payment', builderCredits: 15000 },
  'builder-50k':   { priceId: 'price_1TjwzNLNl01u4P4rOl36hi2F', mode: 'payment', builderCredits: 50000 },
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY not configured');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No Authorization header');
    const token = authHeader.replace('Bearer ', '');

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user?.email) throw new Error('Not authenticated');
    logStep('User authenticated', { userId: user.id, email: user.email });

    const body = await req.json();
    const packageId: string = body.packageId;
    const preferredMethod: string | undefined = body.preferredMethod;
    if (!packageId) throw new Error('packageId is required');

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers.data[0]?.id;
    logStep('Stripe customer', { customerId: customerId ?? 'new' });

    const item = PRICE_MAP[packageId];

    // DB fallback for packages not in static map
    if (!item) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      const { data: pkg } = await supabaseAdmin
        .from('token_packages')
        .select('stripe_price_id, is_subscription')
        .eq('id', packageId)
        .single();

      if (!pkg?.stripe_price_id) throw new Error(`Unknown package: ${packageId}`);
      logStep('DB fallback price resolved', { packageId, priceId: pkg.stripe_price_id });

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_email: customerId ? undefined : user.email,
        line_items: [{ price: pkg.stripe_price_id, quantity: 1 }],
        mode: pkg.is_subscription ? 'subscription' : 'payment',
        success_url: `${req.headers.get('origin') ?? 'https://mockj.app'}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.get('origin') ?? 'https://mockj.app'}/tokens`,
        metadata: { user_id: user.id, package_id: packageId },
        subscription_data: pkg.is_subscription
          ? { metadata: { user_id: user.id, package_id: packageId } }
          : undefined,
      });

      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build session params
    const origin = req.headers.get('origin') ?? 'https://mockj.app';
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: item.priceId, quantity: 1 }],
      mode: item.mode,
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/tokens`,
      metadata: { user_id: user.id, package_id: packageId },
      allow_promotion_codes: true,
    };

    if (item.mode === 'subscription') {
      sessionParams.subscription_data = {
        trial_period_days: 3,
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
        metadata: { user_id: user.id, package_id: packageId, tier: item.tier ?? 'pro' },
      };
      sessionParams.payment_method_collection = 'always';
      sessionParams.payment_method_types = ['card'];
    } else {
      // Detect US customer — Venmo is US-only and will cause a 400 on non-US accounts
      let isUsCustomer = true; // optimistic default: include venmo
      if (customerId) {
        try {
          const fullCustomer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
          const country = fullCustomer.address?.country ?? fullCustomer.shipping?.address?.country;
          if (country) isUsCustomer = country.toUpperCase() === 'US';
          logStep('Customer country detected', { country, isUsCustomer });
        } catch (e) {
          logStep('Could not retrieve customer country, defaulting to include venmo', { err: String(e) });
        }
      }

      const baseMethods: string[] = ['card', 'paypal', 'link'];
      if (isUsCustomer) {
        baseMethods.push('cashapp'); // Cash App Pay is US-only
        baseMethods.push('venmo');   // Venmo is US-only
      }

      const methodOrder: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] = preferredMethod
        ? ([preferredMethod, ...baseMethods].filter(
            (m, i, arr) => arr.indexOf(m) === i
          ) as Stripe.Checkout.SessionCreateParams.PaymentMethodType[])
        : (baseMethods as Stripe.Checkout.SessionCreateParams.PaymentMethodType[]);

      sessionParams.payment_method_types = methodOrder;
      sessionParams.payment_intent_data = {
        metadata: { user_id: user.id, package_id: packageId },
      };
      logStep('Payment method order', { methodOrder, isUsCustomer });
    }

    // Create session — auto-retry without venmo if Stripe rejects it (not enabled or non-US)
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(sessionParams);
    } catch (createErr) {
      const errMsg = createErr instanceof Error ? createErr.message : String(createErr);
      const isUsMethodErr = errMsg.toLowerCase().includes('venmo') || errMsg.toLowerCase().includes('cashapp') || errMsg.toLowerCase().includes('cash_app');
      if (isUsMethodErr && Array.isArray(sessionParams.payment_method_types)) {
        logStep('US-only payment method rejected by Stripe — retrying without venmo/cashapp', { errMsg });
        sessionParams.payment_method_types = (
          sessionParams.payment_method_types as string[]
        ).filter(m => m !== 'venmo' && m !== 'cashapp') as Stripe.Checkout.SessionCreateParams.PaymentMethodType[];
        session = await stripe.checkout.sessions.create(sessionParams);
        logStep('Retry without US-only methods succeeded');
      } else {
        throw createErr;
      }
    }
    logStep('Checkout session created', { sessionId: session.id, mode: item.mode });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[create-checkout] Error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
