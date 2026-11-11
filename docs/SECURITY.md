# Security operations

MERGIN keeps its security controls in code, but production safety also depends on how the server is deployed. This
page lists what the app enforces and what the operator must provide.

## Secrets

- Keep `.env` out of git. `.env.example` contains names and safe defaults only.
- `SESSION_SECRET`, PayPal, Supabase, SMTP, and AI provider keys live only in the server environment. None are
  exposed through Vite variables or API responses.
- Use a unique `SESSION_SECRET` per environment (`openssl rand -hex 32`). Rotating it signs every user out.
- Rotate a provider key immediately if it is pasted into a ticket, log, or chat.

## Identity and sessions

- Passwords are stored as scrypt hashes with a per-user salt.
- Session cookies are HMAC-signed, `HttpOnly`, `SameSite=Lax`, and `Secure` when `NODE_ENV=production`.
- Unsafe API methods reject browser requests whose `Origin` does not match `APP_BASE_URL`.
- Protected routes call `requireAuth`; the public payment route exposes one invoice by random token only.
- Failed sign-in attempts are rate limited. API responses are `Cache-Control: no-store`.

## Data at rest

- SQLite stores business records in plaintext (`dev.db` by default). Disk encryption or an encrypted volume is the
  operator's responsibility.
- Do not commit `*.db`, WAL, or shared-memory files. `.gitignore` covers them.
- Back up the database with SQLite's backup mechanism (or copy the file while the API is stopped), encrypt backups,
  and test restores.
- `audit_events` and `webhook_events` are the security-relevant trail. Define a retention period appropriate to the
  business before pruning them.

## Transport and email

- Terminate TLS at a reverse proxy or platform edge, set `TRUST_PROXY` to match that topology, and keep
  `APP_BASE_URL` on HTTPS in production. HSTS is enabled when `NODE_ENV=production`.
- Use STARTTLS on port 587 or TLS on port 465 for SMTP.
- Configure SPF, DKIM, and DMARC for the sending domain with the SMTP provider. These are DNS records, not app code.
- Invoice email subjects and addresses are stripped of CR/LF before sending; HTML bodies escape user text.

## PayPal webhooks

- Paypal sends `POST /api/paypal/webhook`. The endpoint refuses requests until `PAYPAL_CLIENT_ID`,
  `PAYPAL_CLIENT_SECRET`, and `PAYPAL_WEBHOOK_ID` are set.
- Every event is verified with PayPal before processing. Event IDs are stored so duplicate deliveries are ignored.
- Never mark an invoice paid from a browser redirect; only verified webhooks or server reconciliation change status.

## Deployment checklist

- [ ] `SESSION_SECRET` and `APP_BASE_URL` set; `npm run build` run before `npm start`.
- [ ] TLS enabled and `TRUST_PROXY` matches the proxy hop count.
- [ ] `APP_BASE_URL` is the exact browser origin used in production.
- [ ] PayPal webhook points at `https://<host>/api/paypal/webhook` with the invoicing events selected.
- [ ] SMTP credentials verified and SPF/DKIM/DMARC published.
- [ ] Database volume encrypted; backup and restore tested.
- [ ] Logs shipped somewhere durable with a retention policy; provider error text reviewed before sharing.
- [ ] `/api/health` monitored; it returns 503 when the database check fails.
