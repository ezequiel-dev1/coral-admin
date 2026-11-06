import Stripe from "stripe";

/**
 * Server-side Stripe client. This module must never be imported from client
 * components — it reads the secret key, which may only live on the server.
 *
 * Best practice (stripe-best-practices skill): instantiate a StripeClient and
 * call methods on the instance. Do NOT use the deprecated global pattern
 * (`Stripe.setApiKey` / `stripe.api_key = ...`).
 *
 * For the local proof-of-concept the key comes from .env.local. In production
 * it must come from a secrets vault (AWS Secrets Manager), never a committed
 * env file or client code.
 */
const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  throw new Error(
    "STRIPE_SECRET_KEY is not set. Add it to .env.local (test mode) for the " +
      "local proof-of-concept."
  );
}

// Warn loudly if a live key is used in the local PoC.
if (secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_")) {
  console.warn(
    "[stripe] WARNING: a LIVE Stripe key is configured. The local " +
      "proof-of-concept is intended for test mode (sk_test_/rk_test_)."
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
