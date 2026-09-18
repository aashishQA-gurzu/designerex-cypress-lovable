# Designerex QA Automation — Global Memory

This file is the entry point for any AI agent (or human) picking up this framework. Read this file, then the relevant `docs/features/*.md` file, before touching code for a given feature. Do not re-analyze the whole repo from scratch each time — that's what these files are for.

## What this project is

Cypress E2E automation for the new Designerex Lovable platform, using JavaScript + Page Object Model. Independently runnable from `designerex-cypress-lovable-updated/`. Built to be extended feature-by-feature, tracing every automated test back to a row in `Designerex_Test_Cases_By_Feature.xlsx`.

Reference material lives alongside this project but is **not** part of the framework itself:
- `Designerex_Test_Cases_By_Feature.xlsx` — source-of-truth test case tracker (multiple sheets, one per feature). Automation reads/writes this directly.
- `designerex-consumer-main/` — the actual app source (TanStack Router + React/Vite + Supabase, built via Lovable). Read this before writing selectors — never guess.
- The older `designerex-cypress` project (sibling directory, not inside this one) was reviewed for conventions but not copied wholesale — it targets a different, older app (XPath-heavy selectors, basic-auth wall, SMS-pin login) that doesn't apply here. What *was* reused: the JSONL-append-per-result pattern for crash-safe result tracking, and the general "feature-folder POM, function/class exports" organization.

## Architecture

```
cypress/
  e2e/<feature>/*.cy.js   — specs, one folder per feature (stripe/, credit/ so far; auth/renter/lender/admin scaffolded for future work)
  pages/*.js              — Page Objects (ES6 class, one default-exported instance per page)
  fixtures/*.json         — test data + the Excel traceability manifest (<feature>-test-cases.json)
  support/commands.js     — custom commands: navigation, auth, Supabase REST helpers
  support/e2e.js          — global afterEach that auto-records TC-xxx-### results
  utils/testCaseMapper.js — accessor for a feature's traceability manifest
  utils/testResultWriter.js — JSONL result sink (cy.task) + reader
  utils/excelUpdater.js   — Node script: writes results back into the .xlsx (Actual Result/Status/Comments/Date Tested only)
scripts/run-and-update.js — `npm run test:<suite>` = run Cypress, then ALWAYS run excelUpdater, then exit with Cypress's code
docs/
  QA-AUTOMATION-MEMORY.md — this file
  features/<feature>.md   — per-feature memory (routes, selectors, business rules, known issues)
```

## Environments (centralize, never hardcode in a Page Object)

All in `cypress.config.js`'s `env` block, overridable via `CYPRESS_<name>` env vars or a local (gitignored) `cypress.env.json`:

| Env | Purpose |
|---|---|
| `baseUrl` | Currently defaults to DEV (`https://designerex.gurzu.net`) — the environment the Lovable build is deployed to for dev/QA testing. |
| `authName` / `authPass` | Basic-auth wall in front of DEV. `cy.visitApp()` adds these automatically when both are set; leave unset for an environment with no basic auth (e.g. staging later). |
| `supabaseUrl` / `supabaseAnonKey` / `supabaseProjectId` | Same Supabase project the **DEV deployment** actually uses (anon/publishable key only — safe client-side value). Used for REST-based test data setup and real-state assertions, not just UI scraping. **Verified by extracting the real value from DEV's deployed JS bundle** — the local `designerex-consumer-main/.env` checked into this repo references a *different* project (`lgyecdudufnmrkzikvwd`) than what's actually deployed to `designerex.gurzu.net` (`owmmdxudhcjgsqniyoxw`). Don't trust the local `.env` for this — re-verify against whatever `baseUrl` you're pointed at (`curl <baseUrl>/assets/index-*.js \| grep -oE '"https://[a-z0-9]+\.supabase\.co"'`). |
| `renterEmail`/`renterPassword`, `lenderEmail`/`lenderPassword`, `adminEmail`/`adminPassword` | Test accounts. |

Other known environments (not yet wired as the default): consumer app `https://designerex-unlocked.lovable.app/`, admin app `https://dxdashboardtest.lovable.app/`. Migrating to Staging later should only require changing `baseUrl` (and probably clearing `authName`/`authPass`) — Page Objects and specs must never embed a domain.

## Authentication

- `cy.loginAsRenter()` / `cy.loginAsLender()` / `cy.loginAsAdmin()` — real UI login through `LoginPage`, wrapped in `cy.session()` keyed by role+email (fast repeat logins, but a genuine login still happens once per role per run).
- Session validity is checked against a **real signal**: the Supabase auth-token key in `localStorage` (`sb-<project-id>-auth-token`), not just a UI text change.
- `cy.getSupabaseAccessToken()` reads the current session's `access_token` for authenticated REST calls (e.g. verifying a booking row via `cy.getBookingById()`), so assertions check real backend state, not just what the UI displays.

## Selector strategy

The app has **no `data-testid` attributes anywhere** in `designerex-consumer-main/src`. Selectors fall back, in order of preference actually usable here: button/heading text → the shared `<Field label="...">` wrapper's label text → `autoComplete`/`placeholder`/`aria-label` attributes → semantically-named utility classes (e.g. `.text-destructive`) as a last resort. Never target hashed/generated CSS classes or deep DOM nesting. Where a feature's automation repeatedly fights a missing selector, document the recommended `data-testid` in that feature's memory file instead of guessing harder.

## Result tracking & Excel status updates

1. Every automated `it()` title includes its Test Case ID, e.g. `"TC-STR-001 - completes checkout..."` or `"CR-TC-030 - ..."`.
2. A global `afterEach` in `cypress/support/e2e.js` matches that ID against `TEST_CASE_PATTERNS` (an explicit `{regex, suite}` list — a near-miss here silently drops results with no error, as happened once with `CR-TC-*` before it was added), reads Mocha's real `test.state` (`passed`/`failed`), and appends one JSON line to `cypress/results/<suite>-results.jsonl` via a `cy.task`. Nothing here is inferred from page text — it's the actual test outcome. **After adding a new feature with a new ID shape, add its pattern here FIRST, then verify a line actually lands in the right `.jsonl` file after the very first real run** — don't assume it worked just because Cypress reported the test passed on screen.
3. `npm run test:<suite>` (e.g. `test:stripe`) runs Cypress, then **unconditionally** runs `cypress/utils/excelUpdater.js`, which reads the JSONL log + that suite's `cypress/fixtures/<suite>-test-cases.json` manifest and writes `Actual Result` / `Status` / `Comments` / `Date Tested` into the matching row of `Designerex_Test_Cases_By_Feature.xlsx` by `Test Case ID` — never touching Test Scenario/Case ID, Description, Precondition, Test data, or Expected Result.
4. A test case not yet implemented is written as `Not Run` (with a note), never as a fake `Pass`. A case that can't be meaningfully automated (missing integration/backend) is written as `Blocked` with the reason in `Comments`.
5. `npm run test:status` re-runs just the Excel update from the last JSONL log, without re-running Cypress.

## Adding a new feature (e.g. "Automate the Promo Code feature")

1. Read this file, then `docs/features/promo-code.md` if it exists.
2. Open `Designerex_Test_Cases_By_Feature.xlsx`, find the relevant sheet/rows, note the exact `Test Case ID`s.
3. Grep `designerex-consumer-main/src` only for what's relevant (routes, the specific component(s), any RPC/edge function calls) — don't re-read the whole app.
4. Build/extend a `cypress/fixtures/<feature>-test-cases.json` manifest the same shape as `stripe-test-cases.json`, classifying each case `automated`/`planned`/`blocked` with a reason — do this classification honestly against what the app actually does, not what the Excel assumes.
5. Add/extend Page Object(s) under `cypress/pages/`, reusing existing ones (`LoginPage`, etc.) where possible.
6. Write the spec under `cypress/e2e/<feature>/`, one `it()` per automated Test Case ID, title format `"TC-XXX-### - <what it verifies>"`.
7. Add an `npm run test:<feature>` script (mirroring `test:stripe`) if the feature warrants its own suite; extend `scripts/run-and-update.js`'s `SPEC_GLOBS` map and `cypress/utils/excelUpdater.js`'s `SUITES` map (sheet name + docs path).
8. Run it: `npm run test:<feature>`. Confirm results land in `cypress/results/<feature>-results.jsonl` (don't just trust the on-screen Cypress summary — see the result-tracking section above) and the Excel updates.
9. Write/update `docs/features/<feature>.md` (routes, Page Objects, business rules learned, known issues/limitations) — keep it a memory aid, not a copy of the source.
10. Only update this file if something about the *architecture* (not a single feature) changed.
11. **Before touching any suite with fixed/non-replenished test data, check for an already-open `cypress open` GUI session against this project** (`ps aux | grep cypress`). Its interactive runner watches spec files and auto-re-executes the currently-selected one on every save — a real incident during the Credit at Checkout suite's development saw an unrelated open session silently re-spend a test account's balance twice, purely from routine file edits, invisible to the deliberate `cypress run` commands actually being tracked. See `docs/features/credit-checkout.md` → "Critical incident" for the full story.
12. **If the feature's test accounts hold fixed, non-replenished data** (a credit balance, a limited quota, single-use tokens — anything that doesn't reset itself), treat it like `docs/features/credit-checkout.md` does: check the real current state via a read-only API call *before* writing a single test, run each scenario only once and verify carefully rather than iterating live, and add the same `NOT_FREELY_RERUNNABLE` guard to `scripts/run-and-update.js`. Do not casually re-run a suite like this to "make sure it's stable" — that's exactly what burns the resource.

## Known application quirks (apply across features)

- Zero `data-testid` anywhere in `designerex-consumer-main` — see Selector strategy above.
- The app is Supabase-backed with direct client-side table inserts/updates for a lot of flows (not exclusively through a backend API) — RLS is the real authorization boundary in several places, which makes direct `cy.request` calls to the Supabase REST API (with a real user's access token) a legitimate and valuable way to verify authorization behavior, not just a shortcut.
- **The local `designerex-consumer-main` source checked into this repo does not necessarily match what's deployed to DEV.** Confirmed for checkout/Stripe (stale local source has no Stripe wiring at all; DEV has a full Stripe test-mode integration — see `docs/features/stripe.md`) and for the Supabase project itself (local `.env` references a different project than DEV's deployed bundle actually uses). **Before trusting the local source for a new feature, verify selectors/behavior against the live DEV app** (e.g. `curl <baseUrl>/assets/index-*.js` and grep, or a quick diagnostic Cypress spec) rather than assuming the checked-out source is current.
- Stripe IS integrated on DEV (real Payment Element + a Supabase edge function `authorise-booking` computing amounts server-side) — see `docs/features/stripe.md` for the full mechanism before automating any payment-adjacent feature.
- The shared renter test account accumulates account credit over a long testing session (100+ bookings created during this framework's own development), which can zero out a booking's total. This turned out to be the SAME underlying mechanism the Credit at Checkout feature deliberately tests (see next bullet and `docs/features/credit-checkout.md`) — a $0.00 total switches `authorise-booking` to `kind:"setup"` (a Stripe SetupIntent, not a PaymentIntent).
- **Starting a checkout supersedes that same account's other in-flight checkout hold.** Paying on the stale one returns `409 "Your saved selection expired. Please pick your dates again."` — this is intentional, documented product behavior (see `docs/features/credit-checkout.md`'s K8), not a DEV bug. Any suite that runs multiple checkouts back-to-back on ONE shared account (as both the Stripe and Credit suites currently do — only one `renterEmail` was provided) will occasionally collide with itself this way. Mitigate with a retry, exactly as `CheckoutPage.submitAndCaptureAuthorisation()` already does; don't chase it as a product defect.
- The full-address (non-pickup) delivery form's phone field is labelled **"Phone number"**, not "Contact phone" (pickup/two-hour-Uber only) — `CheckoutPage.fillDeliveryDetails()` checks for both.

## Reference: task credentials / environments (from project brief)

- DEV: `https://designerex.gurzu.net/` — basic auth `designerex_dev` / (see `cypress.config.js`).
- Consumer app: `https://designerex-unlocked.lovable.app/`.
- Admin app: `https://dxdashboardtest.lovable.app/`.
- Test accounts: `admin@designerex.com.au`, `lender@designerex.com.au`, `renter@designerex.com.au` (passwords centralized in `cypress.config.js`).
