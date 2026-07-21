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
