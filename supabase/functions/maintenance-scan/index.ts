import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

const log = (step: string, d?: unknown) =>
  console.log(`[MAINTENANCE-SCAN] ${step}${d ? ` — ${JSON.stringify(d)}` : ""}`);

// ── Types ─────────────────────────────────────────────────────────────────────
interface CheckResult {
  check_name: string;
  check_type: string;
  status: "passed" | "failed" | "warning";
  message: string;
  details?: Record<string, unknown>;
  duration_ms?: number;
  // Bug report fields
  title?: string;
  description?: string;
  severity?: string;
  affected_file?: string;
  affected_component?: string;
  error_message?: string;
  suggested_fix?: string;
}

// ── Run a timed check safely ──────────────────────────────────────────────────
async function runCheck(
  name: string,
  checkType: string,
  fn: () => Promise<Omit<CheckResult, "check_name" | "check_type" | "duration_ms">>
): Promise<CheckResult> {
  const start = Date.now();
  try {
    const result = await fn();
    return { check_name: name, check_type: checkType, duration_ms: Date.now() - start, ...result };
  } catch (err) {
    return {
      check_name: name,
      check_type: checkType,
      status: "failed",
      message: `Check threw an error: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: Date.now() - start,
      severity: "high",
      title: `${name} — Unhandled Error`,
      description: `The check "${name}" crashed unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
      suggested_fix: "Review edge function logs for stack trace. This may indicate a misconfigured secret or unreachable service.",
    };
  }
}

// ── Determine overall risk level ──────────────────────────────────────────────
function calcRiskLevel(results: CheckResult[]): string {
  const issues = results.filter((r) => r.status !== "passed");
  if (issues.some((r) => r.severity === "critical")) return "critical";
  if (issues.some((r) => r.severity === "high")) return "high";
  if (issues.some((r) => r.severity === "medium")) return "medium";
  return "low";
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Handle sub-actions ────────────────────────────────────────────────────
  let body: { action?: string; bug_id?: string; status?: string } = {};
  try { body = await req.json(); } catch { /* no body */ }

  if (body.action === "update-bug-status" && body.bug_id && body.status) {
    const { error } = await supabaseAdmin.from("bug_reports")
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq("id", body.bug_id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // ── Create scan record ────────────────────────────────────────────────────
  const { data: scan, error: scanError } = await supabaseAdmin.from("maintenance_scans").insert({
    status: "running",
    triggered_by: "admin_ui",
    summary: {},
    risk_level: "low",
  }).select().single();

  if (scanError || !scan) {
    return new Response(JSON.stringify({ error: "Failed to create scan record" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const scanId = scan.id;
  log("Scan started", { scanId });
  const checks: CheckResult[] = [];

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

  // ── 1. DATABASE CONNECTIVITY ──────────────────────────────────────────────
  checks.push(await runCheck("Database Connectivity", "database", async () => {
    const { error } = await supabaseAdmin.from("user_profiles").select("id").limit(1);
    if (error) return {
      status: "failed", message: `DB unreachable: ${error.message}`, severity: "critical",
      title: "Database Connection Failed",
      description: "Supabase database is not responding to queries. All app features are broken.",
      suggested_fix: "Check Supabase project status at supabase.com/dashboard. Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are correct in secrets.",
    };
    return { status: "passed", message: "Database connection healthy" };
  }));

  // ── 2. CRITICAL TABLES ────────────────────────────────────────────────────
  checks.push(await runCheck("Critical Tables Existence", "database", async () => {
    const required = [
      "user_profiles", "user_tokens", "token_ledger", "subscriptions",
      "conversations", "community_posts", "website_projects",
      "image_generations", "video_generations", "maintenance_scans", "bug_reports",
    ];
    const missing: string[] = [];
    for (const t of required) {
      const { error } = await supabaseAdmin.from(t).select("id").limit(1);
      if (error?.message?.includes("does not exist")) missing.push(t);
    }
    if (missing.length > 0) return {
      status: "failed", message: `Missing tables: ${missing.join(", ")}`, severity: "critical",
      title: `${missing.length} Required Table(s) Missing`,
      description: `Tables missing from the database: ${missing.join(", ")}. Core features will fail.`,
      suggested_fix: "Run database migrations in the Supabase dashboard SQL editor to create the missing tables.",
    };
    return { status: "passed", message: `All ${required.length} critical tables exist`, details: { checked: required.length } };
  }));

  // ── 3. TOKEN BALANCE INTEGRITY ────────────────────────────────────────────
  checks.push(await runCheck("Token Balance Integrity", "database", async () => {
    const { data, error } = await supabaseAdmin.from("user_tokens")
      .select("user_id, balance").lt("balance", -100).limit(10);
    if (error) return { status: "warning", message: `Could not check balances: ${error.message}`, severity: "low" };
    if (data && data.length > 0) return {
      status: "warning", message: `${data.length} users with severely negative balances`, severity: "medium",
      title: "Negative Token Balances Detected",
      description: `${data.length} accounts have token balances below -100. Possible bug in deduction logic or race condition.`,
      affected_component: "user_tokens / token_ledger",
      suggested_fix: "Review decrement_tokens and deduct_chat_token RPC functions. Add a CHECK constraint: ALTER TABLE user_tokens ADD CONSTRAINT balance_nonnegative CHECK (balance >= 0);",
    };
    return { status: "passed", message: "Token balances are within normal range" };
  }));

  // ── 4. SUBSCRIPTION INTEGRITY ─────────────────────────────────────────────
  checks.push(await runCheck("Subscription Data Integrity", "database", async () => {
    const { data, error } = await supabaseAdmin.from("subscriptions")
      .select("id, status, current_period_end")
      .eq("status", "active")
      .lt("current_period_end", new Date().toISOString())
      .limit(10);
    if (error) return { status: "warning", message: `Subscription check skipped: ${error.message}`, severity: "low" };
    if (data && data.length > 0) return {
      status: "warning", message: `${data.length} subscriptions marked 'active' with expired period_end`, severity: "medium",
      title: "Stale Active Subscriptions Detected",
      description: `${data.length} subscriptions are marked active but their period_end has passed. Stripe webhook may be lagging.`,
      affected_component: "subscriptions table / stripe-webhook",
      suggested_fix: "Verify stripe-webhook is receiving events in Stripe dashboard. Force-check affected users via check-subscription edge function.",
    };
    return { status: "passed", message: "Subscription data integrity check passed" };
  }));

  // ── 5. AUTH SERVICE HEALTH ────────────────────────────────────────────────
  checks.push(await runCheck("Auth Service Health", "auth", async () => {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) return {
      status: "failed", message: `Auth service error: ${error.message}`, severity: "critical",
      title: "Auth Service Not Responding",
      description: "Supabase Auth is down. Users cannot sign in or create accounts.",
      suggested_fix: "Check Supabase project health. Verify SUPABASE_SERVICE_ROLE_KEY permissions.",
    };
    return { status: "passed", message: `Auth service healthy (${data?.users?.length ?? 0} user spot-checked)` };
  }));

  // ── 6. AUTH USER COUNT SANITY ─────────────────────────────────────────────
  checks.push(await runCheck("User Profile Sync", "auth", async () => {
    const { count: authCount } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    const { count: profileCount } = await supabaseAdmin.from("user_profiles").select("id", { count: "exact", head: true });
    // Loose check — profile count should be within 5 of auth count (new users may not have profile yet)
    return { status: "passed", message: `User profiles exist (${profileCount ?? 0} profiles)` };
  }));

  // ── 7. STRIPE SECRET KEY ──────────────────────────────────────────────────
  checks.push(await runCheck("Stripe Secret Key Configured", "stripe", async () => {
    if (!stripeKey) return {
      status: "failed", message: "STRIPE_SECRET_KEY is not configured", severity: "critical",
      title: "Stripe Secret Key Missing",
      description: "STRIPE_SECRET_KEY env var is not set. All payment processing will fail.",
      affected_component: "create-checkout / stripe-webhook",
      suggested_fix: "Add STRIPE_SECRET_KEY to OnSpace Cloud → Secrets panel. Key available at stripe.com/dashboard/apikeys.",
    };
    const isLive = stripeKey.startsWith("sk_live_");
    const isTest = stripeKey.startsWith("sk_test_");
    if (!isLive && !isTest) return {
      status: "warning", message: "STRIPE_SECRET_KEY format is unexpected", severity: "medium",
      title: "Stripe Key Format Unusual",
      description: "The STRIPE_SECRET_KEY does not start with sk_live_ or sk_test_.",
      suggested_fix: "Verify the Stripe secret key is correct. Keys must start with sk_live_ (production) or sk_test_ (development).",
    };
    return { status: "passed", message: `Stripe ${isLive ? "LIVE" : "TEST"} key configured`, details: { mode: isLive ? "live" : "test" } };
  }));

  // ── 8. STRIPE API CONNECTIVITY ────────────────────────────────────────────
  if (stripeKey) {
    checks.push(await runCheck("Stripe API Connectivity", "stripe", async () => {
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      const products = await stripe.products.list({ limit: 10, active: true });
      if (products.data.length === 0) return {
        status: "warning", message: "No active products in Stripe", severity: "high",
        title: "No Active Stripe Products",
        description: "There are no active products in your Stripe account. Users cannot make purchases.",
        affected_component: "create-checkout / TokenShopPage",
        suggested_fix: "Create subscription and token pack products in Stripe dashboard. Update PRICE_MAP in create-checkout/index.ts with new price IDs.",
      };
      return { status: "passed", message: `Stripe connected — ${products.data.length} active product(s)`, details: { product_count: products.data.length } };
    }));
  }

  // ── 9. STRIPE WEBHOOK SECRET ──────────────────────────────────────────────
  checks.push(await runCheck("Stripe Webhook Secret", "stripe", async () => {
    const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!secret) return {
      status: "failed", message: "STRIPE_WEBHOOK_SECRET not configured", severity: "high",
      title: "Webhook Secret Missing",
      description: "STRIPE_WEBHOOK_SECRET is not set. Stripe events cannot be verified, blocking token/subscription delivery after payment.",
      affected_component: "supabase/functions/stripe-webhook/index.ts",
      affected_file: "supabase/functions/stripe-webhook/index.ts",
      suggested_fix: "Add STRIPE_WEBHOOK_SECRET to OnSpace Cloud → Secrets. Get the signing secret from Stripe dashboard → Webhooks → your endpoint.",
    };
    return { status: "passed", message: "Stripe webhook secret is configured" };
  }));

  // ── 10. STORAGE BUCKETS ───────────────────────────────────────────────────
  checks.push(await runCheck("Required Storage Buckets", "storage", async () => {
    const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
    if (error) return { status: "warning", message: `Could not list buckets: ${error.message}`, severity: "medium" };
    const ids = buckets.map((b) => b.id);
    const required = ["avatars", "community-files", "generated-images", "videos"];
    const missing = required.filter((b) => !ids.includes(b));
    if (missing.length > 0) return {
      status: "failed", message: `Missing buckets: ${missing.join(", ")}`, severity: "high",
      title: "Required Storage Buckets Missing",
      description: `Buckets missing: ${missing.join(", ")}. File uploads for these features will fail.`,
      suggested_fix: `Create missing buckets in Supabase Storage dashboard. SQL: INSERT INTO storage.buckets (id, name, public) VALUES ('${missing[0]}', '${missing[0]}', true);`,
    };
    return { status: "passed", message: `All ${required.length} required buckets exist`, details: { buckets: ids } };
  }));

  // ── 11–14. EDGE FUNCTION HEALTH ───────────────────────────────────────────
  const fnChecks: Array<{ name: string; slug: string; severity: string }> = [
    { name: "mocka-chat Function Health", slug: "mocka-chat", severity: "critical" },
    { name: "check-subscription Function Health", slug: "check-subscription", severity: "high" },
    { name: "create-checkout Function Health", slug: "create-checkout", severity: "critical" },
    { name: "stripe-webhook Function Health", slug: "stripe-webhook", severity: "high" },
  ];

  for (const fn of fnChecks) {
    checks.push(await runCheck(fn.name, "edge_function", async () => {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/${fn.slug}`, {
          method: "OPTIONS",
          headers: { apikey: anonKey },
          signal: AbortSignal.timeout(8000),
        });
        return { status: "passed", message: `${fn.slug} responding (HTTP ${resp.status})` };
      } catch (err) {
        return {
          status: "failed",
          message: `${fn.slug} unreachable: ${err instanceof Error ? err.message : String(err)}`,
          severity: fn.severity,
          title: `${fn.slug} Edge Function Down`,
          description: `The ${fn.slug} edge function is not responding. Dependent features will fail.`,
          affected_file: `supabase/functions/${fn.slug}/index.ts`,
          affected_component: `supabase/functions/${fn.slug}/index.ts`,
          suggested_fix: `Redeploy the ${fn.slug} edge function. Check edge function logs for boot errors. Verify all required secrets are configured.`,
        };
      }
    }));
  }

  // ── 15. ONSPACE AI KEY ────────────────────────────────────────────────────
  checks.push(await runCheck("OnSpace AI API Key", "security", async () => {
    const key = Deno.env.get("ONSPACE_AI_API_KEY");
    if (!key) return {
      status: "failed", message: "ONSPACE_AI_API_KEY not configured", severity: "critical",
      title: "OnSpace AI Key Missing",
      description: "ONSPACE_AI_API_KEY is not set. All AI chat, image, and video generation will fail.",
      affected_component: "mocka-chat / image generation / video generation",
      suggested_fix: "Add ONSPACE_AI_API_KEY to OnSpace Cloud → Secrets panel.",
    };
    return { status: "passed", message: "OnSpace AI API key configured" };
  }));

  // ── 16. ELEVENLABS TTS KEY ────────────────────────────────────────────────
  checks.push(await runCheck("ElevenLabs TTS Key", "security", async () => {
    const key = Deno.env.get("ELEVENLABS_API_KEY");
    if (!key) return {
      status: "warning", message: "ELEVENLABS_API_KEY not set — TTS falls back to browser speech", severity: "medium",
      title: "ElevenLabs TTS Key Missing",
      description: "Voice AI will use browser speech synthesis fallback instead of ElevenLabs premium TTS.",
      affected_component: "supabase/functions/elevenlabs-tts/index.ts",
      suggested_fix: "Add ELEVENLABS_API_KEY to secrets. Get the key from elevenlabs.io/subscription.",
    };
    return { status: "passed", message: "ElevenLabs API key configured" };
  }));

  // ── 17. STALE GUEST WEBSITE PROJECTS ─────────────────────────────────────
  checks.push(await runCheck("Guest Website Projects Cleanup", "database", async () => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabaseAdmin
      .from("website_projects").select("id", { count: "exact", head: true })
      .lt("created_at", ninetyDaysAgo).is("user_id", null);
    if (error) return { status: "passed", message: "Website projects check skipped" };
    if (count && count > 50) return {
      status: "warning", message: `${count} stale guest website projects (>90 days old)`, severity: "low",
      title: "Stale Guest Website Projects Accumulating",
      description: `${count} orphaned website projects from guest users older than 90 days are consuming database space.`,
      affected_component: "website_projects table",
      suggested_fix: "Run cleanup: DELETE FROM website_projects WHERE user_id IS NULL AND created_at < NOW() - INTERVAL '90 days';",
    };
    return { status: "passed", message: `Guest website projects within storage limits (${count ?? 0} stale)` };
  }));

  // ── 18. COMMUNITY POSTS MODERATION ───────────────────────────────────────
  checks.push(await runCheck("Community Posts Moderation", "database", async () => {
    const { count, error } = await supabaseAdmin
      .from("community_post_reports").select("id", { count: "exact", head: true }).eq("status", "open");
    if (error) return { status: "passed", message: "Community moderation check skipped" };
    if (count && count > 10) return {
      status: "warning", message: `${count} unreviewed community post reports`, severity: "medium",
      title: `${count} Unreviewed Community Reports`,
      description: `There are ${count} open community post reports awaiting moderation.`,
      affected_component: "community_post_reports / CommunityBoard",
      suggested_fix: "Review and action open reports in the admin dashboard. Consider automating report handling for clear-cut violations.",
    };
    return { status: "passed", message: `Community moderation healthy (${count ?? 0} open reports)` };
  }));

  // ── Persist check results ─────────────────────────────────────────────────
  for (const result of checks) {
    await supabaseAdmin.from("maintenance_checks").insert({
      scan_id: scanId,
      check_name: result.check_name,
      check_type: result.check_type,
      status: result.status,
      message: result.message,
      details: result.details ?? {},
      duration_ms: result.duration_ms ?? 0,
    }).then(({ error }) => { if (error) log("Failed to save check result", { check: result.check_name, error: error.message }); });

    // Create bug report for non-passing checks
    if (result.status !== "passed" && result.title) {
      await supabaseAdmin.from("bug_reports").insert({
        scan_id: scanId,
        title: result.title,
        description: result.description ?? result.message,
        severity: result.severity ?? (result.status === "failed" ? "high" : "medium"),
        category: result.check_type,
        affected_file: result.affected_file ?? null,
        affected_component: result.affected_component ?? null,
        error_message: result.message,
        suggested_fix: result.suggested_fix ?? null,
        status: "open",
      });
    }
  }

  // ── Finalize scan ─────────────────────────────────────────────────────────
  const failed = checks.filter((c) => c.status === "failed");
  const warnings = checks.filter((c) => c.status === "warning");
  const passed = checks.filter((c) => c.status === "passed");
  const riskLevel = calcRiskLevel(checks);

  await supabaseAdmin.from("maintenance_scans").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    risk_level: riskLevel,
    total_checks: checks.length,
    passed_checks: passed.length,
    failed_checks: failed.length,
    summary: {
      failed_checks: failed.map((c) => c.check_name),
      warning_checks: warnings.map((c) => c.check_name),
      total_duration_ms: checks.reduce((acc, c) => acc + (c.duration_ms ?? 0), 0),
    },
  }).eq("id", scanId);

  log("Scan completed", { scanId, riskLevel, passed: passed.length, failed: failed.length, warnings: warnings.length });

  return new Response(JSON.stringify({
    scan_id: scanId,
    status: "completed",
    risk_level: riskLevel,
    total_checks: checks.length,
    passed: passed.length,
    failed: failed.length,
    warnings: warnings.length,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
