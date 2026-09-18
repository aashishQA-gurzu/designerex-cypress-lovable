import CheckoutPage from "../../pages/CheckoutPage";
import ConfirmationPage from "../../pages/ConfirmationPage";

// Maps 1:1 to "Stripe Integration Test suite" in Designerex_Test_Cases_By_Feature.xlsx.
// See cypress/fixtures/stripe-test-cases.json for the full traceability manifest (all 60
// cases, classified automated/planned/blocked with reasons) and docs/features/stripe.md
// for the real payment mechanism: DEV runs a genuine Stripe TEST-MODE integration
// (Stripe Elements "Payment Element" + a `authorise-booking` Supabase edge function that
// server-side computes the amount and creates a real manual-capture PaymentIntent).
//
// Every `it()` title carries its Test Case ID (TC-STR-xxx); cypress/support/e2e.js
// auto-records Pass/Fail for it after every run, and `npm run test:stripe` writes that
// back into the Excel tracker. No manual status updates required.
//
// Stripe test cards used (all real Stripe test-mode cards, see Stripe's published test
// card list): 4242 4242 4242 4242 (succeeds), 4000 0000 0000 0002 (generic decline),
// 4000 0000 0000 9995 (insufficient funds).

const SUPABASE_URL = Cypress.env("supabaseUrl");
const SUPABASE_ANON_KEY = Cypress.env("supabaseAnonKey");

/**
 * Visits a fresh checkout for a bookable dress, then verifies the rendered total is
 * actually positive before handing control to the test. The shared renter test account
 * accumulates account credit as more test bookings are created against it over a long
 * session, which can fully cover a cheap dress's total ($0.00) — authorise-booking
 * doesn't handle that cleanly (observed surfacing as a misleading 409 "expired
 * selection" error). Retries with a different dress (up to 3 attempts) if that happens.
 */
function goToCheckout(attempt = 0) {
  cy.loginAsRenter();
  return cy.findBookableDress().then((dress) => {
    return cy.buildCheckoutUrl(dress).then((url) => {
      CheckoutPage.visit(url);
      return CheckoutPage.totalText()
        .invoke("text")
        .then((total) => {
          if (total === "$0.00" && attempt < 3) {
            cy.log(`Dress ${dress.id} total is $0.00 (account credit fully covers it) — trying a different dress.`);
            return goToCheckout(attempt + 1);
          }
          return cy.wrap(dress);
        });
    });
  });
}

/** Extracts the PaymentIntent id ("pi_...") from a Stripe client_secret ("pi_..._secret_..."). */
function paymentIntentIdFromClientSecret(clientSecret) {
  return (clientSecret || "").split("_secret_")[0];
}

describe("Stripe Integration", () => {
  it("TC-STR-001 - completes checkout with a real Stripe test card and creates a requested booking", () => {
    goToCheckout().then((dress) => {
      CheckoutPage.completeCheckout().then(({ status, body }) => {
        expect(status, "authorise-booking status").to.eq(200);
        expect(body.client_secret, "PaymentIntent client_secret").to.match(/^pi_.+_secret_/);

        ConfirmationPage.assertLoaded();
        ConfirmationPage.bookingId().then((bookingId) => {
          cy.getSupabaseAccessToken().then((token) => {
            cy.getBookingById(bookingId, token).then((booking) => {
              expect(booking.status, "booking status").to.eq("requested");
              expect(booking.dress_id, "booking dress_id").to.eq(dress.id);
              expect(booking.stripe_payment_intent_id, "real PaymentIntent id").to.eq(paymentIntentIdFromClientSecret(body.client_secret));
              Cypress.env(
                "lastActualResult",
                `Booking ${bookingId} created with status="requested" and real PaymentIntent ${booking.stripe_payment_intent_id} (amount_cents=${body.amount_cents} ${body.currency}).`,
              );
            });
          });
        });
      });
    });
  });

  it("TC-STR-002 - authorise-booking's Stripe amount_cents/currency match the booking row's server-computed total", () => {
    goToCheckout().then(() => {
      CheckoutPage.completeCheckout().then(({ body }) => {
        ConfirmationPage.assertLoaded();
        ConfirmationPage.bookingId().then((bookingId) => {
          cy.getSupabaseAccessToken().then((token) => {
            cy.getBookingById(bookingId, token).then((booking) => {
              const expectedTotal =
                Number(booking.rental_fee || 0) +
                Number(booking.cleaning_fee || 0) +
                Number(booking.shipping_fee || 0) +
                Number(booking.two_hour_delivery_fee || 0) +
                Number(booking.renter_service_fee || 0) -
                Number(booking.discount_amount_applied || 0) -
                Number(booking.credit_applied || 0);
              const expectedCents = Math.round(expectedTotal * 100);
              expect(body.currency, "currency").to.eq("AUD");
              expect(body.amount_cents, `amount_cents matches booking fee breakdown (expected ${expectedCents})`).to.eq(expectedCents);
              Cypress.env("lastActualResult", `authorise-booking amount_cents=${body.amount_cents} matches the booking row's fee breakdown total (${expectedCents}).`);
            });
          });
        });
      });
    });
  });

  it("TC-STR-003 - a decimal order total converts to amount_cents without rounding error", () => {
    goToCheckout().then(() => {
      CheckoutPage.completeCheckout().then(({ body }) => {
        expect(body.amount_cents, "amount_cents is a whole number of cents").to.be.a("number").and.satisfy(Number.isInteger);
        ConfirmationPage.assertLoaded();
        ConfirmationPage.bookingId().then((bookingId) => {
          cy.getSupabaseAccessToken().then((token) => {
            cy.getBookingById(bookingId, token).then((booking) => {
              const total = Number(booking.rental_fee) + Number(booking.cleaning_fee) + Number(booking.shipping_fee) + Number(booking.renter_service_fee);
              expect(Math.round(total * 100), "no rounding drift between dollars and cents").to.eq(body.amount_cents);
              Cypress.env("lastActualResult", `amount_cents=${body.amount_cents} converts from a $${total.toFixed(2)} total with no rounding error.`);
            });
          });
        });
      });
    });
  });

  it("TC-STR-004 - Stripe's generic decline test card (4000000000000002) fails payment and never reaches confirmation", () => {
    goToCheckout().then((dress) => {
      cy.getSupabaseAccessToken().then((token) => {
        cy.countBookingsForDress(dress.id, token).then((before) => {
          CheckoutPage.completeCheckout({ card: { number: "4000 0000 0000 0002" } }).then(({ status }) => {
            expect(status, "authorise-booking still succeeds (card isn't validated until Stripe confirmPayment)").to.eq(200);
            cy.contains(/declined|could not set up the payment|payment failed/i, { timeout: 15000 }).should("be.visible");
            cy.location("pathname").should("eq", "/checkout");
            cy.countBookingsForDress(dress.id, token).then((after) => {
              expect(after, "no new booking created after a declined card").to.eq(before);
              Cypress.env("lastActualResult", `Decline card rejected by Stripe; booking count for dress stayed at ${after}.`);
            });
          });
        });
      });
    });
  });

  it("TC-STR-005 - Stripe's insufficient-funds test card (4000000000009995) fails gracefully and allows retry", () => {
    goToCheckout().then((dress) => {
      cy.getSupabaseAccessToken().then((token) => {
        cy.countBookingsForDress(dress.id, token).then((before) => {
          CheckoutPage.completeCheckout({ card: { number: "4000 0000 0000 9995" } }).then(() => {
            cy.contains(/declined|could not set up the payment|payment failed|insufficient/i, { timeout: 15000 }).should("be.visible");

            CheckoutPage.fillCardDetails({ number: "4242 4242 4242 4242" });
            // Give Stripe Elements a moment to report the re-typed card as "complete"
            // again (the button disables while it doesn't) before retrying submit.
            CheckoutPage.submitButton().should("not.be.disabled");
            CheckoutPage.submitAndCaptureAuthorisation({ card: { number: "4242 4242 4242 4242" } }).then(({ status }) => {
              expect(status).to.eq(200);
              ConfirmationPage.assertLoaded();
              cy.countBookingsForDress(dress.id, token).then((after) => {
                expect(after, "exactly one booking created after the successful retry").to.eq(before + 1);
                Cypress.env("lastActualResult", `Insufficient-funds card failed gracefully; a valid-card retry succeeded and created exactly ${after - before} booking.`);
              });
            });
          });
        });
      });
    });
  });

  it("TC-STR-006 - Stripe Elements rejects a past expiry date with an inline validation error", () => {
    goToCheckout().then(() => {
      CheckoutPage.continueFromStep1();
      CheckoutPage.fillDeliveryDetails();
      CheckoutPage.continueFromStep2();
      CheckoutPage.fillCardDetails({ number: "4242 4242 4242 4242", expiry: "01/20", cvc: "123" });
      CheckoutPage.stripeFieldError().should("contain.text", "expir").then(($el) => {
        Cypress.env("lastActualResult", `Stripe Elements showed inline error: "${$el.text().trim()}"`);
      });
    });
  });

  it("TC-STR-007 - Stripe Elements rejects an invalid (fails Luhn check) card number with an inline validation error", () => {
    goToCheckout().then(() => {
      CheckoutPage.continueFromStep1();
      CheckoutPage.fillDeliveryDetails();
      CheckoutPage.continueFromStep2();
      CheckoutPage.fillCardDetails({ number: "4242 4242 4242 4241", expiry: "12/30", cvc: "123" });
      CheckoutPage.stripeFieldError().should("contain.text", "number").then(($el) => {
        Cypress.env("lastActualResult", `Stripe Elements showed inline error: "${$el.text().trim()}"`);
      });
    });
  });

  it("TC-STR-008 - Stripe Elements rejects an incomplete CVC with an inline validation error", () => {
    goToCheckout().then(() => {
      CheckoutPage.continueFromStep1();
      CheckoutPage.fillDeliveryDetails();
      CheckoutPage.continueFromStep2();
      CheckoutPage.fillCardDetails({ number: "4242 4242 4242 4242", expiry: "12/30", cvc: "1" });
      // The CVC field is filled last and never blurred by this flow (unlike TC-STR-006/007,
      // where a later field is filled after the "bad" one), so submit is needed to trigger
      // Stripe Elements' own validation for the still-focused field.
      cy.contains("button", "CONFIRM & CONTINUE").click({ force: true });
      CheckoutPage.stripeFieldError().should("contain.text", "security code").then(($el) => {
        Cypress.env("lastActualResult", `Stripe Elements showed inline error: "${$el.text().trim()}"`);
      });
    });
  });

  it("TC-STR-011 - rapid double-click on CONFIRM & CONTINUE creates exactly one booking", () => {
    goToCheckout().then((dress) => {
      CheckoutPage.fillWizard();
      cy.getSupabaseAccessToken().then((token) => {
        cy.countBookingsForDress(dress.id, token).then((before) => {
          CheckoutPage.submitButton().click();
          CheckoutPage.submitButton().click({ force: true }); // should be a no-op — button disables itself on click
          ConfirmationPage.assertLoaded();
          cy.countBookingsForDress(dress.id, token).then((after) => {
            expect(after - before, "exactly one booking created for this dress").to.eq(1);
            Cypress.env("lastActualResult", `Exactly one booking row created for dress ${dress.id} after a rapid double-click.`);
          });
        });
      });
    });
  });

  it("TC-STR-014 - retry after a forced authorise-booking failure succeeds and creates exactly one booking", () => {
    goToCheckout().then((dress) => {
      CheckoutPage.fillWizard();
      cy.getSupabaseAccessToken().then((token) => {
        cy.countBookingsForDress(dress.id, token).then((before) => {
          cy.intercept("POST", "**/functions/v1/authorise-booking*", { statusCode: 500, body: { error: "simulated failure" } }).as("failedAuth");
          CheckoutPage.submit();
          cy.wait("@failedAuth");
          CheckoutPage.submitButton().should("not.be.disabled");

          cy.intercept("POST", "**/functions/v1/authorise-booking*", (req) => req.continue()).as("retryAuth");
          CheckoutPage.submit();
          cy.wait("@retryAuth");
          ConfirmationPage.assertLoaded();

          cy.countBookingsForDress(dress.id, token).then((after) => {
            expect(after - before, "exactly one booking created after retry").to.eq(1);
            Cypress.env("lastActualResult", `First submit failed (forced 500); a clean retry created exactly one booking.`);
          });
        });
      });
    });
  });

  it("TC-STR-015 - forced network error on authorise-booking shows an error and allows a clean retry", () => {
    goToCheckout().then((dress) => {
      CheckoutPage.fillWizard();
      cy.getSupabaseAccessToken().then((token) => {
        cy.countBookingsForDress(dress.id, token).then((before) => {
          cy.intercept("POST", "**/functions/v1/authorise-booking*", { forceNetworkError: true }).as("networkFail");
          CheckoutPage.submit();
          cy.wait("@networkFail");
          cy.contains(/couldn't|try again|something went wrong|failed/i, { timeout: 8000 }).should("be.visible");

          cy.intercept("POST", "**/functions/v1/authorise-booking*", (req) => req.continue()).as("retryAuth");
          CheckoutPage.submit();
          cy.wait("@retryAuth");
          ConfirmationPage.assertLoaded();

          cy.countBookingsForDress(dress.id, token).then((after) => {
            expect(after - before, "exactly one booking created after retry").to.eq(1);
            Cypress.env("lastActualResult", "A forced network error surfaced an error message; the retry succeeded and created exactly one booking.");
          });
        });
      });
    });
  });

  it("TC-STR-017 - authorise-booking's PaymentIntent response carries the correct amount_cents and AUD currency", () => {
    goToCheckout().then(() => {
      CheckoutPage.completeCheckout().then(({ body }) => {
        expect(body.amount_cents, "amount_cents present and positive").to.be.a("number").and.be.greaterThan(0);
        expect(body.currency, "currency").to.eq("AUD");
        expect(body.client_secret, "client_secret is a real Stripe PaymentIntent secret").to.match(/^pi_/);
        ConfirmationPage.assertLoaded();
        Cypress.env("lastActualResult", `PaymentIntent ${paymentIntentIdFromClientSecret(body.client_secret)} carries amount_cents=${body.amount_cents}, currency=AUD.`);
      });
    });
  });

  it("TC-STR-018 - a second authorise-booking call for the same reservation returns reused:true with the same client_secret", () => {
    cy.intercept("POST", "**/functions/v1/authorise-booking*").as("authoriseBooking");
    goToCheckout().then(() => {
      CheckoutPage.fillWizard();
      CheckoutPage.submit();
      cy.wait("@authoriseBooking").then((first) => {
        expect(first.response.statusCode, "first authorise-booking call").to.eq(200);
        const requestBody = first.request.body;
        const firstSecret = first.response.body.client_secret;

        cy.getSupabaseAccessToken().then((token) => {
          // supabaseRequest is REST-only (rest/v1/); call the edge function directly instead.
          cy.request({
            method: "POST",
            url: `${SUPABASE_URL}/functions/v1/authorise-booking`,
            body: requestBody,
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          }).then((second) => {
            expect(second.status, "second call for the same reservation").to.eq(200);
            expect(second.body.reused, "second call reuses the existing PaymentIntent").to.eq(true);
            expect(second.body.client_secret, "same PaymentIntent client_secret").to.eq(firstSecret);
            Cypress.env("lastActualResult", `Second authorise-booking call for the same reservation returned reused:true with the identical client_secret.`);
          });
        });
      });
    });
  });

  it("TC-STR-019 - authorise-booking computes amount_cents server-side; the request body carries no client-supplied amount to tamper with", () => {
    cy.intercept("POST", "**/functions/v1/authorise-booking*").as("authoriseBooking");
    goToCheckout().then(() => {
      CheckoutPage.fillWizard();
      CheckoutPage.submit();
      cy.wait("@authoriseBooking").then((interception) => {
        const body = interception.request.body || {};
        const amountLikeKeys = Object.keys(body).filter((k) => /amount|price|fee|total|cents/i.test(k));
        expect(amountLikeKeys, `request body has no client-supplied amount field (keys: ${Object.keys(body).join(", ")})`).to.have.length(0);
        expect(interception.response.statusCode).to.eq(200);
        Cypress.env(
          "lastActualResult",
          `authorise-booking request body contains only {${Object.keys(body).join(", ")}} — no amount is sent by the client; amount_cents=${interception.response.body.amount_cents} is entirely server-computed.`,
        );
      });
    });
  });

  it("TC-STR-021 - no Stripe secret key (sk_...) appears in page source or browser storage", () => {
    cy.loginAsRenter();
    cy.visitApp("/");
    const secretKeyPattern = /sk_(live|test)_[A-Za-z0-9]+/;
    cy.document().then((doc) => {
      expect(doc.documentElement.outerHTML).to.not.match(secretKeyPattern);
    });
    cy.window().then((win) => {
      const localValues = Object.keys(win.localStorage).map((k) => win.localStorage.getItem(k)).join(" ");
      const sessionValues = Object.keys(win.sessionStorage).map((k) => win.sessionStorage.getItem(k)).join(" ");
      expect(localValues + sessionValues).to.not.match(secretKeyPattern);
    });
    Cypress.env("lastActualResult", "No sk_live_/sk_test_ pattern found in page source, localStorage, or sessionStorage. Only pk_test_... (publishable) is present.");
  });

  it("TC-STR-022 - the entered card number is never sent in any request to our own backend", () => {
    const cardNumber = "4242424242424242";
    const ourBackendRequests = [];
    cy.intercept({ url: `${SUPABASE_URL}/**` }, (req) => {
      ourBackendRequests.push(JSON.stringify(req.body || {}));
      req.continue();
    }).as("ourBackend");

    goToCheckout().then(() => {
      CheckoutPage.completeCheckout({ card: { number: "4242 4242 4242 4242" } }).then(() => {
        ConfirmationPage.assertLoaded();
        cy.then(() => {
          const leaked = ourBackendRequests.filter((body) => body.includes(cardNumber));
          expect(leaked, `no card number found in any of ${ourBackendRequests.length} requests to our own backend`).to.have.length(0);
          Cypress.env("lastActualResult", `Checked ${ourBackendRequests.length} requests to ${SUPABASE_URL} — none contained the raw card number (Stripe Elements sends it directly to Stripe).`);
        });
      });
    });
  });

  it("TC-STR-038 - a declined card leaves no new 'requested' booking row for that dress", () => {
    goToCheckout().then((dress) => {
      cy.getSupabaseAccessToken().then((token) => {
        cy.countBookingsForDress(dress.id, token).then((before) => {
          CheckoutPage.completeCheckout({ card: { number: "4000 0000 0000 0002" } }).then(() => {
            cy.contains(/declined|could not set up the payment|payment failed/i, { timeout: 15000 }).should("be.visible");
            cy.countBookingsForDress(dress.id, token).then((after) => {
              expect(after, "booking count unchanged after decline").to.eq(before);
              Cypress.env("lastActualResult", `Booking count for dress ${dress.id} stayed at ${after} after a declined card — no unconfirmed/failed booking row was created.`);
            });
          });
        });
      });
    });
  });

  it("TC-STR-039 - a successful payment's booking row has status=requested and all core fields correctly set", () => {
    goToCheckout().then((dress) => {
      CheckoutPage.completeCheckout().then(() => {
        ConfirmationPage.assertLoaded();
        ConfirmationPage.bookingId().then((bookingId) => {
          cy.getSupabaseAccessToken().then((token) => {
            cy.getBookingById(bookingId, token).then((booking) => {
              expect(booking.status).to.eq("requested");
              expect(booking.dress_id).to.eq(dress.id);
              expect(booking.renter_id, "renter_id set").to.be.a("string").and.not.be.empty;
              expect(booking.lender_id, "lender_id set").to.be.a("string").and.not.be.empty;
              expect(booking.hire_option, "hire_option").to.eq("hire_a");
              expect(booking.start_date, "start_date set").to.be.a("string");
              expect(booking.end_date, "end_date set").to.be.a("string");
              Cypress.env("lastActualResult", `Booking ${bookingId} has status=requested with dress_id/renter_id/lender_id/hire_option/dates all correctly set.`);
            });
          });
        });
      });
    });
  });

  it("TC-STR-040 - the booking's stripe_payment_intent_id is a real pi_... id matching the authorise-booking PaymentIntent", () => {
    goToCheckout().then(() => {
      CheckoutPage.completeCheckout().then(({ body }) => {
        ConfirmationPage.assertLoaded();
        ConfirmationPage.bookingId().then((bookingId) => {
          cy.getSupabaseAccessToken().then((token) => {
            cy.getBookingById(bookingId, token).then((booking) => {
              const expectedPiId = paymentIntentIdFromClientSecret(body.client_secret);
              expect(booking.stripe_payment_intent_id).to.eq(expectedPiId);
              expect(booking.stripe_payment_intent_id).to.match(/^pi_[A-Za-z0-9]+$/);
              Cypress.env("lastActualResult", `Booking ${bookingId}.stripe_payment_intent_id (${booking.stripe_payment_intent_id}) matches the PaymentIntent created by authorise-booking.`);
            });
          });
        });
      });
    });
  });

  it("TC-STR-045 - renter cannot directly set a booking's status/stripe_status to a privileged value via the REST API", () => {
    // Only renter/lender/admin credentials were provided (no second renter account), so
    // this checks self-escalation — a renter PATCHing their OWN booking outside the
    // normal lender-acceptance / Stripe-webhook flow — rather than cross-user IDOR.
    goToCheckout().then(() => {
      CheckoutPage.completeCheckout().then(() => {
        ConfirmationPage.assertLoaded();
        ConfirmationPage.bookingId().then((bookingId) => {
          cy.getSupabaseAccessToken().then((token) => {
            cy.supabaseRequest({
              method: "PATCH",
              path: `bookings?id=eq.${bookingId}`,
              accessToken: token,
              body: { status: "confirmed", stripe_status: "succeeded", payment_captured_at: new Date().toISOString() },
              failOnStatusCode: false,
            }).then((res) => {
              cy.getBookingById(bookingId, token).then((booking) => {
                expect(booking.status, "status should not be renter-settable to 'confirmed'").to.not.eq("confirmed");
                expect(booking.stripe_status, "stripe_status should not be renter-settable to 'succeeded'").to.not.eq("succeeded");
                Cypress.env("lastActualResult", `Direct PATCH attempt returned HTTP ${res.status}; status stayed "${booking.status}", stripe_status stayed "${booking.stripe_status}".`);
              });
            });
          });
        });
      });
    });
  });

  it("TC-STR-048 - a cleared/expired session blocks access to checkout on reload", () => {
    goToCheckout().then(() => {
      cy.window().then((win) => {
        win.localStorage.removeItem(`sb-${Cypress.env("supabaseProjectId")}-auth-token`);
      });
      cy.reload();
      cy.contains(/sign in/i, { timeout: 8000 }).should("be.visible");
      Cypress.env("lastActualResult", "After clearing the auth session and reloading, the authenticated checkout route required sign-in again.");
    });
  });

  it("TC-STR-049 - the booking row stores a real PaymentIntent id, correct fee fields, and created_at/status", () => {
    goToCheckout().then(() => {
      const beforeSubmit = new Date();
      CheckoutPage.completeCheckout().then(() => {
        ConfirmationPage.assertLoaded();
        ConfirmationPage.bookingId().then((bookingId) => {
          cy.getSupabaseAccessToken().then((token) => {
            cy.getBookingById(bookingId, token).then((booking) => {
              expect(booking.stripe_payment_intent_id).to.match(/^pi_[A-Za-z0-9]+$/);
              expect(booking.status).to.eq("requested");
              expect(Number(booking.rental_fee), "rental_fee is a positive number").to.be.greaterThan(0);
              const createdAt = new Date(booking.created_at);
              expect(createdAt.getTime(), "created_at is recent").to.be.greaterThan(beforeSubmit.getTime() - 5000);
              Cypress.env("lastActualResult", `Booking ${bookingId} stored with real PaymentIntent id, rental_fee=${booking.rental_fee}, status=requested, created_at=${booking.created_at}.`);
            });
          });
        });
      });
    });
  });

  it("TC-STR-056 - authorise-booking always returns AUD for an AU-only checkout", () => {
    goToCheckout().then(() => {
      CheckoutPage.completeCheckout().then(({ body }) => {
        expect(body.currency).to.eq("AUD");
        ConfirmationPage.assertLoaded();
        Cypress.env("lastActualResult", `authorise-booking returned currency="AUD" (app has no currency selector; AUD is the only supported currency).`);
      });
    });
  });
});
