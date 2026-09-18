# Credit at Checkout — QA Automation Memory

## Read this before touching this suite

Unlike Stripe suite, this feature's test accounts hold **fixed, non-replenished balances**. There is no self-service top-up ("A renter cannot see their balance and nobody can grant it, in either app... a balance is set from the database" — `Chabbi/2026-09-17-credit-test-pack.md`). **Running `npm run test:credit` a second time will spend an already-spent balance again and fail for a reason that has nothing to do with the app.** `scripts/run-and-update.js` refuses to run this suite without an explicit `--i-know-this-spends-real-credit` flag — that's deliberate, not a bug to work around.

Before adding or re-running anything, check the account's real current balance first:

```js
// via cy.request, or curl directly:
POST {supabaseUrl}/rest/v1/rpc/dx_calculate_credit
{ "p_renter_id": "<uuid>", "p_rental_fee": 999999, "p_cleaning_fee": 0, "p_shipping_fee": 0,
  "p_two_hour_fee": 0, "p_service_fee": 0, "p_discount_applied": 0, "p_has_discount_code": false, "p_is_try_on": false }
```

A deliberately huge `p_rental_fee` means the returned number is never capped by a booking amount — it's the account's true raw balance.

## Test accounts (source: `Chabbi/2026-09-17-credit-test-pack.md`)

Shared password for all five: `Cypress.env('qaCreditPassword')` (`QaCredit123!`).

| Account | Starting balance | Used by |
|---|---|---|
| `qa-credit-none@designerex.com.au` | $0.00 | K7 (no-credit baseline) — safely repeatable, nothing to spend |
| `qa-credit-50@designerex.com.au` | ~~$50.00~~ **$0.00 as of 2026-09-17** | K1, K5, K6 — **blocked, needs a top-up** |
| `qa-credit-150@designerex.com.au` | $150.00 → **$52.50** (spent) | K2 — credit fully covers total |
| `qa-credit-edge@designerex.com.au` | $212.70 → **$0.70** (spent) | K3 — the $1.00 floor rule |
| `qa-credit-exact@designerex.com.au` | $152.50 → **$0.00** (spent) | K4 — exact credit-to-price match |

**qa-credit-50 was already at $0.00 before this suite ever ran** (verified live via the RPC before writing a single test) — almost certainly spent by the pack's own author measuring the K1 figures earlier the same day. Per the pack's own instruction, this was reported as needing a top-up, not raised as a bug. K1/K5/K6 (9 Excel rows: CR-TC-001-003, 016-021) are `blocked` pending that.

## Business rules (verified live, not assumed)

- Credit reduces the checkout total dollar-for-dollar, up to the full booking price — never more (`CR-TC-038`, `CR-TC-033`).
- **The $1.00 floor**: if credit would leave a payable amount below $1.00 (but the booking isn't an *exact* credit match), only enough credit is applied to bring the total to exactly $1.00 — the rest stays as credit (`CR-TC-009`/`K3`, edge account: $212.70 credit → only $212.00 applied, $0.70 remains, total $1.00). This is described in the pack as "the case that was broken until today" — i.e. fixed same-day; re-verify if this feature is touched again.
- **Exact match is NOT floored to $1.00** — if credit exactly equals the price, the total is genuinely $0.00, not $1.00 (`CR-TC-013`, exact account).
- **A $0.00 total still shows and collects card details** — the Stripe Elements payment form remains visible and usable (`CR-TC-005`).
- A discount code and credit are mutually exclusive per booking — applying a code hides the credit line entirely; removing the code brings it back (`CR-TC-016`/`CR-TC-017`, K5 — currently blocked, needs qa-credit-50 topped up to verify live).
- Credit is only spent once a booking actually completes — merely opening/viewing a fully-credit-covered checkout does not touch the balance (`CR-TC-039`/`CR-TC-040`, verified via `dx_calculate_credit` before and after viewing, unchanged).
- Cancelling a booking *before the lender acts* restores the credit (`CR-TC-020`/`CR-TC-021`, K6 — blocked pending top-up; the cancel-flow mechanics themselves ARE verified, see below).

## The $0.00 mechanism: a Stripe SetupIntent, not a $0 PaymentIntent

This is the single most important technical finding. When credit brings the total to exactly $0.00, `authorise-booking`'s response shape changes:

```json
// Normal (non-zero) total:
{ "client_secret": "pi_..._secret_...", "kind": "authorise", "amount_cents": 100, "currency": "AUD", "payment_record_id": "...", "reused": false }

// $0.00 total (credit fully covers the price):
{ "client_secret": "seti_..._secret_...", "kind": "setup", "amount_cents": 0, "currency": "AUD", "payment_record_id": "...", "reused": false }
```

`kind` switches from `"authorise"` to `"setup"`, and the `client_secret` becomes a real Stripe **SetupIntent** (`seti_...`) instead of a PaymentIntent (`pi_...`) — collecting and storing the card (e.g. for a future bond/damage claim) without ever attempting a charge. The booking row's `stripe_payment_intent_id` column stores this `seti_...` id too (same column, different kind of Stripe object — a naming quirk worth knowing, not a bug).

## Application mechanics

- **Route/flow**: identical checkout wizard as the Stripe suite (`/checkout`, 3 steps). Business rule from the pack: **"book hire A with standard delivery — other options change the price."** `cy.buildCheckoutUrl(dress)` already defaults `shipping_option` to `"standard"` when the dress object doesn't set `shippingOption` — `cy.findDressByTitle()` doesn't set it, so this works automatically.
- **Named listings required** (prices measured 2026-09-17, may drift — re-verify before trusting exact figures in a new run): Margot Maxi $97.50, Diamond Days Maxi $152.50, SELF-PORTRAIT $163.50, Juniper Gown $213.00. `cy.findDressByTitle(title)` looks these up live via REST rather than hardcoding IDs.
- **Credit line selector**: `CheckoutPage.creditAmountText()` / `hasCreditLine()` — a `<dt>Credit applied</dt><dd>-$X.XX</dd>` pair in the same order-summary `<dl>` as Rental price/Shipping/Total.
- **Delivery/phone field bug found and fixed here**: for standard (non-pickup) delivery, the phone field is labelled **"Phone number"**, not "Contact phone" (which is pickup/two-hour-Uber only). `CheckoutPage.fillDeliveryDetails()` now detects which one is present. This bug existed in the Stripe suite's Page Object too (silently untested there, since that suite biases toward pickup dresses) — see `docs/features/stripe.md`.
- **`dx_hold_dates` RPC** returns `{ reservation_id, expires_at }` directly — the cleanest way to get a reservation_id for a direct API check without needing to submit a real payment (used by K8).

## Checkout/session-conflict mechanism (K8) — also explains earlier Stripe-suite flakiness

Starting a new checkout **supersedes** that same renter account's other in-flight checkout hold. Paying on the now-stale one returns:

```
HTTP 409
{ "error": "Your saved selection expired. Please pick your dates again." }
```

Verified via direct `authorise-booking` replay (start checkout A, capture its `reservation_id` from `dx_hold_dates`, start checkout B for a different dress with the same account, then POST checkout A's stale `reservation_id` directly) — no literal two-browser-tabs needed. This exact mechanism, encountered repeatedly and initially unexplained while building the Stripe suite, is now fully understood: that suite's tests, run back-to-back on one shared renter account, were colliding with each other exactly like this.

## Cancellation flow (`RentalsPage.js`) — verified live, ready for K6 once qa-credit-50 is topped up

`/dashboard/rentals` → a pending booking shows a **"Cancel request"** button (an accepted one shows **"Cancel booking"**) → opens a Radix dialog:

- Heading: "Cancel this booking?"
- A required **Reason** `<select>` (Radix combobox) — the confirm button starts `disabled` until a reason is chosen. Observed option: "Change of plans".
- Buttons: "Keep booking" (dismiss) / "Cancel booking" (destructive confirm, red).

`RentalsPage.cancelBookingFor(dressTitle)` → `.selectReason(text)` → `.confirmCancel()`. Verified end-to-end against a non-credit test booking; not yet run against a credit-spending booking (that's specifically what K6/CR-TC-020-021 needs, currently blocked).

## Automated Test Cases (v1)

See `cypress/e2e/credit/credit-checkout.cy.js` and `cypress/fixtures/credit-test-cases.json` for the authoritative list.

The sheet grew from 42 to 59 rows mid-pass (the user added CR-TC-043-059 after the initial extraction) — classified and partially automated in a second pass, reusing already-captured evidence where honestly possible rather than spending more balance.

| Automation status | Count | Meaning |
|---|---|---|
| `automated` | 33 | Real `it()` block; 23 run live on 2026-09-17, the other 10 reuse already-captured evidence from those same runs (no new spend) or a second careful live pass (CR-TC-043/044/052/059) |
| `blocked` | 13 | Depends on qa-credit-50, currently $0.00 — needs a top-up |
| `planned` | 13 | Genuinely automatable, deliberately not run this pass — see each entry's `reason` in the fixture |

**Final balances (2026-09-17, after both passes and the incident below):**

```
qa-credit-150:  $150.00 → $52.50   (net: one Margot Maxi booking kept, one spend-then-cancel cycle run twice, netting to zero extra cost)
qa-credit-edge: $212.70 → $0.70    ($1.00-floor booking, Juniper Gown)
qa-credit-exact:$152.50 → $0.00    (exact match, Diamond Days Maxi)
qa-credit-none: $0.00   → $0.00    (unchanged, no balance to spend)
qa-credit-50:   $0.00   → $0.00    (already spent before this suite ran; unchanged by it)
```

### A recording bug found and fixed during this run

`cypress/support/e2e.js`'s original ID-matching regex (`/TC-[A-Z]+-\d+/`) only matched IDs shaped like `TC-STR-001` — it silently failed to match `CR-TC-030`-shaped IDs, so **none of this suite's results were recorded** by `cy.task('recordTestResult', ...)` even though all 23 tests genuinely passed (confirmed in the live terminal output). Fixed by generalizing to an explicit `{regex, suite}` list (`TEST_CASE_PATTERNS`). The 23 real results were backfilled into `cypress/results/credit-results.jsonl` from the verified run output rather than re-executed — re-running would have spent the already-spent balances a second time. If you add a new feature whose ID format doesn't match an existing pattern, add a new entry to `TEST_CASE_PATTERNS` and **verify a JSONL line actually appears** after your first live run, before trusting the suite is "just working."

## Critical incident during this pass: an open `cypress open` session re-ran the spec unexpectedly

While iterating on `cypress/e2e/credit/credit-checkout.cy.js` (adding new `it()` blocks for CR-TC-043/044/046/047/049/053/055/056/057/059), a `cypress open` GUI process was found already running against this exact project (`ps aux` showed it started independently, not by this automation work). Cypress's interactive runner watches spec files and **automatically re-executes the currently-selected spec on save**. Every file edit during this session was a save — so each edit to `credit-checkout.cy.js` likely triggered an uncontrolled extra execution in that GUI session, **independent of and invisible to** the deliberate, controlled `cypress run` invocations used to build this suite.

This surfaced as two "phantom" bookings against `qa-credit-150` (both for "Lilac Tulle Dress #55", both spending its full $52.50 remaining balance) that didn't correspond to any headless run this session tracked, discovered only because the balance read $0.00 when $52.50 was expected. Both were found and cancelled (restoring the balance both times, real evidence for CR-TC-043/044 as a side effect — see that entry's note for both booking IDs). **The account is currently back at its expected $52.50** — verified after a 15s settle delay with no further drift.

**Lesson for future work on this suite (or any suite with non-renewable test data): before writing your first `it()`, check `ps aux | grep cypress` for an already-open interactive session against the same project.** If one exists, either ask it to be closed, or be aware every save while it has the target spec open is a live, uncontrolled execution — not just the `cypress run` commands you explicitly ran. This risk doesn't apply to freely-repeatable suites (Stripe, K7, K8, CR-TC-052) — only to ones spending a fixed resource.

## Known Limitations

- K1/K5/K6 (qa-credit-50) are blocked until topped up. RentalsPage's cancel flow is ready; once topped up, K1 → K6 should run in one careful sequence (spend $50, verify K1-K3-equivalent assertions, then immediately cancel via RentalsPage to restore the balance for K5/next time) so the account doesn't need a *second* top-up right away.
- CR-TC-026/027/028/031/035/036/037/041/042 (9 cases) are `planned`: several need a new test account with a very specific balance not among the five provided (e.g. exactly $0.01 or $1.00 below/above a price) — see each entry's `reason` in the fixture for specifics.
- The random-date collision seen occasionally in the Stripe suite (a randomly-picked date landing on an already-blocked range for a heavily-tested dress) also happened once here (K7, first attempt) — harmless and safe to retry for non-credit accounts; would need care if it ever happened mid-flow for a credit-spending account (it happens before any submission, so a retry from scratch is safe either way).
