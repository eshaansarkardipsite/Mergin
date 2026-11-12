# Implementation status

## Screen coverage

The supplied Stitch pack contains 15 screens (`01`–`13`, `15`, `16`). Screen 14 was missing and has been designed and
built to match the same achromatic system. That makes **15 supplied + 1 new = 16 screens**, and all 16 are live React
routes.

| # | Supplied screen | React route | Status |
| --- | --- | --- | --- |
| 01 | Sign in | `/login` | Complete |
| 02 | Business setup | `/onboarding/business` | Complete |
| 03 | Connect PayPal Sandbox | `/onboarding/paypal` | Complete |
| 04 | Overview dashboard | `/app` | Complete |
| 05 | Invoice management | `/app/invoices` | Complete |
| 06 | Create invoice | `/app/invoices/new` | Complete |
| 07 | Invoice detail payment timeline | `/app/invoices/:id` | Complete |
| 08 | Customer payment confirmation | `/pay/:publicToken` | Complete |
| 09 | Transaction ledger | `/app/transactions` | Complete |
| 10 | Expense management | `/app/expenses` | Complete |
| 11 | Budget management | `/app/budgets` | Complete |
| 12 | Cash flow analytics | `/app/cash-flow` | Complete |
| 13 | Sentinel recurring intelligence | `/app/sentinel` | Complete |
| 14 | *(not supplied — newly created)* | `/app/sentinel/:id` | Complete |
| 15 | AI finance Copilot | `/app/copilot` | Complete |
| 16 | Settings & integrations | `/app/settings` | Complete |

The archived exports in `Stitch Screens/` have been rebranded from ZELVO to MERGIN (text, domains, email, logo).
`screen.png` files were left untouched as the visual reference. See [Branding audit](#branding-audit).

## Backend

- Express 5 API mounted under `/api`, Zod-validated.
- `node:sqlite` persistence with a typed repository layer (`server/db/repo.ts`) and explicit schema.
- Supabase-backed email/password sign-in, Google OAuth through Supabase, and PayPal "Log in with PayPal" SSO.
- Signed HTTP-only session cookie (7 days), one-click demo entry, seeded demo credentials.
- Security headers with a Google Fonts-aware CSP, API rate limiting, stricter failed-sign-in limiting, SameSite
  session cookies, a same-origin write guard, `no-store` API responses, CSV formula-injection escaping, and a
  production startup guard for `SESSION_SECRET` / `APP_BASE_URL`.
- Coherent seed data; dashboard totals reconcile exactly (see README).
- `/api/health` checks the SQLite connection and returns `503` when it fails. Weekly Dependabot updates cover npm and
  GitHub Actions.

### Routes

| Area | Endpoints |
| --- | --- |
| Auth | `GET /api/auth/providers`, `POST /api/auth/login`, `POST /api/auth/demo`, `POST /api/auth/logout`, `GET /api/auth/session`, `GET /api/auth/google/start`, `GET /api/auth/google/callback`, `GET /api/auth/paypal/start`, `GET /api/auth/paypal/callback` |
| Dashboard | `GET /api/dashboard` |
| Invoices | `GET/POST /api/invoices`, `GET/PATCH /api/invoices/:id`, `POST /api/invoices/:id/send`, `/remind`, `/cancel`, `/reconcile` |
| Public payment | `GET /api/public/invoices/:token`, `POST /api/public/invoices/:token/demo-pay` |
| Transactions | `GET /api/transactions`, `GET /api/transactions/export` |
| Expenses | `GET/POST /api/expenses` |
| Budgets | `GET/POST /api/budgets`, `PATCH/DELETE /api/budgets/:id` |
| Cash flow | `GET /api/cash-flow?horizon=7\|30&scenario=baseline\|conservative` |
| Sentinel | `GET /api/sentinel`, `GET /api/sentinel/:id`, `POST /api/sentinel/scan`, `POST /api/sentinel/:id/decision` |
| Copilot | `GET /api/copilot/suggestions`, `POST /api/copilot/ask` |
| Settings | `GET/PATCH /api/settings`, `POST /api/settings/paypal/test`, `POST /api/settings/renewal-policy`, `POST /api/settings/demo-reset` |
| Onboarding | `GET/POST /api/onboarding` |
| Webhooks | `POST /api/paypal/webhook` |

### Authentication

- Supabase Auth verifies email/password. Google uses Supabase's OAuth provider with a server-side PKCE verifier.
- PayPal uses "Log in with PayPal" OAuth and the OIDC userinfo endpoint.
- Passkeys use WebAuthn (ES256/P-256) with local credential storage; registration and authentication via
  `/auth/passkey/register/*` and `/auth/passkey/authenticate/*`.
- Self-service sign-up via `/auth/signup`; password reset via `/auth/reset-password`.
- First sign-in creates a local workspace and user; later sign-ins reuse the `user_identities` mapping. A matching
  non-demo email links providers together. The demo account is never linked to a real identity.
- Provider tokens are exchanged server-side. The browser receives only the signed HTTP-only `mergin_session` cookie.
- Missing provider credentials disable the buttons and produce truthful redirect errors; no fake session is created.

### Money

All amounts are integer minor units. `shared/money.ts` owns parsing, formatting, and arithmetic. CSV exports format
minor units into decimals at the boundary only.

### PayPal

- Server-side OAuth client with cached token; secret never sent to the client.
- Invoicing API v2 create/send/remind/cancel.
- Hosted payment link is opened by the public payment page when present.
- Webhook signature verification via `PAYPAL_WEBHOOK_ID`; events deduplicated by ID.
- Reconciliation maps partial, pending, fully paid, refunded, and cancelled states against the authoritative paid
  amount.
- Browser return never settles an invoice; the page polls until the server reconciles.
- Missing credentials or webhook ID produce truthful `409`/`503` and clear UI copy. A labelled local demo payment is
  available and moves no real funds.

### Email (invoice PDF delivery)

- SMTP configuration via `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- `sendInvoiceEmail()` uses nodemailer; `generateInvoicePdf()` uses pdf-lib for server-side PDF generation.
- Clicking “Save and send” on an invoice renders it to PDF and emails it to the customer’s billing address with an HTML
  body and PDF attachment.
- Falls back to PayPal (if configured) or demo mode when SMTP is not set.
- Demo mode never sends email.


### Gemini

- `@google/genai` is server-only.
- Deterministic TypeScript calculates all amounts, counts, and evidence before any model call.
- The model only explains calculated facts; no key returns a deterministic local answer.
- Copilot evidence includes overdue invoices, balances, budgets, and recurring charges with links into the app.

### Sentinel

- Recurring patterns require at least three matching ledger observations.
- Detects price changes and redundant overlapping vendors.
- Never claims usage or non-usage; the UI states usage telemetry is not connected.
- Reviews persist decisions (dismiss / follow up / cancel) with an audit trail.

### Cash flow

- Recorded balance plus detected recurring outflows.
- Unpaid invoices are shown as receivables and never counted as guaranteed cash.
- 7-day / 30-day horizons.
- `baseline` uses detected charge amounts; `conservative` adds a clearly labelled 10% buffer to estimated outflows
  only. Calculated server-side.

## Frontend

- Every visible control works or is visibly disabled with a reason.
- Demo mode is labelled throughout (banner, toasts, badges).
- No fake success toasts: send/remind in demo mode say exactly what did and did not happen.
- Invoice print/save-PDF via browser print, with print CSS hiding the shell chrome.
- CSV export exists for transactions, invoices, expenses, and cash-flow forecast, generated from loaded data.
- Responsive layout with mobile navigation drawer; verified at ~390px.
- Shared monochrome SVG charts, no chart dependency.
- Brand assets in `public/brand/` derived from the supplied `Logo.png`.

## Verification

| Check | Result |
| --- | --- |
| `npm install` | Complete |
| `npm run db:reset` | Complete; totals reconcile |
| `npm run typecheck` | Passing |
| `npm run lint` | Passing |
| `npm test` | 53 tests in 11 files passing |
| `npm run build` | Passing |
| Browser flows | Sign-in, dashboard, invoices, payment, transactions, expenses, budgets, cash flow, Sentinel, Copilot, settings, reset |

Vitest suites:

- `tests/money.test.ts` — integer money parsing/formatting/arithmetic
- `tests/sentinel.test.ts` — recurring detection, price changes, redundancy, minimum observations
- `tests/paypal.test.ts` — status mapping, reconciliation, signature verification
- `tests/webhook.test.ts` — event extraction, deduplication, status handling
- `tests/budgets.test.ts` — utilisation thresholds
- `tests/security.test.ts` — security headers, origin guard, provider readiness flags, health check
- `tests/auth.test.ts` — identity provisioning, Supabase password/PKCE exchange, PayPal profile mapping
- `tests/csv.test.ts` — formula-injection escaping
- `tests/email.test.ts` — email header sanitization
- `tests/invoices.test.ts` — invoice API validation
- `tests/pdf.test.ts` — PDF generation with Unicode and control characters

## Production foundation (Phase 1)

Phase 1 prepares the production path without changing the demo sign-in flow:

- Supabase, Google OAuth, and OpenRouter environment variables plus typed readiness flags in `server/config.ts`.
- Helmet security headers, API rate limiting, and failed-sign-in throttling in `server/security.ts`.
- `TRUST_PROXY` configuration; production refuses to start without `SESSION_SECRET` and `APP_BASE_URL`.
- GitHub Actions CI runs typecheck, lint, tests, and build on every push and pull request.
- README documents Supabase, Google OAuth, and PayPal Sandbox credential setup, including the webhook endpoint
  `<origin>/api/paypal/webhook` and required invoice events.

Phase 2 added Supabase-verified email/password, Google OAuth, PayPal SSO, passkeys, self-service sign-up, and
password recovery.

## Branding audit

- React app UI contains no `zelvo` strings.
- The 15 archived `Stitch Screens/*/code.html` files were rebranded:
  - `ZELVO` / `Zelvo` / `zelvo` → `MERGIN` / `Mergin` / `mergin`
  - remote logo URL → local `../../public/brand/mergin-logo.png`
  - `zelvo.io` → `mergin.example`
  - `sb-merch94@zelvo-developer.com` → `sandbox-merchant@example.test`
  - CSS/SVG IDs, node IDs, merchant IDs, download filenames, and reconciliation rule names renamed consistently
- `screen.png` files and `Logo.png` are untouched.

## Intentional limits

- Passkeys require WebAuthn support (modern browsers); no fallback for legacy browsers.
- Self-service sign-up and password reset require `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- Demo mode does not deliver email and does not create PayPal invoices without credentials.
- Receipt upload is not implemented; only a receipt reference is stored.
- CI verifies the build; deployment automation is not included.
- Real PayPal and Gemini integrations require credentials and were not exercised against live services during
  verification. Their behaviour without credentials is tested and truthful. OpenRouter replaces Gemini in Phase 3.

## Documentation

- `README.md` — setup, scripts, routes, configuration, limits
- `AGENTS.md` — repository guidance for agents
- `.env.example` — environment variable reference
- `docs/IMPLEMENTATION_STATUS.md` — this file
