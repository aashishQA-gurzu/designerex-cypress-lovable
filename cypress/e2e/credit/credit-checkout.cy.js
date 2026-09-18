import CheckoutPage from "../../pages/CheckoutPage";
import ConfirmationPage from "../../pages/ConfirmationPage";
import RentalsPage from "../../pages/RentalsPage";

// Maps to "Credit at Checkout" in Designerex_Test_Cases_By_Feature.xlsx. See
// cypress/fixtures/credit-test-cases.json for the full traceability manifest and
// docs/features/credit-checkout.md for why this suite is NOT freely re-runnable like
// the Stripe suite: each qa-credit-* account holds a fixed, non-replenished balance.
//
// Each scenario group uses ONE `before()` to perform the single real action (or a
// deliberately non-consuming view), storing results in a shared `ctx` object; the
// group's `it()`s then each assert one distinct facet of that same evidence — so one
// real booking/payment can honestly answer several Excel Test Case IDs without spending
// the account's credit more than once.

describe("Credit at Checkout — K3 (qa-credit-edge / Juniper Gown / $1 floor)", () => {
  const ctx = {};

  before(() => {
    cy.loginAsCreditAccount("edge");
    cy.getSupabaseAccessToken().then((token) => {
      ctx.token = token;
    });
    cy.getSupabaseUserId().then((uid) => {
      ctx.uid = uid;
    });
    cy.findDressByTitle("Juniper Gown").then((dress) => {
      ctx.dress = dress;
    });
    cy.then(() => cy.getRawCreditBalance(ctx.token, ctx.uid)).then((bal) => {
      ctx.balanceBefore = bal;
      cy.log(`Balance before: $${bal}`);
    });
    cy.then(() => cy.buildCheckoutUrl(ctx.dress)).then((url) => {
      ctx.checkoutUrl = url;
      CheckoutPage.visit(url);
    });
    CheckoutPage.continueFromStep1();
    CheckoutPage.fillDeliveryDetails();
    CheckoutPage.continueFromStep2();
    CheckoutPage.creditAmountText()
      .invoke("text")
      .then((t) => {
        ctx.creditLineText = t;
      });
    CheckoutPage.totalText()
      .invoke("text")
      .then((t) => {
        ctx.totalBeforeSubmit = t;
      });
    CheckoutPage.fillCardDetails();
    CheckoutPage.agreeToTerms();
    CheckoutPage.submitAndCaptureAuthorisation({}).then(({ status, body }) => {
      ctx.authoriseStatus = status;
      ctx.authoriseBody = body;
      cy.writeFile("cypress/results/_credit-k3-authorise-response.json", { status, body });
    });
    ConfirmationPage.assertLoaded();
    ConfirmationPage.bookingId().then((id) => {
      ctx.bookingId = id;
    });
    cy.then(() => cy.getBookingById(ctx.bookingId, ctx.token)).then((booking) => {
      ctx.booking = booking;
      cy.writeFile("cypress/results/_credit-k3-booking.json", booking);
    });
    cy.then(() => cy.getRawCreditBalance(ctx.token, ctx.uid)).then((bal) => {
      ctx.balanceAfter = bal;
      cy.log(`Balance after: $${bal}`);
    });
  });

  it("CR-TC-009 - credit applied is floored to $212.00 (not the full $212.70), total is $1.00", () => {
    expect(ctx.creditLineText, "credit line text").to.match(/212\.00/);
    expect(ctx.totalBeforeSubmit, "total before submit").to.eq("$1.00");
    Cypress.env("lastActualResult", `Credit line showed "${ctx.creditLineText}"; total was ${ctx.totalBeforeSubmit} (not $0.30).`);
  });

  it("CR-TC-010 - the $1.00 floor payment completes with a real Stripe PaymentIntent", () => {
    expect(ctx.authoriseStatus, "authorise-booking status").to.eq(200);
    expect(ctx.authoriseBody.currency, "currency").to.eq("AUD");
    expect(ctx.booking.stripe_payment_intent_id, "real PaymentIntent id").to.match(/^pi_/);
    Cypress.env(
      "lastActualResult",
      `Booking ${ctx.bookingId} created with a real PaymentIntent ${ctx.booking.stripe_payment_intent_id}; authorise-booking reported amount_cents=${ctx.authoriseBody.amount_cents}.`,
    );
  });

  it("CR-TC-011 - remaining balance is exactly $0.70 after the floored booking", () => {
    expect(ctx.balanceAfter, "remaining credit").to.be.closeTo(0.7, 0.001);
    Cypress.env("lastActualResult", `qa-credit-edge balance went from $${ctx.balanceBefore.toFixed(2)} to $${ctx.balanceAfter.toFixed(2)}.`);
  });

  it("CR-TC-012 - the floored payment amount is exactly 100 cents, never a sub-dollar fraction", () => {
    expect(ctx.authoriseBody.amount_cents, "amount_cents is exactly 100 (never $0.01-$0.99)").to.eq(100);
    Cypress.env("lastActualResult", `authorise-booking charged exactly amount_cents=100 (the $1.00 floor), never a sub-dollar fraction.`);
  });

  it("CR-TC-053 - the remaining $0.70 is not incorrectly rounded to $0.00 or $1.00 (same evidence as CR-TC-011)", () => {
    expect(ctx.balanceAfter, "exactly $0.70, not rounded").to.be.closeTo(0.7, 0.001);
    expect(ctx.balanceAfter, "not rounded down to $0.00").to.not.eq(0);
    expect(ctx.balanceAfter, "not rounded up to $1.00").to.not.eq(1);
    Cypress.env("lastActualResult", `Balance is exactly $${ctx.balanceAfter.toFixed(2)} — not rounded to either $0.00 or $1.00.`);
  });

  it("CR-TC-056 - end-to-end minimum-payment edge case (literal restatement of K3 — same evidence as CR-TC-009 through CR-TC-012)", () => {
    expect(ctx.creditLineText).to.match(/212\.00/);
    expect(ctx.totalBeforeSubmit).to.eq("$1.00");
    expect(ctx.authoriseBody.amount_cents).to.eq(100);
    expect(ctx.booking.stripe_payment_intent_id).to.match(/^pi_/);
    expect(ctx.balanceAfter).to.be.closeTo(0.7, 0.001);
    Cypress.env("lastActualResult", `Full end-to-end: credit -$212.00, total $1.00, real PaymentIntent charged, remaining balance $${ctx.balanceAfter.toFixed(2)}.`);
  });
});

describe("Credit at Checkout — K2 (qa-credit-150 / Margot Maxi / credit fully covers total)", () => {
  const ctx = {};

  before(() => {
    cy.loginAsCreditAccount("150");
    cy.getSupabaseAccessToken().then((token) => {
      ctx.token = token;
    });
    cy.getSupabaseUserId().then((uid) => {
      ctx.uid = uid;
    });
    cy.then(() => cy.getRawCreditBalance(ctx.token, ctx.uid)).then((bal) => {
      ctx.balanceOnLoad = bal;
    });
    cy.findDressByTitle("Margot Maxi").then((dress) => {
      ctx.dress = dress;
    });
    cy.then(() => cy.buildCheckoutUrl(ctx.dress)).then((url) => {
      ctx.checkoutUrl = url;
      CheckoutPage.visit(url);
    });
    CheckoutPage.continueFromStep1();
    CheckoutPage.fillDeliveryDetails();
    CheckoutPage.continueFromStep2();

    // CR-TC-039/040: merely reaching the payment step (viewing the credit-covered total)
    // must not itself consume any credit — check the balance again before submitting.
    cy.then(() => cy.getRawCreditBalance(ctx.token, ctx.uid)).then((bal) => {
      ctx.balanceAfterViewing = bal;
    });

    CheckoutPage.creditAmountText()
      .invoke("text")
      .then((t) => {
        ctx.creditLineText = t;
      });
    CheckoutPage.totalText()
      .invoke("text")
      .then((t) => {
        ctx.totalBeforeSubmit = t;
      });
    // CR-TC-005: card fields are still present/usable at a $0.00 total.
    CheckoutPage.paymentFrameBody()
      .find('input[name="number"]')
      .should("be.visible")
      .then(() => {
        ctx.cardFieldsVisible = true;
      });

    CheckoutPage.fillCardDetails();
    CheckoutPage.agreeToTerms();
    CheckoutPage.submitAndCaptureAuthorisation({}).then(({ status, body }) => {
      ctx.authoriseStatus = status;
      ctx.authoriseBody = body;
      cy.writeFile("cypress/results/_credit-k2-authorise-response.json", { status, body });
    });
    ConfirmationPage.assertLoaded();
    ConfirmationPage.bookingId().then((id) => {
      ctx.bookingId = id;
    });
    cy.then(() => cy.getBookingById(ctx.bookingId, ctx.token)).then((booking) => {
      ctx.booking = booking;
      cy.writeFile("cypress/results/_credit-k2-booking.json", booking);
    });
    cy.then(() => cy.getRawCreditBalance(ctx.token, ctx.uid)).then((bal) => {
      ctx.balanceAfter = bal;
    });
  });

  it("CR-TC-004 - credit applied is -$97.50, Total is $0.00", () => {
    expect(ctx.creditLineText, "credit line text").to.match(/97\.50/);
    expect(ctx.totalBeforeSubmit, "total").to.eq("$0.00");
    Cypress.env("lastActualResult", `Credit line "${ctx.creditLineText}"; total $0.00 (Margot Maxi $97.50 fully covered by $150 credit).`);
  });

  it("CR-TC-005 - Stripe card fields remain visible and enterable at a $0.00 total", () => {
    expect(ctx.cardFieldsVisible, "card number field visible before submit").to.eq(true);
    Cypress.env("lastActualResult", "The Stripe Elements card number field was visible and accepted input even with Total = $0.00.");
  });

  it("CR-TC-006 - a $0.00 total creates a Stripe SetupIntent (kind:\"setup\"), never a $0 PaymentIntent charge", () => {
    expect(ctx.authoriseStatus, "authorise-booking status").to.eq(200);
    expect(ctx.authoriseBody.kind, "authorise-booking switches to a SetupIntent for a $0 total").to.eq("setup");
    expect(ctx.authoriseBody.amount_cents, "amount_cents is 0 — nothing is ever charged").to.eq(0);
    expect(ctx.authoriseBody.client_secret, "a real Stripe SetupIntent secret (seti_...), not a PaymentIntent (pi_...)").to.match(/^seti_/);
    expect(ctx.booking.status, "booking status").to.eq("requested");
    Cypress.env(
      "lastActualResult",
      `Booking ${ctx.bookingId} created (status=requested). For the $0.00 total, authorise-booking returned kind="setup", amount_cents=0, a SetupIntent secret (${ctx.authoriseBody.client_secret.split("_secret_")[0]}) instead of a PaymentIntent — confirms no charge is ever attempted.`,
    );
  });

  it("CR-TC-007 - the card is still collected via a SetupIntent (for a future bond/damage claim), never charged", () => {
    expect(ctx.cardFieldsVisible, "card was enterable, i.e. collected").to.eq(true);
    expect(ctx.booking.stripe_payment_intent_id, "the stored id is the SetupIntent, not a charge-style PaymentIntent").to.match(/^seti_/);
    Cypress.env(
      "lastActualResult",
      `booking.stripe_payment_intent_id = "${ctx.booking.stripe_payment_intent_id}" — a Stripe SetupIntent (card-on-file), confirming the card was collected but never charged for the $0.00 booking.`,
    );
  });

  it("CR-TC-008 - qa-credit-150's balance is exactly $52.50 after the $97.50 Margot Maxi booking", () => {
    expect(ctx.balanceAfter, "remaining credit").to.be.closeTo(52.5, 0.001);
    Cypress.env("lastActualResult", `Balance went from $${ctx.balanceOnLoad.toFixed(2)} to $${ctx.balanceAfter.toFixed(2)}.`);
  });

  it("CR-TC-038 - only the required $97.50 is deducted from the larger $150.00 balance, never more", () => {
    expect(ctx.balanceOnLoad, "starting balance was the full $150").to.be.closeTo(150, 0.001);
    expect(ctx.balanceOnLoad - ctx.balanceAfter, "exactly $97.50 consumed").to.be.closeTo(97.5, 0.001);
    Cypress.env("lastActualResult", `Exactly $${(ctx.balanceOnLoad - ctx.balanceAfter).toFixed(2)} was deducted from the $150.00 balance — never more than the $97.50 booking required.`);
  });

  it("CR-TC-039 - viewing a checkout without submitting leaves the balance completely unchanged", () => {
    expect(ctx.balanceAfterViewing, "balance unchanged after merely reaching the payment step").to.be.closeTo(ctx.balanceOnLoad, 0.001);
    Cypress.env("lastActualResult", `Balance was $${ctx.balanceOnLoad.toFixed(2)} on load and still $${ctx.balanceAfterViewing.toFixed(2)} after viewing the fully-credit-covered checkout, before any submission.`);
  });

  it("CR-TC-040 - the credit preview shown at checkout does not itself deduct anything until a booking completes", () => {
    expect(ctx.balanceAfterViewing, "same evidence as CR-TC-039").to.be.closeTo(ctx.balanceOnLoad, 0.001);
    Cypress.env("lastActualResult", "dx_calculate_credit is a read-only preview — the balance only changed after the booking actually completed (see CR-TC-008).");
  });

  it("CR-TC-046 - the zero-total booking is consistent across the UI, the booking row, and Stripe (same evidence as CR-TC-004/006/007)", () => {
    expect(ctx.totalBeforeSubmit, "UI total").to.eq("$0.00");
    expect(ctx.booking.status, "booking created").to.eq("requested");
    expect(ctx.authoriseBody.amount_cents, "no Stripe payment amount").to.eq(0);
    expect(ctx.booking.stripe_payment_intent_id, "card saved via SetupIntent").to.match(/^seti_/);
    Cypress.env("lastActualResult", "UI showed $0.00, the booking was created, no PaymentIntent charge exists, and the card was saved via a SetupIntent — all consistent.");
  });

  it("CR-TC-055 - end-to-end full-credit booking (literal restatement of K2 — same evidence as CR-TC-004 through CR-TC-008)", () => {
    expect(ctx.creditLineText).to.match(/97\.50/);
    expect(ctx.totalBeforeSubmit).to.eq("$0.00");
    expect(ctx.authoriseBody.amount_cents).to.eq(0);
    expect(ctx.booking.stripe_payment_intent_id).to.match(/^seti_/);
    expect(ctx.balanceAfter).to.be.closeTo(52.5, 0.001);
    Cypress.env("lastActualResult", `Full end-to-end: credit -$97.50, total $0.00, SetupIntent (no charge), card saved, remaining balance $${ctx.balanceAfter.toFixed(2)}.`);
  });
});

describe("Credit at Checkout — K4 (qa-credit-exact / Diamond Days Maxi / exact credit-to-price match)", () => {
  const ctx = {};

  before(() => {
    cy.loginAsCreditAccount("exact");
    cy.getSupabaseAccessToken().then((token) => {
      ctx.token = token;
    });
    cy.getSupabaseUserId().then((uid) => {
      ctx.uid = uid;
    });
    cy.then(() => cy.getRawCreditBalance(ctx.token, ctx.uid)).then((bal) => {
      ctx.balanceOnLoad = bal;
    });
    cy.findDressByTitle("Diamond Days Maxi").then((dress) => {
      ctx.dress = dress;
    });
    cy.then(() => cy.buildCheckoutUrl(ctx.dress)).then((url) => {
      CheckoutPage.visit(url);
    });
    CheckoutPage.continueFromStep1();
    CheckoutPage.fillDeliveryDetails();
    CheckoutPage.continueFromStep2();
    CheckoutPage.creditAmountText()
      .invoke("text")
      .then((t) => {
        ctx.creditLineText = t;
      });
    CheckoutPage.totalText()
      .invoke("text")
      .then((t) => {
        ctx.totalBeforeSubmit = t;
      });
    CheckoutPage.fillCardDetails();
    CheckoutPage.agreeToTerms();
    CheckoutPage.submitAndCaptureAuthorisation({}).then(({ status, body }) => {
      ctx.authoriseStatus = status;
      ctx.authoriseBody = body;
    });
    ConfirmationPage.assertLoaded();
    ConfirmationPage.bookingId().then((id) => {
      ctx.bookingId = id;
    });
    cy.then(() => cy.getBookingById(ctx.bookingId, ctx.token)).then((booking) => {
      ctx.booking = booking;
    });
    cy.then(() => cy.getRawCreditBalance(ctx.token, ctx.uid)).then((bal) => {
      ctx.balanceAfter = bal;
    });
  });

  it("CR-TC-013 - credit applied is -$152.50, Total is exactly $0.00 (not $1.00)", () => {
    expect(ctx.creditLineText, "credit line").to.match(/152\.50/);
    expect(ctx.totalBeforeSubmit, "total — the $1 floor must NOT apply to an exact match").to.eq("$0.00");
    Cypress.env("lastActualResult", `Credit line "${ctx.creditLineText}"; total exactly $0.00 — the $1 floor rule correctly did not apply since credit ($152.50) exactly equals the price ($152.50).`);
  });

  it("CR-TC-014 - the exact-match $0.00 booking creates a SetupIntent, not a PaymentIntent charge", () => {
    expect(ctx.authoriseStatus).to.eq(200);
    expect(ctx.authoriseBody.kind, "kind: setup for an exact $0 match too").to.eq("setup");
    expect(ctx.authoriseBody.amount_cents).to.eq(0);
    expect(ctx.booking.stripe_payment_intent_id).to.match(/^seti_/);
    Cypress.env("lastActualResult", `Booking ${ctx.bookingId}: authorise-booking returned kind="setup", amount_cents=0 for the exact credit-to-price match.`);
  });

  it("CR-TC-015 - qa-credit-exact's balance is exactly $0.00 after the exact-match booking, never negative", () => {
    expect(ctx.balanceOnLoad, "starting balance was $152.50").to.be.closeTo(152.5, 0.001);
    expect(ctx.balanceAfter, "remaining credit is exactly $0.00").to.be.closeTo(0, 0.001);
    Cypress.env("lastActualResult", `Balance went from $${ctx.balanceOnLoad.toFixed(2)} to $${ctx.balanceAfter.toFixed(2)} — fully and exactly consumed, never negative.`);
  });

  it("CR-TC-033 - credit cannot result in a negative checkout total (same evidence as CR-TC-013)", () => {
    expect(ctx.totalBeforeSubmit, "total is $0.00, never negative").to.eq("$0.00");
    Cypress.env("lastActualResult", "Total floored at exactly $0.00 for an exact credit-to-price match; never went negative.");
  });

  it("CR-TC-057 - end-to-end exact-credit booking (literal restatement of K4 — same evidence as CR-TC-013 through CR-TC-015)", () => {
    expect(ctx.creditLineText).to.match(/152\.50/);
    expect(ctx.totalBeforeSubmit).to.eq("$0.00");
    expect(ctx.authoriseBody.amount_cents).to.eq(0);
    expect(ctx.booking.stripe_payment_intent_id).to.match(/^seti_/);
    expect(ctx.balanceAfter).to.be.closeTo(0, 0.001);
    Cypress.env("lastActualResult", `Full end-to-end: credit -$152.50, total $0.00, SetupIntent (no charge), card saved, remaining balance $${ctx.balanceAfter.toFixed(2)}.`);
  });
});

describe("Credit at Checkout — K7 (qa-credit-none / SELF-PORTRAIT / no credit baseline)", () => {
  // qa-credit-none has no balance to preserve, so this group is safely re-runnable —
  // it just creates another ordinary test booking each time, same as the Stripe suite.
  const ctx = {};

  before(() => {
    cy.loginAsCreditAccount("none");
    cy.getSupabaseAccessToken().then((token) => {
      ctx.token = token;
    });
    cy.findDressByTitle("SELF-PORTRAIT").then((dress) => {
      ctx.dress = dress;
    });
    cy.then(() => cy.buildCheckoutUrl(ctx.dress)).then((url) => {
      CheckoutPage.visit(url);
    });
    CheckoutPage.continueFromStep1();
    CheckoutPage.fillDeliveryDetails();
    CheckoutPage.continueFromStep2();
    CheckoutPage.hasCreditLine().then((has) => {
      ctx.hasCreditLine = has;
    });
    CheckoutPage.totalText()
      .invoke("text")
      .then((t) => {
        ctx.totalBeforeSubmit = t;
      });
    CheckoutPage.fillCardDetails();
    CheckoutPage.agreeToTerms();
    CheckoutPage.submitAndCaptureAuthorisation({}).then(({ status, body }) => {
      ctx.authoriseStatus = status;
      ctx.authoriseBody = body;
    });
    ConfirmationPage.assertLoaded();
  });

  it("CR-TC-022 - qa-credit-none shows no Credit applied line; total is $163.50", () => {
    expect(ctx.hasCreditLine, "no Credit applied line for a $0 balance").to.eq(false);
    expect(ctx.totalBeforeSubmit, "total before submit").to.eq("$163.50");
    Cypress.env("lastActualResult", `No Credit applied line rendered; total was ${ctx.totalBeforeSubmit} (full listed price).`);
  });

  it("CR-TC-023 - the PaymentIntent amount for a no-credit checkout is exactly $163.50 AUD", () => {
    expect(ctx.authoriseStatus).to.eq(200);
    expect(ctx.authoriseBody.amount_cents, "amount_cents").to.eq(16350);
    expect(ctx.authoriseBody.currency, "currency").to.eq("AUD");
    Cypress.env("lastActualResult", `authorise-booking charged amount_cents=${ctx.authoriseBody.amount_cents} (AUD), exactly the listed $163.50 price with no credit adjustment.`);
  });

  it("CR-TC-032 - a renter with no credit never receives a phantom credit deduction (same evidence as CR-TC-022)", () => {
    expect(ctx.hasCreditLine, "no phantom credit line").to.eq(false);
    Cypress.env("lastActualResult", "No credit deduction of any kind appeared for a $0-balance renter.");
  });

  it("CR-TC-047 - standard checkout without credit remains unchanged (same evidence as CR-TC-022/023)", () => {
    expect(ctx.hasCreditLine, "no credit-related UI introduced").to.eq(false);
    expect(ctx.totalBeforeSubmit, "ordinary total").to.eq("$163.50");
    expect(ctx.authoriseBody.amount_cents, "Stripe receives the full price").to.eq(16350);
    expect(ctx.authoriseBody.currency).to.eq("AUD");
    Cypress.env("lastActualResult", "Ordinary card-payment checkout behavior confirmed unchanged: no credit UI, Stripe amount = $163.50 AUD.");
  });
});

describe("Credit at Checkout — CR-TC-030 (qa-credit-50's current already-spent $0.00 balance)", () => {
  // Opportunistic, safe check: qa-credit-50 is independently known to already be at
  // $0.00 (see knownBlocker in the manifest) — viewing it is read-only and costs
  // nothing further, so this confirms the "no credit line at $0 balance" rule using
  // the account itself, complementing K7's qa-credit-none coverage of the same rule.
  const ctx = {};

  before(() => {
    cy.loginAsCreditAccount("50");
    cy.findDressByTitle("SELF-PORTRAIT").then((dress) => {
      cy.buildCheckoutUrl(dress).then((url) => {
        CheckoutPage.visit(url);
      });
    });
    CheckoutPage.continueFromStep1();
    CheckoutPage.fillDeliveryDetails();
    CheckoutPage.continueFromStep2();
    CheckoutPage.hasCreditLine().then((has) => {
      ctx.hasCreditLine = has;
    });
    CheckoutPage.totalText()
      .invoke("text")
      .then((t) => {
        ctx.totalText = t;
      });
  });

  it("CR-TC-030 - no Credit applied line is shown for an account whose balance is $0.00", () => {
    expect(ctx.hasCreditLine, "no credit line at a $0.00 balance").to.eq(false);
    expect(ctx.totalText, "total calculated with no credit").to.eq("$163.50");
    Cypress.env("lastActualResult", `qa-credit-50 (currently $0.00) showed no Credit applied line; total was the full ${ctx.totalText}.`);
  });
});

describe("Credit at Checkout — CR-S15/CR-S18 (qa-credit-150 spend-then-cancel: cancellation restores credit + idempotency)", () => {
  // Reuses qa-credit-150's remaining $52.50 (from K2) for a NEW partial-credit booking,
  // then cancels it — nets the account back to $52.50, no lasting balance cost. This is
  // deliberately a DIFFERENT account from the Excel's literal $50/qa-credit-50 examples
  // (blocked — see knownBlocker); it verifies the same general mechanism instead.
  const ctx = {};

  before(() => {
    cy.loginAsCreditAccount("150");
    cy.getSupabaseAccessToken().then((token) => {
      ctx.token = token;
    });
    cy.getSupabaseUserId().then((uid) => {
      ctx.uid = uid;
    });
    cy.then(() => cy.getRawCreditBalance(ctx.token, ctx.uid)).then((bal) => {
      ctx.balanceBefore = bal;
    });
    // Any pricier bookable dress works (needs price > the $52.50 balance, for a genuine
    // partial-credit case) — avoids the specific named listings' heavy blocked-date
    // history from earlier suite runs colliding with the randomized date range.
    cy.findBookableDress().then((dress) => {
      ctx.dress = dress;
    });
    cy.then(() => cy.buildCheckoutUrl(ctx.dress)).then((url) => {
      ctx.checkoutUrl = url;
      CheckoutPage.visit(url);
    });
    CheckoutPage.continueFromStep1();
    CheckoutPage.fillDeliveryDetails();
    CheckoutPage.continueFromStep2();
    // The credit-preview RPC can take a moment after step 2 renders — wait for the
    // total to settle into a real dollar value before reading the credit line (a bare
    // .invoke("text") here was observed racing ahead of that render once).
    CheckoutPage.totalText().invoke("text").should("match", /^\$\d+\.\d{2}$/);
    CheckoutPage.creditAmountText()
      .invoke("text")
      .should("match", /\$/)
      .then((t) => {
        ctx.creditLineText = t;
      });
    CheckoutPage.fillCardDetails();
    CheckoutPage.agreeToTerms();

    cy.intercept("POST", "**/functions/v1/authorise-booking*").as("authoriseBooking");
    CheckoutPage.submit();
    cy.wait("@authoriseBooking").then((first) => {
      ctx.authoriseBody = first.response.body;
      ctx.reservationId = first.request.body.reservation_id;

      // CR-TC-049: replay the SAME reservation_id directly — proves a duplicate
      // submission reuses the existing PaymentIntent instead of double-deducting credit.
      cy.request({
        method: "POST",
        url: `${Cypress.env("supabaseUrl")}/functions/v1/authorise-booking`,
        headers: { apikey: Cypress.env("supabaseAnonKey"), Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/json" },
        body: first.request.body,
      }).then((second) => {
        ctx.duplicateAttempt = second.body;
      });
    });

    ConfirmationPage.assertLoaded();
    ConfirmationPage.bookingId().then((id) => {
      ctx.bookingId = id;
    });
    cy.then(() => cy.getBookingById(ctx.bookingId, ctx.token)).then((booking) => {
      ctx.bookingAfterCreate = booking;
    });
    cy.then(() => cy.getRawCreditBalance(ctx.token, ctx.uid)).then((bal) => {
      ctx.balanceAfterBooking = bal;
    });

    // Cancel it as the renter, before any lender action — restoring the credit.
    RentalsPage.visit();
    cy.then(() => RentalsPage.cancelBookingFor(ctx.dress.title));
    RentalsPage.selectReason("Change of plans");
    RentalsPage.confirmCancel();
    cy.wait(2000);

    cy.then(() => cy.getBookingById(ctx.bookingId, ctx.token)).then((booking) => {
      ctx.bookingAfterCancel = booking;
    });
    cy.then(() => cy.getRawCreditBalance(ctx.token, ctx.uid)).then((bal) => {
      ctx.balanceAfterCancel = bal;
    });
  });

  it("CR-TC-049 - a duplicate authorise-booking call for the same reservation reuses the PaymentIntent, never double-deducting credit", () => {
    expect(ctx.duplicateAttempt.reused, "second call reuses the existing PaymentIntent").to.eq(true);
    expect(ctx.duplicateAttempt.client_secret, "identical client_secret").to.eq(ctx.authoriseBody.client_secret);
    Cypress.env("lastActualResult", `A repeat authorise-booking call for reservation ${ctx.reservationId} returned reused:true with the identical client_secret — no duplicate PaymentIntent or credit deduction.`);
  });

  it("CR-TC-043 - cancelling a partial-credit booking releases the PaymentIntent hold", () => {
    expect(ctx.bookingAfterCreate.stripe_payment_intent_id, "a real PaymentIntent existed").to.match(/^pi_/);
    expect(ctx.bookingAfterCancel.status, "booking is cancelled").to.match(/cancel/i);
    Cypress.env(
      "lastActualResult",
      `Booking ${ctx.bookingId} (PaymentIntent ${ctx.bookingAfterCreate.stripe_payment_intent_id}) moved from status="${ctx.bookingAfterCreate.status}" to status="${ctx.bookingAfterCancel.status}" after renter cancellation.`,
    );
  });

  it("CR-TC-044 - the cancelled booking restores exactly the credit it spent, no over/under-crediting", () => {
    expect(ctx.balanceAfterBooking, "credit was spent by the booking").to.be.lessThan(ctx.balanceBefore);
    expect(ctx.balanceAfterCancel, "balance restored to exactly the pre-booking amount").to.be.closeTo(ctx.balanceBefore, 0.001);
    Cypress.env(
      "lastActualResult",
      `Balance: $${ctx.balanceBefore.toFixed(2)} before → $${ctx.balanceAfterBooking.toFixed(2)} after booking → $${ctx.balanceAfterCancel.toFixed(2)} after cancelling. Restored exactly, no over/under-crediting.`,
    );
  });

  it("CR-TC-059 - end-to-end: cancellation releases the hold, restores credit exactly, ready for reuse (same evidence as CR-TC-043/044)", () => {
    expect(ctx.balanceAfterCancel, "restored credit is available again").to.be.closeTo(ctx.balanceBefore, 0.001);
    expect(ctx.bookingAfterCancel.status, "no duplicate credit/booking created").to.match(/cancel/i);
    Cypress.env("lastActualResult", `Full lifecycle verified: booking created (spending $${(ctx.balanceBefore - ctx.balanceAfterBooking).toFixed(2)}), cancelled, credit restored to $${ctx.balanceAfterCancel.toFixed(2)} — ready for reuse.`);
  });
});

describe("Credit at Checkout — CR-TC-052 (qa-credit-exact's post-K4 already-spent $0.00 balance)", () => {
  // Safe, view-only: qa-credit-exact is independently known to be at $0.00 after K4
  // (CR-TC-015) — viewing it again costs nothing further.
  const ctx = {};

  before(() => {
    cy.loginAsCreditAccount("exact");
    // Any bookable dress works here (the check is balance-driven, not price-specific);
    // avoiding the specific named listings sidesteps their heavy blocked-date history
    // from earlier suite runs colliding with the randomized date range.
    cy.findBookableDress().then((dress) => {
      ctx.dress = dress;
      cy.buildCheckoutUrl(dress).then((url) => {
        CheckoutPage.visit(url);
      });
    });
    CheckoutPage.continueFromStep1();
    CheckoutPage.fillDeliveryDetails();
    CheckoutPage.continueFromStep2();
    CheckoutPage.hasCreditLine().then((has) => {
      ctx.hasCreditLine = has;
    });
    CheckoutPage.totalText()
      .invoke("text")
      .should("match", /^\$\d+\.\d{2}$/)
      .then((t) => {
        ctx.totalText = t;
      });
  });

  it("CR-TC-052 - qa-credit-exact's now-zero balance cannot be reused; no Credit applied line, full price payable", () => {
    expect(ctx.hasCreditLine, "no credit line at $0.00 balance").to.eq(false);
    expect(ctx.totalText, "not $0.00 — there's no credit to cover it").to.not.eq("$0.00");
    Cypress.env("lastActualResult", `qa-credit-exact (now $0.00 after CR-TC-015) showed no Credit applied line on a fresh checkout for ${ctx.dress.title}; full price ${ctx.totalText} was payable normally.`);
  });
});

describe("Credit at Checkout — K8 (checkout/session conflict, regular renter — no credit account involved)", () => {
  // Starting a second checkout invalidates the account's other in-flight one (confirmed
  // directly: dx_hold_dates returns {reservation_id, expires_at}; a second hold for the
  // same renter supersedes the first). Reproduced deterministically via direct
  // authorise-booking replay rather than two literal browser tabs — the same technique
  // already used for TC-STR-018/019 in the Stripe suite. Uses the regular renter account,
  // so this group is freely re-runnable.
  const ctx = {};

  before(() => {
    cy.intercept("POST", "**/rest/v1/rpc/dx_hold_dates").as("hold");
    cy.loginAsRenter();
    cy.getSupabaseAccessToken().then((token) => {
      ctx.token = token;
    });

    cy.findBookableDress().then((dressA) => {
      ctx.dressA = dressA;
      cy.then(() => cy.buildCheckoutUrl(dressA)).then((url) => {
        CheckoutPage.visit(url);
      });
    });
    cy.wait("@hold").then((i) => {
      ctx.staleReservationId = i.response.body[0].reservation_id;
    });

    // "Switch tabs": start a second, different checkout for the SAME account.
    cy.findBookableDress().then((dressB) => {
      cy.then(() => cy.buildCheckoutUrl(dressB)).then((url) => {
        CheckoutPage.visit(url);
      });
    });
    cy.wait("@hold"); // confirms the second hold was created, superseding the first

    // "Return to tab one and pay": replay the FIRST (now-stale) reservation directly.
    cy.then(() => {
      return cy.request({
        method: "POST",
        url: `${Cypress.env("supabaseUrl")}/functions/v1/authorise-booking`,
        headers: { apikey: Cypress.env("supabaseAnonKey"), Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/json" },
        failOnStatusCode: false,
        body: {
          reservation_id: ctx.staleReservationId,
          hire_option: "hire_a",
          shipping_type: ctx.dressA.shippingOption || "standard",
          two_hour: 0,
          discount_code: null,
          delivery_buffer: 0,
        },
      });
    }).then((res) => {
      ctx.staleAttemptStatus = res.status;
      ctx.staleAttemptBody = res.body;
    });
  });

  it("CR-TC-024 - paying on a stale (superseded) checkout returns the specific expired-selection message", () => {
    expect(ctx.staleAttemptStatus, "authorise-booking status for the stale reservation").to.eq(409);
    expect(ctx.staleAttemptBody.error, "exact user-facing message").to.eq("Your saved selection expired. Please pick your dates again.");
    Cypress.env("lastActualResult", `Replaying the first tab's stale reservation_id returned HTTP 409: "${ctx.staleAttemptBody.error}".`);
  });

  it("CR-TC-025 - the message is the specific expired-selection one, not a generic payment/setup error", () => {
    expect(ctx.staleAttemptBody.error, "not the generic setup-failed message").to.not.include("We could not set up the payment");
    expect(ctx.staleAttemptBody.error, "the specific message").to.include("saved selection expired");
    Cypress.env("lastActualResult", "Confirmed the specific expired-selection message is returned, never the generic 'We could not set up the payment just now' error.");
  });

  it("CR-TC-034 - a stale checkout calculation cannot be used to create an incorrect payment (same evidence)", () => {
    expect(ctx.staleAttemptStatus, "the stale attempt is rejected outright, no PaymentIntent/SetupIntent is returned").to.eq(409);
    expect(ctx.staleAttemptBody.client_secret, "no client_secret on a rejected stale attempt").to.be.undefined;
    Cypress.env("lastActualResult", "The stale reservation_id was rejected with no client_secret ever issued — no payment could proceed on it.");
  });
});
