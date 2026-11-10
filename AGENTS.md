# AGENTS.md

Guidance for agents working in this repository.

## What this is

MERGIN is a full-stack React + Node MVP of a monochrome small-business finance workspace, built from the supplied
Stitch screens in `Stitch Screens/`. The running app lives in `src/` (React) and `server/` (Express + SQLite).
The Stitch exports are **reference only** — edits there do not change the app.

## Run it

```bash
npm install
npm run db:reset     # required after schema/seed changes
npm run dev          # API :3001 + Vite :5173
```

Sign in with **Launch demo**, or `demo@mergin.example` / `mergin-demo`.

Individual commands:

```bash
npm run dev:api
npm run dev:web
npm run typecheck
npm run lint
npm test
npm run build
```

Node 22.5+ is required for `node:sqlite`. The repo is not a git repository.

## Architecture

- **Frontend:** React 19, React Router 7, Vite, Tailwind CSS built locally. Fonts (Inter, Material Symbols
  Outlined) load from Google Fonts. No component library.
- **Backend:** Express 5, Zod validation, `node:sqlite` via a typed repository layer in `server/db/`.
- **Shared domain:** `shared/` holds types, integer money math, date helpers, and deterministic Sentinel detection.
  Both server and client import from it.
- **Persistence:** a single SQLite file (`dev.db` by default). All amounts are integer minor units.
- **Auth:** labelled demo session with a signed HTTP-only cookie (`mergin_session`). No localStorage auth, no
  external identity provider.
- **PayPal:** server-side OAuth and Invoicing API v2 in `server/services/paypal.ts`. Webhook verification and
  idempotent event handling in `server/services/webhook.ts`.
- **Gemini:** `server/services/copilot.ts` computes every fact deterministically; `@google/genai` (server-only) may
  only phrase the explanation. No key means a deterministic local answer.

## Key constraints

- **Monochrome design system.** Follow `Stitch Screens/achromatic_financial_architecture/DESIGN.md`. No colored
  status chips; use text, icons, and tone. Use Inter and tabular numerals for money.
- **Integer money only.** Never introduce floating-point money math. Use helpers in `shared/money.ts`.
- **Brand:** use assets in `public/brand/`; the source mark is `Logo.png` at the repo root. Do not hotlink the old
  remote logo or reintroduce "ZELVO" in the working UI.
- **PayPal truthfulness.** Never mark an invoice paid on browser return. Reconcile from the server/webhook. Missing
  credentials must produce truthful UI and API responses, not fake success.
- **Demo labels.** Demo mode must stay visibly labelled. Never show a success toast for an action that did not
  happen (for example, "invoice emailed" when no email was sent).
- **Sentinel evidence.** Only report patterns with at least three matching ledger observations. Never claim a
  subscription is used or unused without usage telemetry; the UI states telemetry is not connected.
- **Secrets:** never commit `.env`, real PayPal credentials, or a Gemini key. `.env.example` documents variables
  without values.
- **Controls:** every visible control must work or be visibly disabled with a reason.

## Where things live

| Path | Contents |
| --- | --- |
| `src/pages/` | One component per route |
| `src/components/` | `AppShell`, onboarding shell, UI primitives, SVG charts |
| `src/context/AppContext.tsx` | Workspace/session state and toasts |
| `src/lib/` | API client, formatting, CSV export helpers |
| `src/index.css` | Design tokens, base styles, print rules |
| `server/routes/` | Express route modules |
| `server/db/` | Schema, seed, typed repositories |
| `server/services/` | PayPal, Gemini, webhook reconciliation, Sentinel, Copilot |
| `shared/` | Domain types, money, dates, Sentinel detection |
| `tests/` | Vitest suites |
| `docs/` | Implementation status and notes |

## Workflow

1. Read the relevant page in `src/pages/` and the API route/repository it uses.
2. Run `npm run db:reset` after changing schema or seed data.
3. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` before calling work done.
4. If you exercise mutating flows in the browser, finish with `npm run db:reset` (or the in-app reset) so the demo
   workspace is clean.
5. Editing `server/` under `tsx watch` restarts the API. If `SESSION_SECRET` is unset, the session cookie becomes
   invalid and you must sign in again.

## What to avoid

- Don't edit `Stitch Screens/*/screen.png`; they are the visual reference.
- Don't treat `Stitch Screens/*/code.html` as the app; they are archived exports.
- Don't add floating-point money handling, colored semantic states, or a chart library.
- Don't commit `dev.db`, `.env`, `dist/`, or `node_modules/`.
- Don't claim PayPal or Gemini actions succeeded without server evidence.
