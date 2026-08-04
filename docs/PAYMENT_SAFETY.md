# Payment safety release gate

This change keeps payment creation disabled unless `PAYMENTS_ENABLED=true` is set exactly.
Webhook settlement remains available while checkout is disabled so an already-started, genuinely
paid transaction can still grant its entitlement.

## Required environment variables

- `PAYMENTS_ENABLED`: defaults to disabled; use `true` only after sandbox acceptance.
- `APP_BASE_URL`: HTTPS application origin used for callbacks.
- `MYFATOORAH_API_KEY`: required only when MyFatoorah is offered.
- `MYFATOORAH_BASE_URL`: optional provider base URL.
- `TAP_SECRET_KEY`: required only when Tap is offered.
- `TAP_BASE_URL`: optional provider base URL.
- `PAYMENT_HTTP_TIMEOUT_MS`: 1,000–30,000 ms; defaults to 10,000.
- `TRUST_PROXY_HOPS`: optional explicit proxy hop count, 1–5. It defaults to no trusted proxy.

Do not configure `TRUST_PROXY_HOPS` by guessing. Confirm the Manus/Cloudflare topology first.

## Migration preflight (read-only)

Run these queries on a restored backup or staging copy before applying the payment-safety migrations:

```sql
SELECT gateway, gatewayRef, COUNT(*) AS duplicates
FROM purchases
WHERE gatewayRef IS NOT NULL
GROUP BY gateway, gatewayRef
HAVING COUNT(*) > 1;

SELECT userId, termId, COUNT(*) AS duplicates
FROM subscriptions
GROUP BY userId, termId
HAVING COUNT(*) > 1;

SELECT purchaseId, COUNT(*) AS duplicates
FROM subscriptions
WHERE purchaseId IS NOT NULL
GROUP BY purchaseId
HAVING COUNT(*) > 1;

SELECT id, userId, status, createdAt
FROM purchases
WHERE kind = 'semester' AND status = 'pending';
```

Every query must be reviewed. The first three must return zero rows before adding the unique
constraints. Legacy pending semester purchases need manual reconciliation to the correct term or
refund/cancellation; the migrations deliberately do not invent a country or term. After applying the
migrations to staging, verify legacy pending rows with:

```sql
SELECT id, userId, kind, status, createdAt
FROM purchases
WHERE status = 'pending' AND (countryId IS NULL OR (kind = 'semester' AND termId IS NULL));
```

## Safe rollout order

1. Keep `PAYMENTS_ENABLED=false` and back up the database.
2. Restore the backup to staging and run the preflight queries.
3. Apply the migration to staging only.
4. Configure one provider's sandbox credentials, HTTPS callback URL, and the verified proxy hop count.
5. Confirm the provider's actual status payload contains the expected currency field. Missing currency
   fails closed and is never replaced with a default.
6. Run successful, rejected, duplicate, delayed and concurrent webhook scenarios against the staging DB.
7. Test rollback by forcing entitlement insertion to fail and confirm the purchase remains `pending`.
8. Enable checkout in staging with `PAYMENTS_ENABLED=true`.
9. Do not migrate or enable production until the staging evidence has been reviewed.

## Security model

- Browser and webhook bodies are untrusted triggers.
- Amount, currency, gateway and term come from the server-side purchase record.
- Payment state is retrieved directly from the configured provider using the server credential.
- Entitlement creation, webhook event reservation, audit success and `paid` status are committed in one
  database transaction.
- A row lock plus unique gateway/event and gateway/reference constraints prevents duplicate grants.
- Audit failures never leak provider or database error messages to clients.

The in-memory rate limiter is a fixed-window, single-instance safeguard. Replace it with Redis or an
equivalent shared store before horizontal scaling.
