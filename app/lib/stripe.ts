import Stripe from "stripe";

/**
 * Server-side Stripe client. This module must never be imported from client
 * components — it reads the secret key, which may only live on the server.
 *
 * Best practice (stripe-best-practices skill): instantiate a StripeClient and
 * call methods on the instance. Do NOT use the deprecated global pattern
 * (`Stripe.setApiKey` / `stripe.api_key = ...`).
 *
 * Local dev: the (test-mode) key comes from .env.local.
 * Production: the API Lambda (infra/api/lambda.ts) reads the live key from AWS
 * Secrets Manager ("stripe-secret-key") and sets STRIPE_SECRET_KEY before this
 * module is loaded. The key never lives in a committed env file or client code.
 */
const secretKey = process.env.STRIPE_SECRET_KEY;
const isProduction = process.env.NEXT_PUBLIC_APP_ENV === "production";

if (!secretKey) {
  throw new Error(
    "STRIPE_SECRET_KEY is not set. Locally, add a test key to .env.local; in " +
      "production it is loaded from AWS Secrets Manager."
  );
}

const isLiveKey =
  secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_");

if (isProduction && !isLiveKey) {
  console.warn(
    "[stripe] WARNING: production is running with a non-live Stripe key."
  );
}
if (!isProduction && isLiveKey) {
  console.warn(
    "[stripe] WARNING: a LIVE Stripe key is configured outside production. " +
      "Use a test key (sk_test_/rk_test_) for local development."
  );
}

export const stripe = new Stripe(secretKey);

/** MXN is a two-decimal currency: pesos -> centavos (integer minor units). */
export function toMinorUnits(pesos: number): number {
  return Math.round(pesos * 100);
}

/** centavos -> pesos, for reading amounts back from Stripe. */
export function fromMinorUnits(centavos: number): number {
  return Math.round(centavos) / 100;
}
