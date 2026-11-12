import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
// Aliased to infra/api/next-server-shim.ts when bundled (scripts/build-api.mjs).
import { NextRequest } from "next/server";

/**
 * Production API Lambda (behind API Gateway HTTP API + CloudFront "/api/*").
 *
 * It reuses the exact route handlers in app/api/** (checkout, cancel, webhook,
 * feedback) so there is a single implementation for local dev and production.
 *
 * Secrets: the live Stripe key is read from AWS Secrets Manager at cold start
 * and exposed as STRIPE_SECRET_KEY *before* the route modules are loaded (they
 * are imported lazily below, because app/lib/stripe.ts reads the env at import
 * time). The key is never stored in env vars, code, or Terraform state.
 */

type ApiEvent = {
  rawPath: string;
  rawQueryString?: string;
  headers: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: { http: { method: string } };
};

type ApiResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

type RouteModule = {
  GET?: (req: NextRequest) => Promise<Response>;
  POST?: (req: NextRequest) => Promise<Response>;
};

// Dynamic imports are literal so esbuild bundles them, but they only execute
// after secrets are loaded.
const ROUTES: Record<string, () => Promise<RouteModule>> = {
  "POST /api/checkout": () => import("../../app/api/checkout/route"),
  "POST /api/checkout/cancel": () =>
    import("../../app/api/checkout/cancel/route"),
  "GET /api/self-checkout": () => import("../../app/api/self-checkout/route"),
  "POST /api/self-checkout": () => import("../../app/api/self-checkout/route"),
  "POST /api/webhook": () => import("../../app/api/webhook/route"),
  "POST /api/uber-eats/webhook": () => import("../../app/api/uber-eats/webhook/route"),
  // UAT helper; the route itself returns 404 when built for production.
  "POST /api/uber-eats/test": () => import("../../app/api/uber-eats/test/route"),
  // Menu publishing; sandbox only for now, so the route is 404 in production.
  "POST /api/uber-eats/menu": () => import("../../app/api/uber-eats/menu/route"),
  "GET /api/uber-eats/stores": () => import("../../app/api/uber-eats/stores/route"),
  "GET /api/feedback": () => import("../../app/api/feedback/route"),
  "POST /api/feedback": () => import("../../app/api/feedback/route"),
  "GET /api/card-present": () => import("../../app/api/card-present/route"),
};

const secrets = new SecretsManagerClient({});

/** Secret may be stored as the raw value or as a JSON object of values. */
function extract(raw: string, pattern: RegExp): string | undefined {
  const text = raw.trim();
  if (text.startsWith("{")) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      for (const v of Object.values(obj)) {
        if (typeof v === "string" && pattern.test(v.trim())) return v.trim();
      }
    } catch {
      /* fall through */
    }
    return undefined;
  }
  return pattern.test(text) ? text : undefined;
}

async function readSecret(
  secretId: string,
  pattern: RegExp
): Promise<string | undefined> {
  const res = await secrets.send(
    new GetSecretValueCommand({ SecretId: secretId })
  );
  return res.SecretString ? extract(res.SecretString, pattern) : undefined;
}

/**
 * The webhook signing secret only exists after the live webhook endpoint is
 * created in Stripe. Until then the other routes still work and the webhook
 * route answers 500 "not configured". It is retried on webhook requests, so
 * adding the secret later needs no redeploy.
 */
async function loadWebhookSecret(): Promise<void> {
  const webhookSecretId = process.env.STRIPE_WEBHOOK_SECRET_ID;
  if (!webhookSecretId || process.env.STRIPE_WEBHOOK_SECRET) return;
  try {
    const whsec = await readSecret(webhookSecretId, /^whsec_/);
    if (whsec) process.env.STRIPE_WEBHOOK_SECRET = whsec;
  } catch (err) {
    console.warn(
      `[api] webhook secret "${webhookSecretId}" not available yet:`,
      err instanceof Error ? err.message : err
    );
  }
}

/** Load the Uber client credentials from one JSON secret at cold start. */
async function loadUberEatsCredentials(): Promise<void> {
  const secretId = process.env.UBER_EATS_CREDENTIALS_SECRET_ID;
  if (!secretId || process.env.UBER_EATS_CLIENT_SECRET) return;
  const res = await secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!res.SecretString) throw new Error(`Uber secret "${secretId}" is empty`);
  let value: unknown;
  try { value = JSON.parse(res.SecretString); } catch { throw new Error(`Uber secret "${secretId}" must be JSON`); }
  const credentials = value as { client_id?: unknown; client_secret?: unknown };
  if (typeof credentials.client_id !== "string" || typeof credentials.client_secret !== "string") {
    throw new Error(`Uber secret "${secretId}" must contain client_id and client_secret`);
  }
  process.env.UBER_EATS_CLIENT_ID = credentials.client_id;
  process.env.UBER_EATS_CLIENT_SECRET = credentials.client_secret;
}

let ready: Promise<void> | null = null;

function init(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const stripeSecretId = process.env.STRIPE_SECRET_ID;
      if (!stripeSecretId) throw new Error("STRIPE_SECRET_ID is not set");

      const key = await readSecret(stripeSecretId, /^(sk|rk)_(live|test)_/);
      if (!key) {
        throw new Error(
          `Secret "${stripeSecretId}" does not contain a Stripe secret key`
        );
      }
      process.env.STRIPE_SECRET_KEY = key;

      await loadWebhookSecret();
    })().catch((err) => {
      ready = null; // allow a retry on the next invocation
      throw err;
    });
  }
  return ready;
}

function json(statusCode: number, body: unknown): ApiResult {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function handler(event: ApiEvent): Promise<ApiResult> {
  const method = event.requestContext.http.method.toUpperCase();
  const path = event.rawPath.replace(/\/+$/, "") || "/";
  const load = ROUTES[`${method} ${path}`];
  if (!load) return json(404, { error: "Not found" });

  try {
    await init();
    if (path.startsWith("/api/uber-eats/")) await loadUberEatsCredentials();
    if (path === "/api/webhook") await loadWebhookSecret();
  } catch (err) {
    console.error("[api] initialization failed:", err);
    return json(500, { error: "Server not configured" });
  }

  try {
    const mod = await load();
    const fn = method === "GET" ? mod.GET : mod.POST;
    if (!fn) return json(405, { error: "Method not allowed" });

    const headers = new Headers();
    for (const [k, v] of Object.entries(event.headers ?? {})) {
      if (v !== undefined) headers.set(k, v);
    }

    // Raw body must be preserved exactly: the webhook verifies Stripe's
    // signature over it.
    let body: string | undefined;
    if (method !== "GET" && method !== "HEAD" && event.body !== undefined) {
      body = event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf8")
        : event.body;
    }

    const host = headers.get("host") ?? "localhost";
    const qs = event.rawQueryString ? `?${event.rawQueryString}` : "";
    const req = new NextRequest(`https://${host}${event.rawPath}${qs}`, {
      method,
      headers,
      body,
    });

    const res = await fn(req);
    return {
      statusCode: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
      },
      body: await res.text(),
    };
  } catch (err) {
    console.error("[api] unhandled error:", err);
    return json(500, { error: "Internal error" });
  }
}
