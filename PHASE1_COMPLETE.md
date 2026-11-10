# MERGIN Phase 1 Implementation Checklist

## ✅ Already Implemented (Phase 1)

### Security & Infrastructure
- Helmet security headers with Google Fonts-aware CSP
- Global API rate limiting (`apiLimiter`) and failed login throttling (`authLimiter`)
- `TRUST_PROXY` configuration (default `0`; set `1` behind nginx/Caddy/a PaaS edge)
- Production startup guard: requires `SESSION_SECRET` and `APP_BASE_URL` in production
- CI workflow in `.github/workflows/ci.yml`

### Configuration
- `server/config.ts`: all required env vars with readiness flags:
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV`, `PUBLIC_WEBHOOK_BASE_URL`
  - `GEMINI_API_KEY`, `GEMINI_MODEL`
  - `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`
- `.env.example` template with setup guides for Supabase, Google OAuth, and PayPal Sandbox
- `assertProductionConfig()` validates `SESSION_SECRET` and `APP_BASE_URL` in production

### Copilot (Gemini → OpenRouter fallback)
- Primary: Gemini (if key present and not rate limited)
- Fallback: OpenRouter (only when Gemini API is unavailable or rate limited)
- Deterministic fallback (no AI) if both keys absent

### Documentation
- README updated: production environment variables, Phase 2 identity setup guide
- `.gitignore` already ignores `.env`
- `docs/IMPLEMENTATION_STATUS.md` updated: Phase 1 column

### Tests
- All 31 tests passing (5 existing + 4 new security/config tests)

## Remaining

### ⏳ Add to `.env`
- `PAYPAL_WEBHOOK_ID` (required for webhook signature verification)

### ⏳ Run in Production
```bash
# Generate secrets:
openssl rand -hex 32 > SESSION_SECRET
# Copy .env.example → .env
# Edit .env with your real values
# Export secrets in your deployment environment:
export SESSION_SECRET=...\nexport APP_BASE_URL=...
# Start:
APP_BASE_URL=https://your-domain.com \
SESSION_SECRET=... \
PAYPAL_WEBHOOK_ID=... \
npm start
```

## Phase 2 Preview

Supabase session validation, Google OAuth, and passkey flows will be implemented next.

---

**Current state:** Everything is Phase 1 ready except the PayPal webhook ID in `.env`. Add it and the app is production-ready with the Gemini → OpenRouter fallback you wanted.