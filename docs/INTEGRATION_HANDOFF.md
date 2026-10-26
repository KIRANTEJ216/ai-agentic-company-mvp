# Live-integration requirements and remaining work

## Implemented in migration 006

Separate USD admission ledger with a lifetime owner budget and per-request reservation. Default budget zero blocks new paid generation until configured. Concurrent reservations serialize on the workspace row. Repeated request IDs do not reserve twice. Provider costs are rounded up to microdollars, recorded idempotently and protected by a unique generation ID. Unknown costs retain holds even when an app unit is refunded. Missing cost is never displayed as zero. Actual costs above the hold disable further AI admission and create an alert; they do not prevent manual drafting or approved publication. CSV exports distinguish recorded cost and holds. These are provider-reported costs, not independently audited invoices.

A per-call reservation is an admission policy, not a guaranteed upper bound on provider billing. Set an independent spending limit on a dedicated provider key. Existing general-agent chat/orchestration routes are outside this social ledger; the social generator now exclusively uses `SOCIAL_OPENROUTER_API_KEY` with no fallback to the general `OPENROUTER_API_KEY`. Do not configure the same key in both variables. No automatic provider retries or currency conversions are introduced. Operator reconciliation of uncertain charges remains required. Legacy usage created before migration has zero holds and unknown historical costs; reconcile historical provider bills and choose a forward-looking budget before enabling AI.

## Information/access needed

Supply non-secret identifiers and URLs in chat; put credentials only in the hosting secret manager.

| Area | Required input | Verification enabled |
| --- | --- | --- |
| Deployment | Staging HTTPS URL, hosting project and permitted deployment method | Redirect URI design, deployed auth and mobile checks |
| Supabase | Project reference; deploy/migration access; private bucket and registered test users for owner/editor/reviewer plus another tenant | Real RLS, resumable uploads, storage cleanup, authenticated testing |
| Meta app | App ID, chosen supported Graph version, configured Facebook Login product, approved scopes/access level, registered HTTPS callback | Self-service OAuth implementation and account discovery |
| Meta secrets | App secret in secret manager; a separate encryption key with documented rotation | Encrypted token lifecycle and callback validation |
| Social test accounts | Facebook Page ID and linked Instagram professional account; tester access; explicit selection of permitted test account | Scope validation, read-only insights and controlled publication testing |
| OpenRouter | Dedicated API key with provider-side spending limit, selected model, operator-approved USD request hold and lifetime budget | Verify real usage costs and reconcile provider statements |
| Worker/email | Scheduler and staging worker secret; optional verified sender | Durable cleanup and real failure notifications |

## Still to implement and verify

Self-service OAuth is not implemented in this release. It needs single-use expiring state bound to the authenticated owner and workspace, a fixed callback allowlist, server-side code exchange, encrypted credential storage, explicit account selection, least-privilege scopes, revocation/disconnect and expiry handling. Never return tokens to client APIs. Confirm the chosen Meta login product before coding scopes: Facebook Login and Instagram Login have different contracts. App review/access remains a provider prerequisite, not something application code grants.

Live analytics ingestion is not implemented. Define the permitted metric list against the chosen account type and Graph version, validate the remote account/post relationship, store observation time/period/definition and raw source IDs, deduplicate ingestion and expose permission/expiry failures. Missing or unsupported data stays unavailable. Do not add unrelated platform metrics together or describe enquiries as attributable sales without evidence.

Automated authenticated browser accessibility and assistive-technology verification are still pending. Use staging users to check keyboard-only navigation, focus after errors/modals, 320px/390px widths, screen-reader names/status announcements, zoom and contrast across all roles. No browser/screen-reader compliance claim is made by the build or SSR smoke test.

## Deployment order

1. Apply migrations 002–006 in order after migration 001, using staging first.
2. Deploy current application and worker, configure private chunk storage per SOCIAL_PHASE2.md.
3. Configure owner USD budget and request hold; zero budget intentionally blocks new AI calls.
4. Run authenticated staging and provider reconciliation tests before enabling live publishing.

Official contracts checked: https://github.com/OpenRouterTeam/docs/blob/main/api_reference/overview.mdx ; https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/get-started ; https://developers.facebook.com/documentation/instagram-platform/app-review . Recheck against the actual configured app/version at integration time.
