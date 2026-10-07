# Arcflow Automation — Portfolio Project 4

Arcflow is a fictional B2B lead-operations system built to demonstrate real workflow automation rather than a decorative dashboard.

## Real workflow

Public lead form → database-first persistence → AI classification → CRM state → email outbox → internal manager notification → priority-based follow-up → execution history.

### Reliability
- PostgreSQL unique idempotency key prevents duplicate leads.
- Unique outbox/notification/follow-up keys prevent duplicate side effects during retry.
- Every workflow step stores status, timestamps, summary and error details.
- AI output is schema-validated with Zod. On AI failure the lead stays saved and receives deterministic fallback classification.
- Retry is capped at 3 attempts and retries failed actions without recreating CRM/follow-up records.
- Dashboard mutations are server actions guarded by a signed HttpOnly session.

### AI
Uses Vercel AI Gateway through the Vercel AI SDK. `AI_GATEWAY_MODEL` defaults to `openai/gpt-5.4-nano`. The deployment should use Vercel OIDC authentication.

### Email
No production email provider is configured in this portfolio deployment. Customer confirmation is stored once in `email_outbox` with `pending_setup`; the workflow UI explicitly marks that step as skipped rather than claiming an email was sent.

## Environment
- `DATABASE_URL`
- `AUTH_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `MANAGER_EMAIL`
- `MANAGER_PASSWORD`
- `AI_GATEWAY_MODEL`
- Optional test-only: `SIMULATE_AI_FAILURE=1`

## Commands
`npm run build` · `npm run typecheck` · `npm run lint` · `npm test`
