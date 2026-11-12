# Coral Reef and Beef — Admin Dashboard

Internal operations dashboard for **Coral Reef and Beef** restaurant, deployed at [admin.coral.restaurant](https://admin.coral.restaurant).

## Features

- **Overview** — live metrics, floor plan, service pulse, reservations, orders, and pending payments
- **Providers** — manage suppliers and vendors
- **Investments** — track capital investments (DynamoDB-backed)
- **Shared Loans** — CRUD with charge history, attachments, and auto-calculated remaining (DynamoDB)
- **Expenses** — track all outgoing payments and costs
- **Accounting** — general ledger entries
- **Invoices** — client invoice tracking
- **Ledger (Libro Mayor)** — full financial ledger synced from spreadsheet (107 records, DynamoDB)
- **i18n** — English (US) and Spanish (MX) via language switcher, persisted in localStorage
- **Live weather** — geolocation-based weather via Open-Meteo (Celsius)
- **AWS Cognito auth** — protected routes with group-based roles (Administrator CRUD access)
- **Collapsible sidebar** — toggle with tooltips on collapsed icons
- **Hash-based routing** — pages persist on refresh

## Tech Stack

- Next.js 16 (App Router, static export)
- Tailwind CSS 4
- TanStack Table (data grids with sorting, filtering, pagination)
- shadcn/ui (Dialog, Button, Badge, Input, Label, Tooltip)
- AWS Amplify (Cognito authentication + Identity Pool)
- AWS DynamoDB (Shared Loans, Loan Charges, Investments, Ledger)
- AWS S3 + CloudFront (deployment and private receipt storage)
- Custom fonts: Mounties (titles), Helvetica Neue (body)
- Lucide React (icons)

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
```

## Build & Deploy

```bash
npm run build
./infra/deploy.sh   # Syncs to S3 + invalidates CloudFront
```

### Production Stripe API

Card payments need a server, which the static site doesn't have. In production
`/api/*` is served by a Lambda behind API Gateway and CloudFront (`infra/api.tf`,
source `infra/api/lambda.ts`, reusing the route handlers in `app/api/**`).

- Live key: AWS Secrets Manager secret `stripe-secret-key` (read by the Lambda only).
- Webhook signing secret: Secrets Manager secret `stripe-webhook-secret` (plaintext `whsec_...`),
  created after registering `https://admin.coral.restaurant/api/webhook` as a live-mode
  webhook in the Stripe Dashboard.

```bash
npm run build:api                 # bundle the Lambda into infra/api-dist
cd infra && terraform apply       # create/update API + CloudFront route
cd .. && npm run deploy:production
```

Local development still uses `npm run dev:stripe` with a **test** key in `.env.local`.

### UAT API (Stripe test mode + Uber sandbox)

`admin-uat.coral.restaurant/api/*` is served by its own Lambda, `coral-admin-api-uat`
(`infra/api-uat.tf`), bundled with `npm run build:api:uat` and limited to the `coral-*` tables.
Create these secrets by hand first: `stripe-secret-key-uat` (`sk_test_...`) and
`stripe-webhook-secret-uat` (`whsec_...` from a test-mode webhook pointed at
`https://admin-uat.coral.restaurant/api/webhook`). The Uber sandbox secret is shared.
The "Uber Test" tab (UAT only, admins) calls `POST /api/uber-eats/test` to simulate
orders and cancellations, or replay a signed webhook for a real sandbox order.

### Uber Eats orders

Uber webhook orders and cancellations currently target only the UAT table
`coral-orders`, even though the endpoint is hosted on the admin API. Only
`X-Environment: sandbox` events are accepted. View them in the UAT POS.

Uber Eats orders arrive at `POST https://admin.coral.restaurant/api/uber-eats/webhook`.
The Lambda verifies the raw-body `X-Uber-Signature`, fetches the authoritative
order, creates one idempotent pre-paid takeout order in Coral, then accepts it
back to Uber. Configure AWS Secrets Manager secret `uber-eats-client-credentials`
as JSON with `client_id` and `client_secret`; it is read only by the Lambda.
In Uber's developer dashboard, set that URL as the primary webhook and grant
`eats.order` plus `eats.store.orders.read`. Use `UBER_EATS_API_BASE_URL` only
for a nonstandard sandbox endpoint in local testing.

## Project Structure

```
app/
├── auth/           # AuthProvider, ProtectedRoute, Cognito config
├── hooks/          # useIsAdmin
├── i18n/           # LanguageProvider context
├── lib/            # dynamodb.ts, receipts.ts
├── locales/        # en.json, es.json translation files
├── pages/          # Overview, Providers, Investments, SharedLoans,
│                   # Expenses, Accounting, Invoices, Ledger
├── Dashboard.tsx   # Main shell with collapsible sidebar
├── globals.css     # All styles
├── layout.tsx      # Root layout with metadata
└── page.tsx        # Entry point
components/ui/      # shadcn + custom components (data-grid, currency-input, etc.)
infra/              # Terraform (S3, CloudFront, Cognito, DynamoDB, IAM)
public/
├── coral-icon.png  # Brand logo
├── fonts/          # Mounties custom font
└── attachments/    # Receipt images (synced to S3)
```

## DynamoDB Tables

| Table | Purpose |
|-------|---------|
| `coral-shared-loans` | Shared loan records |
| `coral-loan-charges` | Charge history per loan |
| `coral-investments` | Investment records |
| `coral-ledger` | Full financial ledger (107 entries) |

## Adding Translations

1. Add the key to both `app/locales/en.json` and `app/locales/es.json`
2. Use `t("section.key")` in any component via `useTranslation()` hook

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your Cognito credentials.
