# Arcflow Automation — Portfolio Project 4

Arcflow is a fictional B2B lead-operations system that demonstrates a real database-first automation workflow rather than a decorative dashboard.

## Business problem
Inbound B2B requests often disappear between forms, spreadsheets, CRMs and manual follow-up. Arcflow captures the request first, records every automation step, keeps failures visible, prevents duplicate side effects and gives an operations manager one place to continue the work manually.

## Workflow architecture
Public lead form → PostgreSQL persistence → structured AI analysis or deterministic fallback → internal CRM state → email outbox → manager notification → priority-based follow-up → execution history.

Every workflow run stores status, timestamps, duration, retry count and an error summary. Every workflow step stores status, attempt, timestamps, output summary and a user-readable error.

## Stack
- Next.js 16 / React 19 / TypeScript
- PostgreSQL on Neon
- Vercel AI SDK 7 + Zod structured output
- Signed HttpOnly cookie sessions
- Vitest + ESLint + TypeScript CI
- Vercel production deployment

## Database
The production database is the dedicated Neon database `arcflow_automation`.

Core tables:
- `leads`
- `workflow_runs`
- `workflow_steps`
- `notes`
- `follow_ups`
- `notifications`
- `email_outbox`

Run `db/schema.sql` against a fresh PostgreSQL/Neon database for reproducible setup.

## Reliability and failure handling
- Lead persistence happens before downstream automation.
- `leads.idempotency_key` prevents duplicate lead submissions.
- Unique follow-up, notification and outbox keys prevent duplicate side effects.
- Retry is capped at 3 and atomically claims a failed/partial run before replay.
- Rapid duplicate retry clicks cannot replay the same workflow concurrently.
- Completed CRM/follow-up/notification actions are reused rather than duplicated.
- Unexpected downstream failures preserve the Lead and record a safe workflow state.
- User-facing errors are stored as concise operational messages rather than raw stack traces.

## AI structured output and zero-cost fallback
The AI path uses AI SDK 7 `Output.object()` with a Zod schema for category, request type, urgency, estimated value, department, priority, summary and recommended action.

Live AI is an explicit opt-in:
- `LIVE_AI_ENABLED=0` is the zero-cost portfolio default.
- When live AI is unavailable or disabled, deterministic fallback classification runs.
- The Lead remains persisted and the workflow becomes a reviewable partial/fallback state.
- The fallback is never presented as a successful LLM result.

No paid OpenAI/API credits are required for the portfolio deployment.

## Email outbox
No outbound email provider is enabled by default. Planned customer messages are persisted once in `email_outbox` with `pending_setup` or failure state. The dashboard shows recipient, subject, body, status and failure reason. It never claims “Sent” unless a real provider eventually returns a delivery ID.

## Auth and server-side security
Dashboard routes call `requireSession()` server-side. Lead edits, notes, workflow retry and follow-up mutations are server actions that also require a valid signed HttpOnly session. Passwords and DB/session secrets are production environment variables and are not exposed to the browser bundle.

## Environment
Copy `.env.example` to `.env.local` for local development.

Required:
- `DATABASE_URL`
- `AUTH_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `MANAGER_EMAIL`
- `MANAGER_PASSWORD`

Optional:
- `LIVE_AI_ENABLED=1`
- `AI_GATEWAY_MODEL`
- test-only `SIMULATE_AI_FAILURE=1`

## Local setup
```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm run dev
```

## Tests and CI
GitHub Actions verifies:
- TypeScript
- ESLint
- Vitest business-logic tests
- Next.js production build

The database is additionally protected by PostgreSQL unique constraints and foreign keys; production QA checks verify that duplicates are not present.

## Deployment
Vercel project: `arcflow-automation-demo`.

Production secrets belong only in Vercel environment variables. Do not commit real credentials.

## Known zero-cost limitations
- Live AI is disabled unless a no-additional-cost allowance is explicitly confirmed.
- Outbound email is intentionally not connected to a paid provider.
- SMS, external CRM SaaS and paid monitoring are intentionally omitted.
- Browser/visual QA remains a separate final pass after the production deployment is healthy.
