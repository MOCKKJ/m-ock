/**
 * sentry-issues — Proxy to Sentry Issues API
 *
 * Fetches recent unresolved issues from Sentry using the SENTRY_AUTH_TOKEN,
 * SENTRY_ORG, and SENTRY_PROJECT secrets stored in OnSpace Cloud.
 *
 * Required secrets:
 *   SENTRY_AUTH_TOKEN  — Sentry auth token (Settings → Auth Tokens → Create)
 *   SENTRY_ORG         — Your Sentry organization slug
 *   SENTRY_PROJECT     — Your Sentry project slug
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

const log = (step: string, d?: unknown) =>
  console.log(`[SENTRY-ISSUES] ${step}${d ? ` — ${JSON.stringify(d)}` : ""}`);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

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

  // ── Sentry config check ───────────────────────────────────────────────────
  const sentryToken = Deno.env.get("SENTRY_AUTH_TOKEN");
  const sentryOrg = Deno.env.get("SENTRY_ORG");
  const sentryProject = Deno.env.get("SENTRY_PROJECT");

  if (!sentryToken || !sentryOrg || !sentryProject) {
    return new Response(JSON.stringify({
      issues: [],
      configured: false,
      message: "Sentry not configured. Add SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT to OnSpace Cloud → Secrets.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // ── Fetch from Sentry Issues API ──────────────────────────────────────────
  try {
    const url = new URL(`https://sentry.io/api/0/projects/${sentryOrg}/${sentryProject}/issues/`);
    url.searchParams.set("query", "is:unresolved");
    url.searchParams.set("sort", "date");
    url.searchParams.set("limit", "25");
    url.searchParams.set("statsPeriod", "7d");    // last 7 days
    url.searchParams.set("collapse", "stats");

    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${sentryToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      log("Sentry API error", { status: resp.status, body: errBody });

      if (resp.status === 401 || resp.status === 403) {
        return new Response(JSON.stringify({
          issues: [],
          configured: true,
          error: `Sentry auth failed (${resp.status}). Verify SENTRY_AUTH_TOKEN has 'project:read' scope.`,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (resp.status === 404) {
        return new Response(JSON.stringify({
          issues: [],
          configured: true,
          error: `Sentry project not found. Check SENTRY_ORG='${sentryOrg}' and SENTRY_PROJECT='${sentryProject}'.`,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({
        issues: [],
        configured: true,
        error: `Sentry API error ${resp.status}: ${errBody.slice(0, 200)}`,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rawIssues = await resp.json() as Array<Record<string, unknown>>;

    // ── Normalize issues ───────────────────────────────────────────────────
    const issues = rawIssues.map((issue) => ({
      id: String(issue.id),
      title: String(issue.title ?? "Unknown error"),
      culprit: String(issue.culprit ?? ""),
      permalink: String(issue.permalink ?? `https://sentry.io/organizations/${sentryOrg}/issues/${issue.id}/`),
      level: String(issue.level ?? "error"),
      status: String(issue.status ?? "unresolved"),
      count: String(issue.count ?? "0"),
      userCount: Number(issue.userCount ?? 0),
      firstSeen: String(issue.firstSeen ?? new Date().toISOString()),
      lastSeen: String(issue.lastSeen ?? new Date().toISOString()),
      isUnhandled: Boolean(issue.isUnhandled ?? false),
    }));

    log("Fetched issues", { count: issues.length, org: sentryOrg, project: sentryProject });

    return new Response(JSON.stringify({
      issues,
      configured: true,
      total: issues.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    log("Fetch error", { err: err instanceof Error ? err.message : String(err) });
    return new Response(JSON.stringify({
      issues: [],
      configured: true,
      error: `Failed to reach Sentry API: ${err instanceof Error ? err.message : String(err)}`,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
