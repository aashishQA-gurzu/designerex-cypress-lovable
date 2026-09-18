// Page Object for /checkout (src/routes/_authenticated/checkout/index.tsx as actually
// deployed to DEV). IMPORTANT: the local designerex-consumer-main source checked into
// this repo does NOT match DEV's real build — DEV has a genuine Stripe test-mode
// integration (Stripe Elements "Payment Element", a Supabase edge function
// `authorise-booking` that creates a real manual-capture PaymentIntent server-side).
// See docs/features/stripe.md for the full writeup of this discrepancy and how it was
// discovered (verified against the live app, not guessed).
//
// The app has no data-testid attributes anywhere, so this page is driven by button
// text, the shared <Field label="..."> wrapper's label text, and — for the payment
// step — the real Stripe Elements iframe's own input `name` attributes (`number`,
// `expiry`, `cvc`), which are stable because they're part of Stripe's own SDK, not
// this app's styling.
const DEFAULT_CARD = {
  number: "4242 4242 4242 4242",
  expiry: "12/30",
  cvc: "123",
};

// DEV occasionally returns a 409 "Your saved selection expired" from authorise-booking
// on the very first submit attempt (observed intermittently while building this suite —
// same flow, same data, succeeds on an immediate retry). Retrying once, transparently,
// keeps genuine flakiness from an unrelated hold/reservation timing issue out of test
// results, while a SECOND failure still fails the test for real (not silently swallowed).
const AUTHORISE_BOOKING_ROUTE = "**/functions/v1/authorise-booking*";

class CheckoutPage {
  visit(url) {
    this._lastUrl = url;
    cy.visitApp(url);
    return this;
  }

  fieldByLabel(label) {
    return cy.contains("span", label).parent("label").find("input, textarea");
  }

  fieldExists(label) {
    return cy.get("body").then(($body) => $body.find(`span:contains("${label}")`).length > 0);
  }

  // --- Step 1: hire option / dates / delivery method (pre-filled from the checkout URL) ---
  continueFromStep1() {
    cy.contains("button", /Continue to (delivery|payment)/).click();
    return this;
  }

  // --- Step 2: delivery details ---------------------------------------------------
  fillDeliveryDetails(overrides = {}) {
    const details = {
      addressLine1: "123 Test Street",
      suburb: "Sydney",
      state: "NSW",
      postcode: "2000",
      phone: "0412345678",
      ...overrides,
    };

    this.fieldExists("Street address").then((hasFullAddress) => {
      if (hasFullAddress) {
        this.fieldByLabel("Street address").clear().type(details.addressLine1);
        this.fieldByLabel("Suburb").clear().type(details.suburb);
        cy.get('[aria-label="State"]').click();
        cy.contains('[role="option"], li, button', details.state).click();
        this.fieldByLabel("Postcode").clear().type(details.postcode);
      } else {
        this.fieldExists("Delivery address").then((hasDeliveryAddress) => {
          if (hasDeliveryAddress) this.fieldByLabel("Delivery address").clear().type(details.addressLine1);
        });
      }
    });

    // The phone field's label differs by shipping type: "Contact phone" for
    // pickup/two-hour-Uber, "Phone number" for the full-address (standard/express) form.
    this.fieldExists("Contact phone").then((hasContactPhone) => {
      const label = hasContactPhone ? "Contact phone" : "Phone number";
      this.fieldByLabel(label).clear().type(details.phone);
    });
    return this;
  }

  continueFromStep2() {
    cy.contains("button", "Continue to payment").click();
    return this;
  }

  // --- Step 3: payment (real Stripe Elements "Payment Element" iframe) ------------
  paymentFrameBody() {
    return cy
      .get('iframe[title="Secure payment input frame"]', { timeout: 20000 })
      .its("0.contentDocument.body")
      .should("not.be.empty")
      .then((body) => cy.wrap(body, { log: false }));
  }

  /** Types into a Stripe Elements field by its input `name` (number/expiry/cvc), re-querying the iframe body each time. */
  fillStripeField(name, value) {
    if (!value) return this;
    this.paymentFrameBody().find(`input[name="${name}"]`).clear().type(value);
    return this;
  }

  fillCardDetails(overrides = {}) {
    const card = { ...DEFAULT_CARD, ...overrides };
    this.fillStripeField("number", card.number);
    this.fillStripeField("expiry", card.expiry);
    this.fillStripeField("cvc", card.cvc);
    return this;
  }

  stripeFieldError() {
    // Stripe Elements renders inline field errors inside the same iframe, associated
    // via aria-describedby (e.g. "Field-numberError"). Match on the id prefix.
    return this.paymentFrameBody().find('[id^="Field-"][id$="Error"]');
  }

  agreeToTerms() {
    cy.contains("label", "Terms & Conditions").find('input[type="checkbox"]').check({ force: true });
    return this;
  }

  submitButton() {
    return cy.contains("button", /CONFIRM & CONTINUE|Submitting/);
  }

  submit() {
    this.submitButton().click();
    return this;
  }

  totalText() {
    return cy.contains("dt", "Total").parent().find("dd");
  }

  /** Whether an order-summary "Credit applied" row is currently rendered. */
  hasCreditLine() {
    return cy.get("body").then(($body) => $body.find('dt:contains("Credit")').length > 0);
  }

  creditAmountText() {
    return cy.contains("dt", /credit/i).parent().find("dd");
  }

  discountAmountText() {
    return cy.contains("dt", /discount/i).parent().find("dd");
  }

  applyDiscountCode(code) {
    cy.get('input[placeholder="Enter code"]').clear().type(code);
    cy.contains("button", "Apply").click();
    return this;
  }

  validationErrors() {
    return cy.get('[role="alert"], .text-destructive');
  }

  /** Steps 1 + 2 + card fill + terms, stopping just before submit (used directly, and by the retry path). */
  fillWizard({ card, address } = {}) {
    this.continueFromStep1();
    this.fillDeliveryDetails(address);
    this.continueFromStep2();
    this.fillCardDetails(card);
    this.agreeToTerms();
    return this;
  }

  /**
   * Submits the payment step and yields the intercepted `authorise-booking` response
   * ({status, body}), transparently retrying on a 409 "expired selection" response by
   * re-visiting the last checkout URL and refilling the wizard with the same options
   * (up to `attemptsLeft` additional tries, with a short settle wait in between). A
   * persistent 409 after all retries is returned as-is, so a genuine failure still
   * surfaces as a real test failure rather than being silently hidden forever.
   */
  submitAndCaptureAuthorisation(options = {}, attemptsLeft = 2) {
    const alias = `authoriseBooking${attemptsLeft}`;
    cy.intercept("POST", AUTHORISE_BOOKING_ROUTE).as(alias);
    this.submit();
    return cy.wait(`@${alias}`, { timeout: 20000 }).then((interception) => {
      const status = interception.response && interception.response.statusCode;
      const body = interception.response && interception.response.body;
      if (status !== 409 || attemptsLeft <= 0) return { status, body };

      cy.log(`authorise-booking returned 409 (expired selection) — retrying (${attemptsLeft} attempt(s) left).`);
      cy.wait(2000);
      this.visit(this._lastUrl);
      this.fillWizard(options);
      return this.submitAndCaptureAuthorisation(options, attemptsLeft - 1);
    });
  }

  /** Drives the whole wizard from a freshly-opened /checkout URL through to a captured authorise-booking result, with the 409 retry above. */
  completeCheckout(options = {}) {
    this.fillWizard(options);
    return this.submitAndCaptureAuthorisation(options);
  }
}

export default new CheckoutPage();
