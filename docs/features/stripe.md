# Stripe Integration — QA Automation Memory

## Critical finding: the local source doesn't match DEV (read this first)

The local `designerex-consumer-main` checkout source in this repo has NO Stripe wiring (plain HTML form, mock `pi_mock_...` id inserted directly into Supabase). **That does not reflect what's actually deployed to DEV.** Empirical testing against `https://designerex.gurzu.net/checkout` (real Cypress runs, network capture, DOM inspection — not guessed) found a genuine Stripe **test-mode** integration:

- Real Stripe Elements **Payment Element** (`js.stripe.com`), publishable key `pk_test_51Sff6E...`.
- A Supabase edge function **`authorise-booking`** (`POST {SUPABASE_URL}/functions/v1/authorise-booking`) that the client calls with `{ reservation_id, hire_option, shipping_type, two_hour, discount_code, delivery_buffer }` — **no amount is ever sent by the client**. It returns `{ client_secret, kind: "authorise", amount_cents, currency: "AUD", payment_record_id, reused }`, i.e. the amount is computed entirely server-side and a real manual-capture PaymentIntent is created (`kind: "authorise"` — funds are authorized/held, matching the UI copy "No acceptance = no charge"; actual capture presumably happens later when the lender accepts).
- The client then calls `stripe.confirmPayment({ elements, clientSecret, confirmParams: { return_url: ".../checkout/confirmed" }, redirect: "if_required" })`.
- On success, navigates to `/checkout/confirmed?booking_id=...`. The created `bookings` row has a **real** `stripe_payment_intent_id` (`pi_...`, matches the PaymentIntent from `authorise-booking`'s `client_secret`), plus real columns for `stripe_status`, `payment_captured_at`, `stripe_refund_id`, `refund_type`, `refund_amount`, `bond_stripe_intent_id`/`bond_status` (a separate bond/deposit PaymentIntent mechanism), and server-computed fee fields (`rental_fee`, `cleaning_fee`, `shipping_fee`, `renter_service_fee`, `platform_fee`, `lender_payout_amount`, `discount_amount_applied`, `credit_applied`).
- `reused: true` on a repeat `authorise-booking` call for the same `reservation_id` returns the **same** `client_secret` — real idempotency, not just a UI-level double-click guard.

The Excel "Stripe Integration Test suite" (60 cases, 12 originally marked "Pass") is **much closer to accurate** than an earlier pass through this framework assumed — that earlier pass analyzed the stale local source and wrongly concluded Stripe wasn't integrated at all, then marked most of the suite "Blocked." That was corrected on 2026-09-17 after diagnostic Cypress runs revealed the real architecture above. See `cypress/fixtures/stripe-test-cases.json` for the corrected, evidence-based classification (23 automated / 10 planned / 27 blocked) — that file is the source of truth for what's covered and why.

## A real, observed DEV quirk: watch for $0.00 totals

The renter test account (`renter@designerex.com.au`) accumulates **account credit** (`credit_applied` on the booking row, via a `dx_calculate_credit` RPC) as more test bookings pile up against it over a long session — by the end of building this suite it had **102 bookings** and enough credit to fully zero out a $224 dress's total. `authorise-booking` doesn't handle a $0.00 total cleanly: it was observed returning a misleading `409 "Your saved selection expired. Please pick your dates again."` instead of a clear error. `goToCheckout()` in the spec now checks the rendered order-summary total and picks a different (the query is ordered by `hire_price_a.desc`) dress if it reads `$0.00`, retrying up to 3 times. If this test account's credit ever grows enough to exceed even the priciest active dress, this guard will need a real fix (e.g. a dedicated low-credit test account, or a way to reset credit) rather than just picking a pricier dress.

## Application routes

- Checkout wizard: `/checkout` (3 steps: hire/dates/delivery → delivery address → payment). Search params: `dress_id, from, to, hire_option (a|b|tryon), shipping_option, size_id?`. `startDate` seeds straight from `from`, so step 1 is valid on load with no calendar interaction needed.
- Confirmation: `/checkout/confirmed?booking_id=<uuid>` — heading text **"Booking Request Confirmed"**.
- Login: `/login` renders `<LoginForm/>` directly.

## How tests reach checkout

`cy.findBookableDress()` queries the public `dresses` REST endpoint (anon key), ordered by `hire_price_a.desc`, preferring one with an enabled "pickup" shipping option (so `CheckoutPage.fillDeliveryDetails()` only needs a phone number, not a full street address). `cy.buildCheckoutUrl(dress)` builds the exact same `/checkout?...` URL the app's own `handleBook()` constructs (read from source) — not a guess, the app's documented navigation contract.

## Page Objects

- `cypress/pages/LoginPage.js`
- `cypress/pages/CheckoutPage.js` — see `submitAndCaptureAuthorisation()` for the 409-retry logic and `paymentFrameBody()`/`fillStripeField()` for real Stripe Elements iframe interaction.
- `cypress/pages/ConfirmationPage.js`

## The Stripe Elements iframe (how to interact with it)

The payment step renders inside `iframe[title="Secure payment input frame"]`. With `chromeWebSecurity: false` (set in `cypress.config.js`), Cypress can read `iframe.contentDocument.body` directly. Real, verified field selectors inside that body:

```text
input[name="number"]   — card number
input[name="expiry"]   — MM / YY
input[name="cvc"]      — security code
```

There is **no "Cardholder name" field** in this Payment Element configuration (unlike the plain-HTML-form design in the stale local source) — don't look for one. Inline validation errors render inside the same iframe as `[id^="Field-"][id$="Error"]` elements (`CheckoutPage.stripeFieldError()`).

## Test data / accounts

- Renter: `Cypress.env('renterEmail')` / `Cypress.env('renterPassword')`.
- Real Stripe test cards (test mode, safe): `4242 4242 4242 4242` (succeeds), `4000 0000 0000 0002` (generic decline), `4000 0000 0000 9995` (insufficient funds). Any future 3DS work should use `4000 0025 0000 3155`.
- Supabase project actually used by DEV (verified from DEV's own deployed JS bundle — **do not trust the local `designerex-consumer-main/.env`, which points at a different project**): `https://owmmdxudhcjgsqniyoxw.supabase.co`.

## Automated Test Cases (v1, revised)

See `cypress/e2e/stripe/stripe-payment.cy.js` and `cypress/fixtures/stripe-test-cases.json` for the authoritative list.

| Automation status | Count | Meaning |
|---|---|---|
| `automated` | 23 | Real `it()` block, executed every run, result auto-recorded |
| `planned` | 10 | Genuinely automatable (real Stripe test-mode data confirmed this), not yet implemented — mostly 3DS (nested-iframe complexity), timing races, and fee-breakdown drill-downs |
| `blocked` | 27 | No webhook injection access, no client-reachable refund flow found in the consumer app (refunds/Klarna/currency/min-amount all fall here) |

Automated: TC-STR-001, 002, 003, 004, 005, 006, 007, 008, 011, 014, 015, 017, 018, 019, 021, 022, 038, 039, 040, 045, 048, 049, 056.

**Actual result of a clean full run (2026-09-17, `npm run test:stripe`): 20/23 passing.** Three (TC-STR-011, TC-STR-019, TC-STR-039) failed intermittently across multiple clean runs with the same two symptoms: either the app never navigated to `/checkout/confirmed` within 15s after a real successful-looking submit, or `authorise-booking` returned `409 "Your saved selection expired"` even after the built-in retry. This reproduced across several independent full-suite runs (not a one-off), always on a *different* subset of the 23 tests each time. `retries.runMode: 1` (Cypress-level) plus `CheckoutPage.submitAndCaptureAuthorisation()`'s own 409-retry already absorb most instances of this; a persistent case after both layers of retry is left as a real, honest failure rather than retried indefinitely.

**Root cause now understood (see the Credit at Checkout suite's K8/CR-TC-024/025):** the 409 is *intentional, documented* behavior — starting a checkout supersedes that same renter's other in-flight checkout hold (`dx_hold_dates` returns a `reservation_id` that goes stale the moment a second hold is created for the same account). This suite's own tests, run back-to-back on the *same* `renterEmail` account (via `cy.session`), were themselves the second-tab collision. It is not a DEV bug; it's the same product behavior the Credit suite tests on purpose. A genuinely more resilient fix would give each test its own renter account (out of scope here — only one shared renter account was provided), so the current retry-based mitigation stays appropriate.

## Known Issues / findings (discovered by automation)

1. **Account credit can zero out a booking total**, and `authorise-booking` surfaces that as a misleading 409 "expired selection" error rather than a clear message — see the DEV quirk section above. Worth a real bug report to the app team.
2. Refund/cancellation columns exist on `bookings` (`stripe_refund_id`, `refund_type`, `refund_amount`) but no client-triggerable refund action was found anywhere in the renter-facing app — likely admin- or lender-decision-triggered via the separate admin app, not explored in this pass.
3. `stripe_status` and `payment_captured_at` stayed `null` for at least 20 seconds after a successful authorization in manual testing — the webhook that presumably updates them wasn't observed firing quickly; eventual-consistency polling is a promising follow-up but untested here.

## Known Limitations

- 3D Secure (TC-STR-009/010) needs interacting with a further nested iframe (Stripe's test-mode challenge modal) — real engineering effort beyond this pass, marked `planned`.
- `CheckoutPage.fillDeliveryDetails()`'s full-address/state-dropdown path is a best-effort pattern, not verified against the real `SimpleSelect` DOM (dress selection is biased toward "pickup" dresses specifically to avoid needing it). **Update:** the phone field label bug (it only checked for "Contact phone", but the full-address/standard-delivery form actually labels it "Phone number") was found and fixed while building the Credit at Checkout suite, which requires standard delivery. The state-dropdown click path itself is still unverified.
- TC-STR-018/019 call the `authorise-booking` edge function directly via `cy.request` (bypassing the UI) for deterministic, fast checks — this is standard "use API where it improves reliability" practice per the framework's own conventions, not a shortcut around real coverage.

## Automation Notes

- Result tracking: `cypress/support/e2e.js`'s global `afterEach` auto-records Pass/Fail from real Mocha test state for every `it()` title containing a `TC-XXX-###` id.
- `npm run test:stripe` always updates the Excel file afterward (`cypress/utils/excelUpdater.js`), even on failure.
- Cypress's own `retries.runMode: 1` (in `cypress.config.js`) plus `CheckoutPage.submitAndCaptureAuthorisation()`'s internal 409-retry both exist because of the real DEV quirks described above — this is deliberate resilience against a live, occasionally-flaky external environment, not a way of hiding genuine failures (a persistent failure after all retries still fails the test for real).
