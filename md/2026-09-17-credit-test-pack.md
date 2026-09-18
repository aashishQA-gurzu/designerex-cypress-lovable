# QA test pack 2: credit at checkout

**Covers:** what happens when a renter has credit. Designerex Dev only.
**Written:** 17 September 2026. Every figure measured the same day.

Read pack 1 first, `2026-09-16-card-payments-test-pack.md`. It has the site login, the test
cards and the nine bookable listings. This pack does not repeat them.

Pack 1 told you not to test credit. That is out of date. Credit is finished.

---

## 1. Accounts

Five renter accounts, one per case, each already holding the credit its test needs. **Password
for all five: `QaCredit123!`**
/



```
qa-credit-none@designerex.com.au        $0.00
qa-credit-50@designerex.com.au         $50.00
qa-credit-150@designerex.com.au       $150.00
qa-credit-edge@designerex.com.au      $212.70
qa-credit-exact@designerex.com.au     $152.50

```

Sign in as the one the test names. Nothing else to set up.

**There is no screen for credit.** A renter cannot see their balance and nobody can grant it,
in either app. The admin interface is coming. Until then a balance is set from the database, so
**tell Chhabi when an account needs topping up** rather than raising it as a bug. Each balance
is spent by the test that uses it.

**Use a different account from anyone else testing.** Starting a checkout releases that
account's other checkouts, so two people on one account cut each other off.

---

## 2. Rules for every test

Book **hire A with standard delivery**. Other options change the price and the figures below
will not match.

The summary shows a magenta **Credit applied** line, then **TOTAL**. **The screen and Stripe
must agree.** If they do not, that is the most important bug you can find.

Prices, measured today:

```
Margot Maxi         $97.50
Diamond Days Maxi  $152.50
SELF-PORTRAIT      $163.50
Juniper Gown       $213.00
```

---

## 3. Tests

### K1. Credit comes off the price

`qa-credit-50` books **SELF-PORTRAIT**.

```
Credit applied   -$50.00
TOTAL            $113.50
```

Pay with `4242 4242 4242 4242`. Stripe shows one uncaptured payment of **$113.50 AUD**.

Afterwards the balance is `$0.00`, so a new checkout shows no Credit applied line.

---

### K2. Credit pays for everything, and the card is still kept

`qa-credit-150` books **Margot Maxi**.

```
Credit applied   -$97.50
TOTAL              $0.00
```

The card fields still appear and you still enter a card. The booking is created.

**Stripe shows no payment at all.** Look under Customers instead: the account gains a saved
card. The card is collected because a bond or a damage claim may need it later.

Balance afterwards: `$52.50`.

---

### K3. Credit that would leave small change

**This is the new rule and the case that was broken until today.**

`qa-credit-edge` books **Juniper Gown**. The renter would owe 30 cents, which no card takes.

```
Credit applied  -$212.00      not $212.70
TOTAL              $1.00
```

Pay with `4242 4242 4242 4242`. Stripe shows **$1.00 AUD** uncaptured.

**Balance afterwards is `$0.70`.** The platform spends only the credit needed to bring the
charge up to a dollar and leaves the renter the rest.

Before today the card fields never rendered here and the button stayed dead. If you see that,
raise it at once.

---

### K4. Credit exactly equal to the price

`qa-credit-exact` books **Diamond Days Maxi**.

```
Credit applied  -$152.50
TOTAL              $0.00
```

Behaves like K2: card kept, nothing charged, balance `$0.00` afterwards. **A total of `$1.00`
here is wrong.**

---

### K5. A discount code switches credit off

`qa-credit-50` books **SELF-PORTRAIT** and applies **`QACREDIT20`**.

```
Discount         -$27.00
Credit applied   gone from the summary
TOTAL           $136.50
```

Remove the code and the Credit applied line returns, total back to `$113.50`.

One benefit per booking is Designerex's rule, not a bug. Note that the renter pays more with
the code than without it, and the site does not say so.

---

### K6. Cancelling returns the credit

Run K1 again on `qa-credit-50`, then cancel as the renter before the lender acts.

The Stripe hold is released and the balance returns to `$50.00`.

---

### K7. No credit, nothing changed

`qa-credit-none` books **SELF-PORTRAIT**.

```
no Credit applied line
TOTAL           $163.50
```

Dull and the most important. Credit runs through the code every checkout uses, so an ordinary
booking must behave exactly as pack 1 describes.

---

### K8. The renter is told the real reason

Not about credit. Open checkout in **two tabs** signed in as the same account. Start a checkout
in tab one and stop at payment. Start another in tab two. Return to tab one and pay.

Expect:

```
Your saved selection expired. Please pick your dates again.
```

Not a generic line such as "We could not set up the payment just now".

---

## 4. Not ready

- Try-ons, Apple Pay, Afterpay, Klarna, bonds, deposits. Unchanged from pack 1.
- Automatic decline of competing requests, being removed this week. Do not test either way.
- None of this is on Production.

---

## 5. Already covered by automated tests

In `scripts/` in the Designerex-Supabase repository, on top of the six in pack 1.

| Script | What it proves |
|---|---|
| `test-the-hold-knows-about-credit.sql` | Credit comes off the hold, the card-keeping path, quote and booking agree |
| `test-the-charge-clears-the-minimum.sql` | The `$1.00` floor across 1381 prices and 162 balances, none landing between a cent and a dollar |

Neither can check a screen. K3 exists because the numbers were right and the page still could
not be used.

---

## 6. Reporting

Say which of K1 to K8 passed. For any failure give the Stripe payment reference, which looks
like `pi_3UGYfbCuJZ0wdBe41az1elv8`, and it can be traced end to end in a minute.
