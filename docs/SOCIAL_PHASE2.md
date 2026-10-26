# Social MVP follow-up: reviews, calendar, uploads and retention

Apply migrations 202610260002, 202610260003 and 202610260004 in order after migration 001. Back up the database first. No new environment variables are required; the existing Supabase service credentials and secured social worker are required.

## Completed

- Exact-version comments, review requests and change requests. Requesting review or changes cancels queued delivery and clears approval. Editor/reviewer permissions are enforced in SQL, including stale-version rejection.
- Month/week calendar with local dates, channel filtering and links to editable posts.
- Resumable original-image uploads using 1 MiB chunks, immutable session identifiers, whole-file and chunk SHA-256 validation, bounded request sizes and decoded-image limits. Reselect the identical file after interruption to resume; browser storage holds only the upload reference. Pending sessions expire after 24 hours. Original images remain locked after drafting.
- Owner-controlled enquiry retention (disabled by default; 30, 90 or 365 days) and individual enquiry deletion.
- Owner workspace deletion with exact-name confirmation. Active generation reservations or uncertain/in-progress deliveries block deletion. Queued deliveries are cancelled. Workspace access stops immediately; records are purged after a 10-minute quarantine by the worker. Storage cleanup is durable, retries failures, and waits a further minimum 10 minutes after enqueueing. Actual completion depends on worker cadence and storage availability. Remote social posts and provider backups are outside this deletion operation.

## Operational setup

The private `social-originals` bucket must allow `image/jpeg`, `image/png` and `application/octet-stream` (temporary chunks). Keep the bucket private and disallow direct client writes. Run the existing secured worker regularly; it now also expires uploads, enforces retention and drains storage cleanup. Monitor worker logs and the service-only `social_storage_cleanup` queue for repeated errors. Cleanup processes at most 20 objects per invocation.

The former single-request POST `/api/social/upload` returns HTTP 410; use `/api/social/uploads` with start, part and complete actions. Deploy migrations before the updated application. Do not roll back only the application to the retired upload implementation after enabling deletion.

## Validation and limits

Database tests execute all migrations in PostgreSQL (PGlite), including existing publication safeguards, role restrictions, hidden legacy command functions, exact-version reviews, upload manifests, approval invalidation and quarantine/purge cleanup. Type checking, lint, production build and local HTTP smoke checks are run separately. No live Supabase storage, OAuth, social publication, email or production deployment is claimed by these tests.

Still pending: self-service OAuth and credential lifecycle, provider-backed analytics ingestion, live account verification, real monetary AI spending controls, richer crop editing and accessibility testing with a browser/screen reader. Connected inbox automation, listening, advertising, advanced video and additional channels remain phased backlog. Missing metrics remain unavailable rather than invented.

## Fact maintenance and alert follow-up (migration 005)

Apply `202610260005_fact_versions.sql` before deploying this update. Editors/owners can edit product and brand names and confirmed facts with optimistic version checks. Affected queued deliveries are cancelled; content versions increment, approval is cleared, and captions require manual correction and fresh approval. Existing published evidence is retained. Fact editing is blocked while affected publication is in progress/uncertain or AI generation is reserved. AI re-reads knowledge after reservation to avoid racing fact edits.

Alerts support per-user read/dismiss actions. Dismissing does not change delivery state, email delivery or reconciliation requirements. Search filters the post list by caption/product name; calendar delivery visibility is retained. No new provider permissions or environment variables are introduced.

Recommended next release gates: authenticated mobile keyboard/screen-reader testing, self-service OAuth with encrypted token rotation and revocation, provider-specific insight definitions and freshness, and an independently reconciled monetary spending ledger. Monetary caps must account for uncertain provider charges before enabling automatic paid retries; existing app units are not a currency budget. These capabilities are still pending and must not be advertised as complete.
