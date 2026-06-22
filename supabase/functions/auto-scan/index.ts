/**
 * auto-scan — Scheduled maintenance scan runner
 *
 * Designed to be called by an external CRON trigger (e.g. GitHub Actions schedule,
 * Render cron, or any HTTP scheduler) at 3am UTC daily.
 *
 * Accepts a shared secret via X-Auto-Scan-Secret header to prevent
 * unauthorized triggering.  Falls back to service-role auth if the
 * CRON_SECRET env var is not set (useful during initial setup).
 *
 * After the scan completes, it:
 *   1. Checks the risk level
 *   2. Notifies all admin users via the `notifications` table (shows in-app)
 *   3. Sends an email alert if risk is "high" or "critical" (requires RESEND_API_KEY)
 *   4. Stores a record in scan_alerts for audit trail
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

const log = (step: string, d?: unknown) =>
  console.log(`[AUTO-SCAN] ${step}${d ? ` — ${JSON.stringify(d)}` : ""}`);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function sendResendEmail(params: {
  to: string[];
  subject: string;
  html: string;
  resendKey: string;
}) {
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.resendKey}`,
    },
    body: JSON.stringify({
      from: "MockJ Maintenance <noreply@mockj.ai>",
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    log("Resend email failed", { err });
  } else {
    log("Alert email sent", { to: params.to });
  }
}

function buildAlertEmailHtml(params: {
  riskLevel: string;
  totalChecks: number;
  failedChecks: number;
  warnings: number;
  scanId: string;
  timestamp: string;
  failedNames: string[];
}): string {
  const riskColors: Record<string, string> = {
    low: "#22c55e",
    medium: "#f59e0b",
    high: "#f97316",
    critical: "#ef4444",
  };
  const color = riskColors[params.riskLevel] ?? "#888";
  const failedListHtml = params.failedNames.length > 0
    ? `<ul style="margin:8px 0;padding-left:20px;">${params.failedNames.map((n) => `<li style="color:#ccc;font-size:13px;">${n}</li>`).join("")}</ul>`
    : "<p style='color:#888;font-size:13px;'>No critical failures</p>";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0d0f14;color:#e8ecf0;font-family:'Inter',sans-serif;padding:32px;max-width:600px;margin:0 auto;">
  <div style="border:1px solid ${color}44;border-radius:16px;overflow:hidden;">
    <div style="background:${color}18;padding:24px;border-bottom:1px solid ${color}22;">
      <h1 style="margin:0;font-size:22px;font-weight:900;color:${color};">
        ⚠️ MockJ Maintenance Alert
      </h1>
      <p style="margin:6px 0 0;color:#888;font-size:13px;">Daily scan completed — Risk Level:
        <strong style="color:${color};">${params.riskLevel.toUpperCase()}</strong>
      </p>
    </div>
    <div style="padding:24px;background:#111318;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:8px 12px;background:#1a1d26;border-radius:8px 0 0 8px;font-size:12px;color:#888;">Total Checks</td>
          <td style="padding:8px 12px;background:#1a1d26;font-size:14px;font-weight:700;color:#e8ecf0;">${params.totalChecks}</td>
          <td style="padding:8px 12px;background:#1a1d26;font-size:12px;color:#888;">Failed</td>
          <td style="padding:8px 12px;background:#1a1d26;border-radius:0 8px 8px 0;font-size:14px;font-weight:700;color:#ef4444;">${params.failedChecks}</td>
        </tr>
      </table>

      <h3 style="font-size:13px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;">Failed Checks</h3>
      ${failedListHtml}

      <div style="margin-top:20px;padding:12px 16px;background:#0a0c10;border-radius:8px;border:1px solid #1a1d26;">
        <p style="margin:0;font-size:12px;color:#666;">
          Scan ID: <code style="color:#888;">${params.scanId}</code><br/>
          Scanned at: <span style="color:#888;">${params.timestamp}</span>
        </p>
      </div>

      <a href="https://mockj.ai/admin/maintenance"
         style="display:inline-block;margin-top:20px;padding:12px 24px;background:${color};color:#000;font-weight:900;font-size:14px;border-radius:10px;text-decoration:none;">
        View Full Report →
      </a>
    </div>
  </div>
  <p style="text-align:center;font-size:11px;color:#444;margin-top:16px;">
    MockJ AI · Automated Maintenance System · <a href="https://mockj.ai" style="color:#555;">mockj.ai</a>
  </p>
</body>
</html>`;
}

// ── Types (mirrors maintenance-scan/index.ts) ─────────────────────────────────
interface CheckResult {
  check_name: string;
  check_type: string;
  status: "passed" | "failed" | "warning";
  message: string;
  details?: Record<string, unknown>;
  duration_ms?: number;
  title?: string;
  description?: string;
  severity?: string;
  affected_file?: string;
  affected_component?: string;
  error_message?: string;
  suggested_fix?: string;
}

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
      check_name: name, check_type: checkType, status: "failed",
      message: `Check threw: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: Date.now() - start, severity: "high",
      title: `${name} — Unhandled Error`,
      description: `The check "${name}" crashed unexpectedly.`,
      suggested_fix: "Review edge function logs for details.",
    };
  }
}

function calcRiskLevel(results: CheckResult[]): string {
  const issues = results.filter((r) => r.status !== "passed");
  if (issues.some((r) => r.severity === "critical")) return "critical";
  if (issues.some((r) => r.severity === "high")) return "high";
  if (issues.some((r) => r.severity === "medium")) return "medium";
  return "low";
}

// ── Main handler ───────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── Secret auth for cron callers ──────────────────────────────────────────
  const cronSecret = Deno.env.get("CRON_SECRET");
  const incomingSecret = req.headers.get("X-Auto-Scan-Secret");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (cronSecret && incomingSecret !== cronSecret) {
    // Also allow service-role JWT as fallback
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.includes(serviceRoleKey.slice(0, 20))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey,
    { auth: { persistSession: false } }
  );

  log("Auto-scan triggered");

  // ── Create scan record ────────────────────────────────────────────────────
  const { data: scan, error: scanError } = await supabaseAdmin
    .from("maintenance_scans").insert({
      status: "running",
      triggered_by: "auto_cron",
      summary: {},
      risk_level: "low",
    }).select().single();

  if (scanError || !scan) {
    return new Response(JSON.stringify({ error: "Failed to create scan" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const scanId = scan.id;
  const checks: CheckResult[] = [];
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

  // ── Run all health checks ─────────────────────────────────────────────────
  // 1. DB connectivity
  checks.push(await runCheck("Database Connectivity", "database", async () => {
    const { error } = await supabaseAdmin.from("user_profiles").select("id").limit(1);
    if (error) return { status: "failed", message: `DB unreachable: ${error.message}`, severity: "critical",
      title: "Database Connection Failed", description: "DB not responding.",
      suggested_fix: "Check Supabase project status." };
    return { status: "passed", message: "Database connection healthy" };
  }));

  // 2. Critical tables
  checks.push(await runCheck("Critical Tables Existence", "database", async () => {
    const required = ["user_profiles","user_tokens","token_ledger","subscriptions","conversations","community_posts","website_projects","maintenance_scans","bug_reports"];
    const missing: string[] = [];
    for (const t of required) {
      const { error } = await supabaseAdmin.from(t).select("id").limit(1);
      if (error?.message?.includes("does not exist")) missing.push(t);
    }
    if (missing.length > 0) return { status: "failed", message: `Missing: ${missing.join(", ")}`, severity: "critical",
      title: `${missing.length} Tables Missing`, description: `Missing: ${missing.join(", ")}`,
      suggested_fix: "Run missing table migrations in Supabase SQL editor." };
    return { status: "passed", message: `All ${required.length} critical tables exist` };
  }));

  // 3. Token balance integrity
  checks.push(await runCheck("Token Balance Integrity", "database", async () => {
    const { data } = await supabaseAdmin.from("user_tokens").select("user_id").lt("balance", -100).limit(5);
    if (data && data.length > 0) return { status: "warning", message: `${data.length} users with negative balances`, severity: "medium",
      title: "Negative Token Balances", description: `${data.length} accounts below -100 tokens.`,
      suggested_fix: "Review token deduction functions for race conditions." };
    return { status: "passed", message: "Token balances normal" };
  }));

  // 4. Auth health
  checks.push(await runCheck("Auth Service Health", "auth", async () => {
    const { error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) return { status: "failed", message: error.message, severity: "critical",
      title: "Auth Service Down", description: "Users cannot sign in.",
      suggested_fix: "Check Supabase project health." };
    return { status: "passed", message: "Auth service healthy" };
  }));

  // 5. Stripe key
  checks.push(await runCheck("Stripe Key Configured", "stripe", async () => {
    if (!stripeKey) return { status: "failed", message: "STRIPE_SECRET_KEY missing", severity: "critical",
      title: "Stripe Key Missing", description: "Payments will fail.",
      suggested_fix: "Add STRIPE_SECRET_KEY to Secrets panel." };
    return { status: "passed", message: `Stripe ${stripeKey.startsWith("sk_live_") ? "LIVE" : "TEST"} key present` };
  }));

  // 6. Stripe connectivity
  if (stripeKey) {
    checks.push(await runCheck("Stripe API Connectivity", "stripe", async () => {
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      const products = await stripe.products.list({ limit: 5, active: true });
      return { status: "passed", message: `Stripe connected — ${products.data.length} active products` };
    }));
  }

  // 7. Webhook secret
  checks.push(await runCheck("Stripe Webhook Secret", "stripe", async () => {
    if (!Deno.env.get("STRIPE_WEBHOOK_SECRET")) return { status: "failed", message: "STRIPE_WEBHOOK_SECRET missing", severity: "high",
      title: "Webhook Secret Missing", description: "Token delivery after payment will fail.",
      suggested_fix: "Add STRIPE_WEBHOOK_SECRET to Secrets." };
    return { status: "passed", message: "Webhook secret configured" };
  }));

  // 8. Storage buckets
  checks.push(await runCheck("Required Storage Buckets", "storage", async () => {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const ids = (buckets ?? []).map((b) => b.id);
    const required = ["avatars","community-files","generated-images","videos"];
    const missing = required.filter((b) => !ids.includes(b));
    if (missing.length > 0) return { status: "failed", message: `Missing: ${missing.join(", ")}`, severity: "high",
      title: "Storage Buckets Missing", description: `Buckets missing: ${missing.join(", ")}`,
      suggested_fix: "Create missing buckets in Supabase Storage." };
    return { status: "passed", message: "All storage buckets present" };
  }));

  // 9–12. Edge function health
  for (const fn of [
    { name: "mocka-chat Health", slug: "mocka-chat", severity: "critical" },
    { name: "check-subscription Health", slug: "check-subscription", severity: "high" },
    { name: "create-checkout Health", slug: "create-checkout", severity: "critical" },
    { name: "stripe-webhook Health", slug: "stripe-webhook", severity: "high" },
  ]) {
    checks.push(await runCheck(fn.name, "edge_function", async () => {
      try {
        await fetch(`${supabaseUrl}/functions/v1/${fn.slug}`, {
          method: "OPTIONS", headers: { apikey: anonKey }, signal: AbortSignal.timeout(8000),
        });
        return { status: "passed", message: `${fn.slug} responding` };
      } catch (err) {
        return { status: "failed", message: `${fn.slug} unreachable: ${err instanceof Error ? err.message : String(err)}`,
          severity: fn.severity, title: `${fn.slug} Down`, description: `${fn.slug} not responding.`,
          affected_file: `supabase/functions/${fn.slug}/index.ts`,
          suggested_fix: `Redeploy ${fn.slug} and check edge function logs.` };
      }
    }));
  }

  // 13. OnSpace AI key
  checks.push(await runCheck("OnSpace AI API Key", "security", async () => {
    if (!Deno.env.get("ONSPACE_AI_API_KEY")) return { status: "failed", message: "ONSPACE_AI_API_KEY missing", severity: "critical",
      title: "OnSpace AI Key Missing", description: "All AI generation will fail.",
      suggested_fix: "Add ONSPACE_AI_API_KEY to Secrets." };
    return { status: "passed", message: "OnSpace AI key configured" };
  }));

  // 14. ElevenLabs
  checks.push(await runCheck("ElevenLabs TTS Key", "security", async () => {
    if (!Deno.env.get("ELEVENLABS_API_KEY")) return { status: "warning", message: "ELEVENLABS_API_KEY missing — fallback TTS active", severity: "medium",
      title: "ElevenLabs Key Missing", description: "Voice TTS using browser fallback.",
      suggested_fix: "Add ELEVENLABS_API_KEY to Secrets." };
    return { status: "passed", message: "ElevenLabs key configured" };
  }));

  // ── Persist results ───────────────────────────────────────────────────────
  for (const result of checks) {
    await supabaseAdmin.from("maintenance_checks").insert({
      scan_id: scanId, check_name: result.check_name, check_type: result.check_type,
      status: result.status, message: result.message, details: result.details ?? {},
      duration_ms: result.duration_ms ?? 0,
    });
    if (result.status !== "passed" && result.title) {
      await supabaseAdmin.from("bug_reports").insert({
        scan_id: scanId, title: result.title, description: result.description ?? result.message,
        severity: result.severity ?? "medium", category: result.check_type,
        affected_file: result.affected_file ?? null, affected_component: result.affected_component ?? null,
        error_message: result.message, suggested_fix: result.suggested_fix ?? null, status: "open",
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

  // ── Admin notifications ───────────────────────────────────────────────────
  const alertRisks = ["high", "critical"];
  const shouldAlert = alertRisks.includes(riskLevel);

  if (shouldAlert) {
    log("Dispatching admin notifications", { riskLevel });

    // 1. In-app notifications for all admin users
    const { data: adminUsers } = await supabaseAdmin.from("user_profiles")
      .select("id, email")
      .in("email", ["admin@mockj.ai", "mockj@mockj.ai", "owner@mockj.ai"]);

    if (adminUsers && adminUsers.length > 0) {
      const notifRows = adminUsers.map((u: { id: string }) => ({
        user_id: u.id,
        type: "maintenance_alert",
        title: `🚨 Maintenance Alert — ${riskLevel.toUpperCase()} Risk`,
        body: `Daily scan found ${failed.length} failed and ${warnings.length} warning checks. View report for details.`,
        read: false,
      }));
      await supabaseAdmin.from("notifications").insert(notifRows);
    }

    // 2. Email alert via Resend (if key configured)
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const { data: config } = await supabaseAdmin.from("scheduled_scan_config").select("alert_emails").limit(1).single();
    const alertEmails: string[] = config?.alert_emails ?? ["admin@mockj.ai"];

    if (resendKey && alertEmails.length > 0) {
      const html = buildAlertEmailHtml({
        riskLevel,
        totalChecks: checks.length,
        failedChecks: failed.length,
        warnings: warnings.length,
        scanId,
        timestamp: new Date().toUTCString(),
        failedNames: failed.map((c) => c.check_name),
      });
      await sendResendEmail({
        to: alertEmails,
        subject: `🚨 MockJ Maintenance Alert — ${riskLevel.toUpperCase()} risk detected`,
        html,
        resendKey,
      });
    } else if (!resendKey) {
      log("Resend key not configured — email alert skipped");
    }

    // 3. Record alert in scan_alerts
    await supabaseAdmin.from("scan_alerts").insert({
      scan_id: scanId,
      risk_level: riskLevel,
      alert_type: resendKey ? "email+in_app" : "in_app",
      recipient: alertEmails.join(", "),
      payload: { failed: failed.length, warnings: warnings.length },
    });
  }

  // Update last_auto_scan_at in config
  await supabaseAdmin.from("scheduled_scan_config").update({
    last_auto_scan_at: new Date().toISOString(),
  }).eq("enabled", true);

  log("Auto-scan complete", { scanId, riskLevel, passed: passed.length, failed: failed.length });

  return new Response(JSON.stringify({
    scan_id: scanId,
    status: "completed",
    risk_level: riskLevel,
    total_checks: checks.length,
    passed: passed.length,
    failed: failed.length,
    warnings: warnings.length,
    alert_dispatched: shouldAlert,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
