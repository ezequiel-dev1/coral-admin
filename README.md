# Coral Reef and Beef — Admin Dashboard

Internal operations dashboard for **Coral Reef and Beef** restaurant, deployed at [admin.coral.restaurant](https://admin.coral.restaurant).

## Features

- **Overview** — live metrics, floor plan, service pulse, reservations, orders, and pending payments
- **Providers** — manage suppliers and vendors
- **Investments** — track capital investments and expected returns
- **Shared Loans** — monitor loans, installments, and partner obligations
- **Expenses** — track all outgoing payments and costs
- **i18n** — English (US) and Spanish (MX) support via language switcher
- **Live weather** — geolocation-based weather via Open-Meteo
- **AWS Cognito auth** — protected routes with group-based roles

## Tech Stack

- Next.js 16 (App Router)
- Tailwind CSS 4
- AWS Amplify (Cognito authentication)
- Cloudflare Pages (deployment)
- Custom font: Mounties (titles)

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Project Structure

```
app/
├── auth/           # AuthProvider, ProtectedRoute, Cognito config
├── i18n/           # LanguageProvider context
├── locales/        # en.json, es.json translation files
├── pages/          # Overview, Providers, Investments, SharedLoans, Expenses
├── Dashboard.tsx   # Main shell with sidebar navigation
├── globals.css     # All styles
├── layout.tsx      # Root layout with metadata
└── page.tsx        # Entry point
public/
├── coral-icon.png  # Brand logo
└── fonts/          # Mounties custom font
```

## Adding Translations

1. Add the key to both `app/locales/en.json` and `app/locales/es.json`
2. Use `t("section.key")` in any component via `useTranslation()` hook

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your Cognito credentials.
