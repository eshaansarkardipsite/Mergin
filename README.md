# MERGIN

Monochrome finance workspace for small businesses. Invoices, PayPal Sandbox reconciliation, expenses,
budgets, cash-flow forecasting, Sentinel recurring-charge evidence, and a grounded Copilot — built on a
deterministic local ledger.

This is an MVP/demo build. It runs entirely on your machine; no production payment or email provider is contacted
unless you supply real Sandbox credentials.

## Stack

- **Frontend:** React 19 + TypeScript + Vite, React Router, Tailwind CSS (local build)
- **Backend:** Node.js + Express + `node:sqlite` (Node 22.5+; developed on Node 26)
- **Validation/tests:** Zod, Vitest
- **Design:** strict achromatic system from `Stitch Screens/achromatic_financial_architecture/DESIGN.md`
- **Money:** integers in minor units everywhere; no floating-point money math

## Requirements

- Node.js **22.5+** (the built-in `node:sqlite` module is required)
- npm

## Quick start

```bash
npm install
npm run db:reset      # recreate + seed the local SQLite database
npm run dev           # API on :3001, Vite on :5173
```

Open <http://localhost:5173>. Sign in with:

- **Launch demo** — one click, no credentials
- or `demo@mergin.example` / `mergin-demo`

The sign-in flow creates a signed, HTTP-only demo session cookie. There is no real identity provider.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs API (`tsx watch`) and Vite together |
| `npm run dev:api` | API only, `http://localhost:3001` |
| `npm run dev:web` | Vite only, `http://localhost:5173` |
| `npm run db:reset` | Drops and reseeds `dev.db` |
| `npm run db:seed` | Seeds an empty database without dropping it |
| `npm run typecheck` | TypeScript checks for app and server |
| `npm run lint` | ESLint |
| `npm test` | Vitest suite |
| `npm run build` | Typecheck + Vite production build to `dist/` |
| `npm start` | Runs the API/server entry without watch mode |

The Vite dev server proxies `/api` to `http://localhost:3001`.

## Routes

| Route | Screen |
| --- | --- |
| `/login` | Sign in |
| `/onboarding/business` | Business profile setup |
| `/onboarding/paypal` | PayPal Sandbox connection |
| `/app` | Overview dashboard |
| `/app/invoices` | Invoice management |
| `/app/invoices/new` | Create invoice |
| `/app/invoices/:id` | Invoice detail and payment timeline |
| `/pay/:publicToken` | Public customer payment page |
| `/app/transactions` | Transaction ledger |
| `/app/expenses` | Expense management |
| `/app/budgets` | Budget management |
| `/app/cash-flow` | Cash-flow analytics |
| `/app/sentinel` | Sentinel recurring intelligence |
| `/app/sentinel/:id` | Sentinel review detail (newly created screen 14) |
| `/app/copilot` | AI finance Copilot |
| `/app/settings` | Settings and integrations |

The supplied Stitch pack contains **15 exported screens**. Screen 14 (`Sentinel Review Detail`) did not exist in
the pack and was designed and built to match the same achromatic system. The original exports remain in
`Stitch Screens/` for reference; they have been rebranded to MERGIN but are not part of the running app.

## Configuration

Copy `.env.example` to `.env` and edit as needed. Every value is optional: with none set the app runs in a clearly
labelled local demo mode.

```bash
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default `3001`) |
| `APP_BASE_URL` | Public origin used in payment links (default `http://localhost:5173`) |
| `DATABASE_URL` | SQLite location (default `file:./dev.db`) |
| `PAYPAL_ENV` | `sandbox` (default) or `live` |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | Server-side PayPal OAuth. Never exposed to the browser |
| `PAYPAL_WEBHOOK_ID` | Webhook ID used to verify signatures |
| `PUBLIC_WEBHOOK_BASE_URL` | Optional public HTTPS base for webhooks |
| `GEMINI_API_KEY` | Optional Gemini key, backend only |
| `GEMINI_MODEL` | Gemini model ID; blank uses the deterministic local explanation |
| `SESSION_SECRET` | Cookie signing secret; set a long random value in any shared environment |

### PayPal behaviour

- OAuth token is fetched and cached server-side. The client secret never leaves the server.
- Invoices are created via the **Invoicing API v2**.
- Webhooks are signature-verified with the configured webhook ID and deduplicated by event ID.
- Paid amounts are reconciled from PayPal as the authoritative source. Partial, pending, fully paid, refunded,
  and cancelled states are mapped explicitly.
- Returning from a PayPal payment does **not** settle the invoice in the browser. The public payment page shows
  "processing" and polls the backend until reconciliation lands.
- Without credentials or a webhook ID, the relevant endpoints return truthful `409`/`503` responses and the UI
  explains what is missing. A clearly labelled **demo payment** can be recorded locally; no real funds move.

### Gemini behaviour

- `@google/genai` is imported only on the server.
- All amounts, counts, and evidence are calculated in TypeScript first.
- Gemini, when configured, only explains those calculated facts. Without a key, a deterministic local answer is
  returned instead.

## Demo data

`npm run db:reset` seeds a coherent workspace — Northstar Creative:

- Opening balance `$15,215.50`, current recorded balance `$18,420.50`
- Incoming this month `$7,250.00`
- Outstanding `$5,490.00` (one overdue invoice)
- Expenses this month `$4,380.20`
- 8 invoices, 20 transactions, 10 expenses, 4 budgets, 4 recurring patterns, 4 Sentinel reviews

All data is local and resettable from **Settings → Business profile → Reset demo data**.

## Testing

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Vitest covers money math, Sentinel detection, PayPal status mapping and signature verification, webhook
idempotency, and budget utilisation.

## Project layout

```
server/            Express API, SQLite schema/repos, PayPal, Gemini, webhook, seed
shared/            Domain types, money math, dates, deterministic Sentinel detection
src/               React app, pages, components, API client, design tokens
public/brand/      MERGIN logo and derived icons (source: Logo.png)
tests/             Vitest suites
Stitch Screens/    Original Stitch exports (reference only) + DESIGN.md
docs/              Implementation status and notes
```

## Known limits (intentional MVP scope)

- Authentication is a labelled demo session, not a real identity system.
- Invoice "send" and "remind" are demo actions unless PayPal credentials are configured. No email is delivered.
- Receipt files are referenced by name only; uploads are not stored.
- The payment page only opens a genuine PayPal URL when the server has created a real hosted invoice. Otherwise it
  offers the labelled local simulation.
- No CI configuration is included.
