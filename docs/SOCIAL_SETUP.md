# Flologix Social MVP

Route: `/social`. Existing agent pages remain available. This is a new module in the existing Next.js 16 / React 19 application. It reuses the installed Supabase client and UI conventions. There was no implemented sign-in or deployed database schema in the baseline repository. The old dashboard is still demo content; `/social` never fabricates live metrics.

## Local setup

1. Install Node 22 or newer and run `npm ci`.
2. Create a Supabase project. Apply `supabase/migrations/202610260001_social.sql` in its SQL editor, or through the Supabase CLI migration workflow. This is the initial social schema; do not repeatedly run it in an existing schema. Back up production before migrations.
3. Create a **private** storage bucket named `social-originals`. Set its upload size limit to 8 MB and permit JPEG and PNG only. Do not add public read policies or browser write policies. The server validates the user and uploads with the server service key. Originals are immutable after the first draft. Signed download URLs expire after 60 seconds; provider URLs after 15 minutes.
4. Copy `.env.example` to `.env.local`. Set the Supabase public URL, anonymous key and server service-role key. Supabase keys must belong to the same project. The service key must never be a NEXT_PUBLIC variable.
5. Configure Supabase Auth email/password sign-in and email confirmation; set your project/site redirect URLs. Register at `/social`, confirm the email, then sign in. Production needs a configured Auth email sender.
6. Run `npm run dev`. Create one owner workspace, then a brand, product, original image, manual draft, approval and future schedule. An owner can add an already registered editor/reviewer by Auth UUID in Settings. No invitation emails are claimed.
7. Optionally configure `OPENROUTER_API_KEY` and `SOCIAL_AI_MODEL`. One generation reserves one app unit and returns two editable captions. Model price and provider billing are NOT represented as currency in this pilot. The model is not permitted to write to the database or publish. All output needs owner review.
8. Set a long random `SOCIAL_WORKER_SECRET`, then run `npm run worker` alongside the web server. The worker polls an authenticated internal endpoint. Use an always-running worker host or a scheduled authenticated POST to `/api/social/worker`; ordinary web hosting alone does not run jobs.

## Publishing connection

The Meta Facebook Login adapter is implemented but **not live tested**. Nothing is sent unless `SOCIAL_LIVE_PUBLISHING=true` and a valid account connection exists for the particular workspace/channel. Do not enable until an authorised test can be performed. Select a currently supported API version in official Meta documentation; no default version is guessed.

`SOCIAL_META_CONNECTIONS` is server secret JSON with this shape:

```json
{"WORKSPACE_UUID":{"instagram":{"account_id":"INSTAGRAM_PROFESSIONAL_ACCOUNT_ID","access_token":"PAGE_TOKEN"},"facebook":{"account_id":"FACEBOOK_PAGE_ID","access_token":"PAGE_TOKEN"}}}
```

Use a Meta developer app and official account authorisation flow to obtain the correct scopes and tokens. App review, account eligibility and token lifetimes depend on the app's access level. This release does **not** implement self-service OAuth onboarding or automatic token refresh. An operator configures and rotates tokens in the hosting secret manager. Never paste tokens into the application forms or a support ticket. Restrict secret-manager access.

The adapter publishes one original image and a caption, then reads the remote ID and permalink as evidence. Instagram requires an original JPEG in this adapter. Interactive effects, carousels, videos, platform analytics and inboxes are outside this adapter's release. Original image/caption export and a deterministic browser-rendered JPEG layout remain available for manual publication. The layout places text outside the original image, scales it to fit, and preserves the uploaded source file. The live adapter publishes the original, not this exported layout; upload a reviewed layout as a separate product to publish it through the adapter. Meta can reject dimensions or aspect ratios; handle the failure rather than silently modifying the original. Check current platform requirements before enabling.

The pre-send approval and pause checks run in the database and worker. Already executing external requests cannot be recalled by pause. There is no distributed exactly-once guarantee across external APIs: uncertain sends enter Confirming and are never automatically resent. A successful remote operation whose local commit is lost will also need reconciliation.

Reference: Meta's official Instagram Postman collection at https://www.postman.com/meta/instagram/overview and Meta Graph API documentation. Live permissions, remote photo permalink retrieval and API-version compatibility remain deployment checks, not test claims.

## Failure recovery

* No credentials: due jobs become Failed with an in-app notification and manual-export guidance.
* Permission or network uncertainty: the Meta adapter conservatively uses Confirming. An operator must inspect the destination; do not use a fresh job to bypass reconciliation.
* Worker crash: expired Publishing leases become Confirming on the next poll. No blind resend.
* Retryable pre-send failure: an editor can retry a Failed job. Publishing ignores AI generation allowance.
* Content edit: invalidates approval and cancels pending jobs. Editing is blocked during Publishing/Confirming.
* Generation timeout: reservation remains pending. Inspect provider billing and request ID before deciding settlement. The UI retains the same request ID in sessionStorage to prevent duplicate generation after reload in the same tab. Do not clear it to retry a pending call.

For generation reconciliation, an operator uses `social_settle(request_id, output_json, refund_boolean)` through a privileged database session. This is idempotent and service-only. Do not refund based only on elapsed time. For delivery reconciliation, call the service-only social_reconcile(job_id, verified_remote_id, verified_url, not_published) function after checking the destination. It records the job, variant and audit event atomically. A self-service reconciliation UI is not included.

Pilot allowance starts at 20 units per workspace. One owned workspace per user. Operators adjust allowances through controlled database changes; subscription checkout does not grant social allowance. Production abuse protection and commercial currency accounting require additional work before open registration.

## Deployment and operations

Deploy the Next.js server and a persistent worker or scheduler. Configure secrets separately in each environment; run migrations before directing traffic to the new module. Use TLS, private storage and database backups. Keep staging accounts isolated from production. Monitor failed/confirming jobs, old reservations, worker heartbeat and notification volume. Store structured logs without tokens, original files, or customer contact details. Document the hosting backup retention and test restoration before launch.

Failure-email outbox code is implemented but unverified with a live sender. Set RESEND_API_KEY and SOCIAL_ALERT_FROM to a verified sender; the worker drains one email per poll. Uncertain sends are held for reconciliation. Connected OAuth health checks and automatic metrics ingestion are **not implemented**. Failures appear in-app after refresh regardless of email configuration. Asset uploads use resumable, verified chunks; configure the bucket as described in SOCIAL_PHASE2.md. Do not market the pilot as production complete. Owner-controlled workspace deletion and enquiry retention run through the secured worker; provider backups and remote posts require separate handling.

Legacy agent-chat/orchestration endpoints predate this module and are not covered by the social ledger. Restrict access/rate-limit them at the gateway before exposing paid provider keys publicly. This change does not claim to harden every legacy route. Stripe webhook signature verification was fixed; it still does not persist subscriptions or entitlements.

## Tests and status

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Embedded PostgreSQL tests execute the actual migration against an Auth shim and real RLS roles. They cover wrong workspace, editor approval denial, invalidated approval, stale writes, cancelled jobs, spend exhaustion, idempotent reservation/refund, one generation start, pause, worker crash and uncertain sends. These do not replace a staging Supabase test, concurrent multi-session load test, or live Meta test. Provider tests mock the API and assert proof checks/uncertainty; they do not claim external delivery.

## Research mapping and backlog

* Buffer/Publer: simple composer and unified filtered calendar.
* Planable: version-specific approvals and stale edit rejection. Multi-step approvals and comments are backlog.
* SocialBee: brand/product organisation. Content pillars, search and recurring schedules are backlog.
* Predis feedback: immutable original assets, editable captions, original download, visible reservation ledger. Selective video regeneration is backlog.
* Ocoya/Buffer feedback: persisted jobs, failure notifications, manual fallback and uncertainty reconciliation.
* Metricool/Agorapulse: definitions, missing metrics labelled, CSV exports. Current release has no live metrics provider.
* Manychat: owner-entered enquiries, stages and follow-up date. Conversation sync/automatic replies are deferred.
* Pricing feedback: explicit pilot allowance and exactly-once app settlement; currency cost forecasting/checkout deferred.
* Accessibility: labelled native forms, keyboard focus, status announcements and responsive layout. Formal accessibility conformance is unverified.
* Next: OAuth connection management, real insights ingestion, brand fact editing with downstream invalidation, alt text, crop controls, real campaign UTM attribution, content search, notifications read/dismiss, and mobile browser testing with authenticated staging data.


Follow-up migrations and resumable-upload bucket configuration: see [SOCIAL_PHASE2.md](SOCIAL_PHASE2.md).


Migration 006 adds a USD admission ledger and requires the dedicated `SOCIAL_OPENROUTER_API_KEY` for Social generation; there is no fallback to the general-agent key. See [INTEGRATION_HANDOFF.md](INTEGRATION_HANDOFF.md) for budget semantics, staging requirements and remaining work.
