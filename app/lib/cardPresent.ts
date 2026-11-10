/** A recent in-person (Tap to Pay / Stripe app) card payment, as returned by GET /api/card-present. */
export type CardPresentPayment = {
  /** Stripe PaymentIntent id (pi_...). */
  id: string;
  /** Amount charged, in pesos. */
  amount: number;
  /** ISO timestamp the payment was created. */
  createdAt: string;
  brand: string | null;
  last4: string | null;
  /** Real processing fee / net in pesos, when Stripe has already computed them. */
  fee: number;
  net: number | null;
};
