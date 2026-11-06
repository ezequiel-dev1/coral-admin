/**
 * DynamoDB table names per environment.
 *
 * The environment is chosen by NEXT_PUBLIC_APP_ENV, which Next.js inlines at
 * build time (so a static build is locked to one environment):
 *
 *   uat         -> coral-<name>        (the original tables)
 *   production  -> coral-prod-<name>
 *
 * Anything other than the exact string "production" falls back to UAT, so a
 * missing or misspelled value can never accidentally point at production data.
 */
export type AppEnv = "uat" | "production";

export const APP_ENV: AppEnv =
  process.env.NEXT_PUBLIC_APP_ENV === "production" ? "production" : "uat";

const prefix = APP_ENV === "production" ? "coral-prod-" : "coral-";

export const TABLES = {
  sharedLoans: `${prefix}shared-loans`,
  loanCharges: `${prefix}loan-charges`,
  investments: `${prefix}investments`,
  menuItems: `${prefix}menu-items`,
  menuIngredients: `${prefix}menu-ingredients`,
  ledger: `${prefix}ledger`,
  orders: `${prefix}orders`,
  feedback: `${prefix}feedback`,
} as const;
