# Implementation status

Branch: `feat/flologix-social-mvp`. The code is reviewable pilot implementation, not an assertion of production readiness. No production migration, deployment, paid API call, email or public post was performed.

## Implemented

- A `/social` module alongside existing agent pages, native Supabase email/password sign-in, workspace creation and owner/editor/reviewer roles.
- Confirmed brand/product facts, private original images, SHA-256 original checksums, image validation, immutable assets after drafting, signed downloads and a deterministic JPEG layout export for manual use.
- OpenRouter caption generation in English/Telugu, editable per-channel drafts and previews. Persisted app-unit reservation, single-start generation, idempotent settlement/refund and uncertain-request reconciliation.
- Database-enforced version approvals, stale write rejection, rescheduling/cancellation, persisted jobs, worker leases and pause controls. Generation allowance does not gate publishing.
- Meta single-image adapter and remote evidence verification behind explicit live-enable flag and server-managed workspace credentials. Uncertain outcomes cannot automatically resend. Service-only reconciliation function.
- In-app failure notifications and optional Resend email outbox with idempotency keys and uncertain-send handling.
- Manual enquiry capture, stages, follow-up dates, delivery/usage summaries and formula-safe CSV exports. Missing social metrics remain unavailable.
- Row-level read isolation, transactional role-checked mutation functions, protected server credentials, bounded HTTP bodies, worker authentication and signed Stripe webhook verification.
- Initial migration, environment example, worker runner, CI checks and setup/operations guide.

## Validation performed

- Embedded PostgreSQL executes the actual migration using an Auth shim and real unprivileged roles. Tests cover tenancy, reviewer/editor boundaries, stale approval, cancelled schedules, exhausted allowance, duplicate reservation and refund, one generation start, pause and expired worker leases.
- Unit tests cover formula-safe CSV, file magic validation, bounded request reading and mocked Meta remote proof/uncertain outcomes.
- TypeScript, ESLint and production build pass locally. HTTP smoke tests check social SSR, honest unconfigured status, worker auth refusal and unconfigured Stripe refusal.
- Browser visual/interaction testing was attempted but unavailable: the browser binary was missing and its download returned an invalid archive. No authenticated browser or live integration test is claimed.

## External setup needed

1. Apply migration to a staging Supabase project and create the private `social-originals` bucket.
2. Configure Supabase Auth and server secrets. Set an OpenRouter model to test generation; review language quality with the owner.
3. Configure Meta app permissions, supported Graph version, account IDs and authorised server tokens. The adapter uses operator-managed tokens; OAuth self-service and refresh are not implemented.
4. Deploy a persistent worker or authenticated scheduler. Configure a verified Resend sender for email.
5. Run real staging flows and approve a test publication before enabling production. Review existing legacy AI endpoint exposure separately as described in setup.

## Scope gaps requiring further engineering

Live analytics ingestion, self-service OAuth and permission health, automatic retention/deletion, resumable uploads, crop controls/alt text, comments/change requests, full month/week calendar, actual model-cost currency settlement and granular role administration remain incomplete. The current calendar is a unified post/job list, allowances are pilot units, and lead tracking is manual. Setup documentation explains these limits. Connected inbox, generative video, listening, ads and extra channels remain in the planned later phases.
