# QA test pack 3: competing booking requests

**Covers:** what happens when two renters want the same dress on the same dates.
**Written:** 17 September 2026. Every figure measured the same day on Designerex Dev.

Read pack 1 first, `2026-09-16-card-payments-test-pack.md`, for the site login and the test
cards. This pack does not repeat them.

---

## 1. Read this before anything else

**Use only the nine listings in pack 1, section 1.** Those are the only ones whose lender you
can sign in as. A request on any other listing can never be accepted or declined by anybody,
so any test that needs the lender to act will fail for a reason that is not a bug.

**Pick dates far in the future**, 2027 or later, so you do not collide with other testing.

---

## 2. What changed

Until today, accepting one request made the platform decline every other request for the same
dress on overlapping dates, in the lender's name.

**That no longer happens.** Competing requests now wait for the lender to decide. Designerex
asked for this: the lender declines, not the platform.

---

## 3. Accounts

Two renters, so you can create a genuine conflict. **Password for both: `QaCredit123!`**

```
walk-renter-a@designerex.com.au
walk-renter-b@designerex.com.au
```

Neither holds credit, so nothing here overlaps pack 2.

The lender is the usual one from pack 1, `lender@designerex.com.au`.

---

## 4. Tests

### L1. The competing request survives

As **renter A**, book one of the nine listings, for example 8 to 12 May 2027. Pay with
`4242 4242 4242 4242`.

Sign out. As **renter B**, book the **same dress** on **overlapping** dates, 10 to 14 May 2027.
Pay with the same card.

Sign in as the **lender**, go to **Booking Requests**, and accept renter A's.

**Expect:** renter B's request is **still there**, in Pending. Untouched, no reason, no
notification to her.

**If it disappears, that is the bug this pack exists to catch.** Raise it immediately.

---

### L2. You cannot accept both

Still on **Booking Requests**, look at renter B's request.

**Expect:** where Accept used to be there is a greyed **Already booked for these dates**. You
cannot press it.

**Known and already reported, do not log it:** the **Overview** dashboard card still shows a
live Accept button for the same request. If you press it there you get "This dress is already
booked in that size for the selected dates". The platform refuses correctly either way.

---

### L3. Decline renter B by hand

On **Booking Requests**, press **Decline** on renter B's request.

**Expect:**
- You must choose a reason. There is a dropdown. Choose **Booked out already**.
- Leave **"Also block these dates so nobody else asks"** unticked.
- The request moves out of Pending.

**Known and already reported, do not log it:** the Decline on the **Overview** card has no
reason picker, so it fails with "Please choose a reason before declining this booking" and
nowhere to choose one. Use the Booking Requests page.

**Then check Stripe.** Renter B's hold should be `canceled`, with nothing received, within
about a minute.

---

### L4. Renter B is told the truth

Sign in as **renter B** and open her past rentals.

**Expect, on the booking:**

```
These dates are already booked
You have not been charged.
```

The second line must be there and must be green. She was never charged, and the platform
should say so without her having to ask.

**Her notification says only "was declined", with no reason.** Known, already reported, do not
log it.

---

### L5. Nothing else changed

Book one of the nine listings as renter A, on dates nobody else wants. Accept it as the lender.

**Expect:** exactly what pack 1 describes. The hold is taken on accept, the renter is notified,
and the booking appears in Accepted. This test is dull and it is the important one: the change
touched the accept path that every booking uses.

---

## 5. Two cases you cannot test, and why

**A request the lender could not have accepted must not count against them.** A competing
request now waits until the lender declines it or it expires after 24 hours. Three expiries in
a row normally pause a lender's listings. An expiry whose dates were already taken is excluded
from that count.

**A request the lender simply ignored must still count.** Three of those still pause them.

Both need a 24 hour wait, so they are covered by an automated test instead:
`scripts/test-the-lender-declines-rather-than-the-platform.sql`, sections 6 and 7. Both proved
on Dev on 17 September, in both directions.

---

## 6. Not ready, do not test

**Vacation Mode**, both halves. Scheduling a vacation does not end waiting requests, and the
Indefinite pause ends all of them while telling you it will not. Both are reported and neither
is fixed. The Indefinite pause also blocks every one of the nine listings while it is on, so
**if you turn it on, turn it off again** or nobody can book anything.

**Everything listed in pack 1 section 5 and pack 2 section 4.** Unchanged.

**Production.** None of this is on Production.

---

## 7. Reporting

Say which of L1 to L5 passed. For a failure give the Stripe payment reference, which looks like
`pi_3UGbIMCuJZ0wdBe41q4H9tNt`, and the booking id from the request card, which looks like
`#C3DC6603`.
