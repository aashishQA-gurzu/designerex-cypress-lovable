// Page Object for /checkout/confirmed (src/routes/_authenticated/checkout/confirmed.tsx).
class ConfirmationPage {
  assertLoaded() {
    cy.location("pathname", { timeout: 15000 }).should("eq", "/checkout/confirmed");
    cy.contains("h2", "Booking Request Confirmed").should("be.visible");
    return this;
  }

  /** Extracts booking_id from the current URL's search params. */
  bookingId() {
    return cy.location("search").then((search) => new URLSearchParams(search).get("booking_id"));
  }
}

export default new ConfirmationPage();
