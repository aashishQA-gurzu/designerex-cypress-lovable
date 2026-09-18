# QA test pack: card payments

**For:** the QA engineer testing the Designerex rebuild.
**Covers:** the card payment lifecycle and the new checkout order, both finished and deployed
to Designerex Dev.
**Written:** 16 September 2026. Every figure in it was measured the same day.

Read section 1 first.

---

## 1. Read this before you book anything

### Use one of these nine listings

Dev carries 79 active listings. Only these nine belong to the lender account you can sign
in as, so only these nine can be accepted or declined. Re-checked 16 September 2026.

```
Diamond Days Maxi                 https://designerex.gurzu.net/dresses/f1968cf1-0dd3-4f26-b7c8-5f3439ee3dbd
Dusty Rose Midi #52               https://designerex.gurzu.net/dresses/a958a51d-68bf-4812-99f6-948410276fec
Fuchsia Feather Trim #78          https://designerex.gurzu.net/dresses/036f630b-b387-432d-ad98-73131cc695d3
Juniper Gown                      https://designerex.gurzu.net/dresses/446e2696-3d56-40f6-8666-2372c7c8e198
Margot Maxi                       https://designerex.gurzu.net/dresses/604ca777-9787-44de-9976-b8156a21c136
Maya Sangria Glitter Gown         https://designerex.gurzu.net/dresses/322b120c-3f0d-4827-a157-b5396451d0a8
Mila Maxi Dress in Ivory Polka    https://designerex.gurzu.net/dresses/5f7dfe40-4e1e-4993-bf37-d8a08a379367
SELF-PORTRAIT                     https://designerex.gurzu.net/dresses/5083a606-3f0f-41bd-9e7e-74ec268282e4
Test Zimmermann Dress             https://designerex.gurzu.net/dresses/6fc360a4-c8c1-4d1a-be6f-e5ccda01af45
```

**You can also create your own.** Sign in as the lender account and add a listing.

The other 70 belong to seeded accounts nobody has passwords for. Do not raise that as a bug.

### Dev and Production carry different things

Measured 16 September 2026:

| | Designerex Dev | Designerex Production |
|---|---|---|
| The card payment work in this pack | **yes** | not yet |
| Designerex's customer credit system | not yet | **yes** |
| Designerex's Holiday Mode | not yet | **yes** |
| One discount redemption per person | not yet | **yes** |

Everything here tests the payment work on its own. Re-run the discount and credit tests once
both halves are on the same database. Note that on anything you sign off.

---

## 2. Getting in

```
URL       https://designerex.gurzu.net/
username  designerex_dev
password  Hlp2P4Rt13Iz
```

That is HTTP basic auth on the site, so the browser asks before the page loads. Then sign in
to the platform itself with one of:

```
renter@designerex.com.au   TestRenter123!     books things
lender@designerex.com.au   TestLender123!     owns the nine dresses above, accepts and declines
admin@designerex.com.au    TestAdmin123!      refunds
```

**Stripe is in test mode.** No real money moves, ever. Use these cards with any future expiry
and any three digit code:

```
4242 4242 4242 4242    succeeds
4000 0000 0000 0002    declined by the bank
4000 0000 0000 9995    declined, insufficient funds
4000 0025 0000 3155    asks for bank confirmation, the 3D Secure step
4000 0000 0000 0341    attaches fine, then fails when the money is taken
```

**Stripe dashboard.** You have access to the Designerex test account. Watch the intent
appear, the hold sit at `requires_capture`, and the capture land. It is the fastest way to
tell a hold from a charge.

**Discount codes on Dev**, both personal to the renter account above:

```
RENTERTEST20    20 percent off, used 1 of 25
VIP25           25 percent off, used 0 of 1
```

---

## 3. What to test

Twelve tests in all. Nine on the payment lifecycle below, then three on the new checkout
order in section 4. Each says what to do, what should happen, and how to tell.

### T1. A booking request puts a hold on the card

**As** renter. Book one of the nine dresses, pay with `4242 4242 4242 4242`.

**Expect:** the booking is confirmed on screen. The amount shown is the amount you agreed.

**Check:** the money is **held, not taken**. The renter's card shows a pending authorisation
and no charge. The lender has a new request in their dashboard.

### T2. The lender accepts, and the money is taken

**As** lender, on the request from T1, press accept.

**Expect:** the booking becomes accepted.

**Check:** the held money is now captured. The amount captured equals the amount held to the
cent, not a recalculated figure.

### T3. The lender declines, and the money goes back

**As** renter, make a second booking. **As** lender, decline it.

**Expect:** the renter is told it was declined.

**Check:** the hold is released straight away rather than sitting on the card for a week. The
renter is never charged.

### T4. Nobody answers, and the money still goes back

**As** renter, make a booking and leave it. The request expires after 24 hours on the hour.

**Expect:** the request expires by itself with nobody pressing anything.

**Check:** the hold is released. **This one needs a day**, so start it early and come back.

### T5. A full refund

**As** admin, on the accepted booking from T2, record a full refund.

**Expect:** the refund goes to Stripe from the admin screen you already use. There is no new
screen for this.

**Check:** Stripe shows the full amount refunded.

### T6. A partial refund, then another, then one too many

**As** admin, on a fresh captured booking, refund part of it. Then refund more. Then try to
refund more than is left.

**Expect:** the first two go through. **The third is refused**, and the booking does not save
either, so a wrong number never sticks.

**Check:** Stripe's total refunded equals the two you made, and nothing else moved.

### T7. Cards that fail

**As** renter, try each failing card in section 2.

**Expect:** each one tells the renter what happened in a sentence they can act on. **No raw
error codes, no provider jargon, no blank screens.**

**Check:** no booking is left half made, and the renter can try again.

**This is the test most likely to find something.** Report the exact wording of anything that
reads like it was written for a developer.

### T8. The bank asks a question

**As** renter, pay with `4000 0025 0000 3155`.

**Expect:** the extra confirmation step appears **while the renter is still on the page**, not
afterwards by email. Completing it completes the booking.

**Check:** cancelling the step leaves no half made booking.

### T9. A discount code

**As** renter, book with `VIP25` applied.

**Expect:** the screen shows the discounted total.

**Check, and this is the point of the test:** **the amount held on the card equals the
discounted total, to the cent.** Not the full price. If the screen says one number and the
bank holds another, that is the most serious thing in this pack.

---

## 4. The new checkout order

The booking is created after the card succeeds, not before. A renter whose card fails leaves
no request, no conversation and nothing for the lender to see. Live on Dev since 16 September
2026.

### T10. A declined card leaves nothing behind

**As** renter, book one of the nine dresses with `4000 0000 0000 0002`.

**Expect:** a message saying the card was declined, in plain words, on the page.

**Then, before touching anything, sign in as the lender and check three things:**

- **No new booking request** in the dashboard
- **No new conversation**
- **No new notification**

**If any of the three appear, stop and report it.**

The lender's dashboard carries requests from earlier testing. Check the date before assuming
one is yours.

### T11. Retry in place after a decline

**As** renter, from the declined state in T10, correct the card to `4242 4242 4242 4242` and
press again.

**Expect:** it works, and does **not** send you back to the dates page.

**Check in Stripe:** one intent holding money, one holding nothing. Two holds on one card for
one booking is a defect.

### T12. A card that fails after it is accepted

**As** renter, pay with `4000 0000 0000 0341`. This card attaches correctly and then fails
when the money is reserved.

**Expect:** the renter is told plainly, and no booking is created.

### Watch for

**"Your saved selection expired"** when you have not been waiting thirty minutes.

**A pause after the card is confirmed.** One or two seconds is expected. Several is worth
reporting.

**A booking whose price differs from what the screen said.** Stop and report it immediately.

---

## 5. What is not ready, so do not test it

**Apple Pay, Afterpay and Klarna.** Not built.

**Bonds and deposits.** Not built.

**Customer credit.** Designerex built it on Production. It is not on Dev, and our card hold
does not subtract it yet. Not testable here, and it is on the list.

---

## 6. What the automated tests already cover, so you do not repeat it

These run against a rebuilt database and against real Stripe in test mode. They are in
`scripts/` in the Designerex-Supabase repository.

| Script | Sections | What it proves |
|---|---|---|
| `test-authorise-on-request.sql` | 16 | The hold, its amount, who may ask for one, and the edge cases |
| `test-capture-and-void.sql` | 14 | Capture on accept, release on decline, expiry and cancellation |
| `test-refunds.sql` | 12 | Full, partial, and refusing more than remains |
| `test-authorise-edge-cases.sql` | 7 | Unknown outcomes, duplicate requests, missing holds |
| `test-payment-adapters-against-stripe.sh` | 9 probes | All three operations against the real Stripe API, including refusals |
| `test-stripe-webhook.py` | | Signature checking, replay, and applying an event exactly once |

None of them covers a person using the site. The failing card wording in T7 and the whole of
T10 to T12 can only be checked by clicking. Two defects turned up that way on 16 September,
after every script had passed.

---
