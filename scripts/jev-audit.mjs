#!/usr/bin/env node
/**
 * Jev Web Error Monitor — BuildScan AI
 *
 * Audits the app's key routes, classifies failures with Jev's System-1 model
 * (fast, structured: is_operational / severity / should_alert), and dispatches
 * notifications via Resend or a generic webhook.
 *
 * Usage:
 *   BASE_URL=https://binnovatonrooms.vercel.app node scripts/jev-audit.mjs
 *
 * Env:
 *   BASE_URL          (default: http://localhost:3000)
 *   TYPESAFE_API_KEY  optional — enables Jev classification (falls back to heuristics)
 *   RESEND_API_KEY    optional — email notification via Resend
 *   NOTIFICATION_EMAIL optional — destination for Resend alerts
 *   ALERT_WEBHOOK_URL  optional — generic webhook (JSON POST)
 */

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

// Routes that define this app's availability surface (pages + core APIs)
const ROUTES = [
  { path: "/", name: "Homepage (inspector)", expect: 200 },
  { path: "/reports", name: "Reports list", expect: 200 },
  { path: "/login", name: "Login page", expect: 200 },
  { path: "/api/health", name: "Health endpoint", expect: 200, json: "ok" },
  { path: "/api/reports?limit=3", name: "Reports API", expect: 200 },
  { path: "/api/analytics", name: "Analytics API", expect: 200 },
  { path: "/robots.txt", name: "Robots", expect: 200 },
];

const TIMEOUT_MS = 15_000;

async function probe(route) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${route.path}`, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "jev-web-monitor/1.0" },
    });
    const durationMs = Date.now() - started;
    let bodyOk = true;
    let bodySnippet = "";
    if (route.json) {
      const body = await res.json().catch(() => ({}));
      bodyOk = body[route.json] === true;
      bodySnippet = JSON.stringify(body).slice(0, 200);
    } else {
      const text = await res.text();
      bodySnippet = text.slice(0, 120).replace(/\s+/g, " ");
    }
    return {
      ...route,
      status: res.status,
      durationMs,
      ok: res.status === route.expect && bodyOk,
      bodyOk,
      error: null,
      bodySnippet,
    };
  } catch (error) {
    return {
      ...route,
      status: 0,
      durationMs: Date.now() - started,
      ok: false,
      bodyOk: false,
      error: error.name === "AbortError" ? `Timeout after ${TIMEOUT_MS}ms` : error.message,
      bodySnippet: "",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Heuristic classification — used when TYPESAFE_API_KEY is absent or the call fails. */
function heuristicClassification(result) {
  if (result.ok) {
    return {
      is_operational: true,
      severity: "none",
      should_alert: false,
      summary: `${result.name} healthy (${result.status}, ${result.durationMs}ms)`,
    };
  }
  const isTimeout = result.error?.includes("Timeout");
  const isNetwork = result.status === 0 && !isTimeout;
  return {
    is_operational: true,
    severity: result.status === 0 ? "critical" : "high",
    should_alert: true,
    summary: isTimeout
      ? `${result.name} timed out — backend or cold-start problem`
      : isNetwork
        ? `${result.name} unreachable — DNS/network outage or app down`
        : result.bodyOk === false
          ? `${result.name} returned ${result.status} but body check failed — degraded response`
          : `${result.name} returned ${result.status} (expected ${result.expect})`,
  };
}

/** Classify with Jev System-1. Returns null if unavailable. */
async function jevClassification(result) {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) return null;
  try {
    const { TypeSafeClient, choice, noul } = await import("@typesafe-ai/sdk");
    const client = new TypeSafeClient({ apiKey, timeout: 10_000 });
    const response = await client.systemOne({
      // 'jev-1' has been retired on the service; jev-latest is the System One model.
      // Override with TYPESAFE_MODEL if needed.
      model: process.env.TYPESAFE_MODEL || "jev-latest",
      state: {
        document: [
          `Web route health check result for BuildScan AI (construction inspection app).`,
          `Route: ${result.name} (${result.path}) on ${BASE_URL}`,
          `HTTP status: ${result.status} (expected ${result.expect})`,
          `Response time: ${result.durationMs}ms`,
          `Body validation: ${result.bodyOk ? "passed" : "failed"}`,
          `Network error: ${result.error || "none"}`,
          `Body preview: ${result.bodySnippet || "(empty)"}`,
        ].join("\n"),
      },
      questions: {
        is_operational: noul("Is this an operational availability problem rather than expected behavior?", {
          true: "The route is down, erroring, or degraded",
          false: "The route behaved as expected",
        }),
        severity: choice("How severe is this finding?", {
          none: "No issue — route healthy",
          low: "Minor degradation, no user impact",
          medium: "Degraded feature, users affected",
          high: "Key route failing, users blocked",
          critical: "Site or core API down / unreachable",
        }),
        should_alert: noul("Should the on-call owner be alerted right now?", {
          true: "Yes — actionable failure that needs attention",
          false: "No — healthy or self-recovering",
        }),
      },
    });
    const { answers } = response;
    return {
      is_operational: answers.is_operational.p >= 0.5,
      severity: answers.severity.choice,
      should_alert: answers.should_alert.p >= 0.5,
      // Summary is client-side; the Jev API answers typed questions only.
      summary: heuristicSummary(result),
    };
  } catch (error) {
    console.warn(`[jev] classification failed (${error.message?.slice(0, 120)}) — using heuristics`);
    return null; // fall back to heuristics — monitoring must never fail closed
  }
}

function heuristicSummary(result) {
  return heuristicClassification(result).summary;
}

async function notify(failures, total) {
  const lines = failures.map(
    (f) => `- ${f.name}: ${f.classification.summary} [severity: ${f.classification.severity}]`
  );
  const subject = `[BuildScan AI] ${failures.length}/${total} route checks failing`;
  const text = `${subject}\n\n${lines.join("\n")}\n\nBase URL: ${BASE_URL}`;

  if (process.env.RESEND_API_KEY && process.env.NOTIFICATION_EMAIL) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: "BuildScan Monitor <onboarding@resend.dev>",
          to: [process.env.NOTIFICATION_EMAIL],
          subject,
          text,
        }),
      });
      console.log(`[notify] Resend ${res.status === 200 ? "sent" : `failed (${res.status})`}`);
    } catch (error) {
      console.warn(`[notify] Resend error: ${error.message}`);
    }
  }

  if (process.env.ALERT_WEBHOOK_URL) {
    try {
      const res = await fetch(process.env.ALERT_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, text, failures, baseUrl: BASE_URL, at: new Date().toISOString() }),
      });
      console.log(`[notify] Webhook ${res.ok ? "sent" : `failed (${res.status})`}`);
    } catch (error) {
      console.warn(`[notify] Webhook error: ${error.message}`);
    }
  }
}

async function main() {
  console.log(`Jev audit — ${BASE_URL}`);
  console.log(`Classifications: ${process.env.TYPESAFE_API_KEY ? "Jev System-1 (jev-latest)" : "heuristic (no TYPESAFE_API_KEY)"}\n`);

  const results = [];
  for (const route of ROUTES) {
    const result = await probe(route);
    const classification =
      (await jevClassification(result)) || heuristicClassification(result);
    result.classification = classification;
    const icon = result.ok ? "PASS" : "FAIL";
    console.log(
      `[${icon}] ${result.name.padEnd(22)} ${String(result.status).padEnd(4)} ${String(result.durationMs).padStart(6)}ms  ${classification.summary}`
    );
    results.push(result);
  }

  const failures = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failures.length}/${results.length} routes healthy` +
      (failures.length ? ` — ${failures.length} FAILING` : " — 0 errors")
  );

  if (failures.length > 0) {
    const alertable = failures.filter((f) => f.classification.should_alert);
    if (alertable.length) await notify(alertable, results.length);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("Audit runner crashed:", error);
  process.exit(1);
});
