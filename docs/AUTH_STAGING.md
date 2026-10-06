# Independent email login: staging checklist

The email implementation is dormant. `AUTH_OTP_ENABLED` must equal the literal
`true` before requests are allowed. Leave it unset or `false` on production.
The public `/api/auth/config` endpoint disables the email form until the gate and
provider configuration are ready. The existing Manus login is advertised only
when its portal URL, server URL and app ID are configured. Existing Manus session
cookies remain supported; an invalid independent session never falls back to
Manus.

This document describes the implementation. `AUTH_SPEC.md` and
`AUTH_SPEC_V2.md` are historical proposals and contain older schema, SMTP, JWT,
and session-renewal designs. SMS and automatic session renewal are not included.

## Behavior

- A normalized mailbox receives a six-digit code valid for five minutes.
- Stored codes use HMAC-SHA256 bound to the normalized email and login purpose.
  Codes and raw session tokens are never logged or stored.
- Database row locks serialize issue and verification across server instances.
  A code is consumed once. Five incorrect guesses lock that mailbox for fifteen
  minutes; requesting a fresh code does not bypass the lock.
- Resend is limited to once per sixty seconds and five requests per mailbox per
  hour. One client IP has thirty sends and twenty verification requests per hour.
  These are durable fixed-hour windows, not process-local counters.
- New email accounts retain the existing required `openId` column through a
  deterministic `email:` identifier. Account creation, the two initial credits,
  code consumption and session creation share one transaction.
- Existing mailbox accounts keep their user ID, Manus openId, role and balance.
  Two matching normalized legacy emails cause a rejection and require manual
  account review. The implementation never silently chooses one account.
- Sessions are random 256-bit opaque tokens, stored only by SHA-256 hash, expire
  after seven days, and are revoked server-side on logout. At most five sessions
  per user remain active. Cookies are HttpOnly, SameSite=Lax and Secure on
  production. Role and profile come from the current database user, not a token.

## Database preflight on a staging copy

Do not run the old untracked `drizzle/migrations/0002_otp_auth.sql` alongside the
tracked migration. It changes the legacy users schema and is not this rollout.

Inspect the existing schema and migration journal on a staging copy first:

```sql
SHOW CREATE TABLE users;
SHOW CREATE TABLE plan_credits;
SHOW TABLES LIKE 'otp_codes';
SHOW TABLES LIKE 'auth_sessions';
SHOW TABLES LIKE 'auth_identity_limits';
SELECT LOWER(TRIM(email)) AS normalizedEmail, COUNT(*) AS count
FROM users WHERE email IS NOT NULL AND TRIM(email) <> ''
GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1;
SELECT COUNT(*) AS syntheticIds FROM users WHERE openId LIKE 'email:%';
```

If `otp_codes` already exists, inspect `SHOW CREATE TABLE otp_codes`. It must have
`id`, `email`, `codeHash` (varchar 64), `purpose`, `expiresAt`, `consumedAt`,
`attempts`, and `createdAt`. A previous plaintext `code` table needs a separately
reviewed staging conversion before enabling email login. `CREATE TABLE IF NOT
EXISTS` intentionally does not pretend to repair an incompatible existing table.
An older compatible manual table may lack the email/created index; add it in a
separate reviewed staging change if needed. Reject unexpected pre-existing
`email:` identifiers or duplicate normalized emails until their ownership is
resolved. Never delete or merge financial history automatically.

The tracked `drizzle/0003_independent_auth.sql` creates only the three auth tables
and does not change the users table or apply pending payment constraints. Its
journal entry and `0003_snapshot.json` describe that same auth-only change.
Future generation must still show the pending payment/schema drift rather than
silently treating it as deployed.

Use the normal tracked migration runner with a verified staging database URL.
Avoid `pnpm db:push`: it generates additional schema migrations before applying
them. No migration has been applied to production as part of this change.

## Staging configuration

```text
AUTH_OTP_ENABLED=false
AUTH_OTP_SECRET=<independent random secret of at least 32 characters>
RESEND_API_KEY=<staging provider key>
FROM_EMAIL=login@your-verified-domain.example
APP_BASE_URL=https://your-staging-host.example
AUTH_TRUST_PROXY_HOPS=<1 or 2, only after verifying the deployment proxy chain>
JWT_SECRET=<existing Manus session secret, retained for compatibility>
PAYMENTS_ENABLED=false
```

`AUTH_OTP_SECRET` falls back to `JWT_SECRET` if absent, but a separate secret is
preferred. Production requires an HTTPS `APP_BASE_URL`. The current code accepts
only bare sender mailboxes in `FROM_EMAIL`, not display-name syntax. SMTP variables
are not used; this implementation sends directly through Resend.

The provider request uses `POST https://api.resend.com/emails`, Bearer authorization,
JSON `from`, `to`, `subject`, and `text`, and requires a successful response with an
email `id`. This matches the [official Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email)
and its [official OpenAPI schema](https://github.com/resend/resend-openapi/blob/main/resend.yaml)
(checked 6 October 2026). A provider ID proves acceptance, not delivery to a real
inbox. Network timeout, HTTP rejection and malformed acceptance responses fail
the request and invalidate the challenge; no development console fallback exists.

The client sends JSON from the exact configured origin. Form submissions, missing
or foreign Origin headers, and cross-site browser requests are rejected. Requests
through a second domain need its own verified `APP_BASE_URL` configuration.

Express does not trust forwarded IP headers by default. On Railway staging,
verify the actual proxy chain and that the exposed service cannot be reached
through a shorter path before setting `AUTH_TRUST_PROXY_HOPS=1` or `2`. The app
accepts only these explicit values and never blanket `trust proxy=true`. Without
this setting, proxy traffic intentionally shares the proxy IP rate limit. Confirm
two real clients produce distinct `req.ip` values without trusting client-supplied
headers before turning the email gate on.

## Validation before activation

1. Run type checking, handler/context tests, the production build, and the
   disposable MySQL integration suite. CI migrates `teachassist_test` on loopback,
   runs migrations again to check journal replay, then tests real row locks,
   concurrent codes, account/grant rollback, existing account linking and session
   revocation. The integration suite refuses every non-test destination before
   connecting or cleaning rows. Locally it is skipped unless that explicit test
   database is provided.
2. Apply the tracked auth migration to staging only and verify the schema.
3. Configure a verified Resend sender and approved proxy trust; enable the gate
   on staging. Request a code to an owned test mailbox and confirm actual inbox
   delivery. Do not substitute an invented SMTP URL or log-based code delivery.
4. Sign in as an existing teacher and confirm the same ID, plans, credits and
   purchases. Sign in as a new teacher and confirm exactly two initial credits.
5. Verify a protected tRPC request, a saved-plan download and a worksheet download.
   Try five wrong codes, a consumed code, expiry, simultaneous verification,
   resend cooldown and logout. A copied session token must stop working after
   logout; changing a user's database role must be reflected on the next request.
6. Retain `PAYMENTS_ENABLED=false`. Live payment provider onboarding, payment PR
   review and production activation remain separate pending work.

An actual staging inbox and Railway smoke test remain deployment prerequisites.
The implementation and local tests alone do not establish successful delivery or
production readiness.
