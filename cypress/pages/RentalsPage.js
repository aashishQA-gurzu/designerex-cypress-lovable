// Page Object for /dashboard/rentals — specifically the renter-initiated cancellation
// flow used by CR-S06 ("Credit restoration after cancellation"). Confirmed live via a
// diagnostic run: a pending ("requested") booking shows a "Cancel request" button; an
// accepted one shows "Cancel booking". Clicking either opens a Radix dialog titled
// "Cancel this booking?" with a required Reason <select> (the confirm button stays
// disabled until a reason is chosen) and a destructive "Cancel booking" confirm button.
class RentalsPage {
  visit() {
    cy.visitApp("/dashboard/rentals");
    return this;
  }

  /** Finds the rental card for a given dress title and clicks its cancel button. */
  cancelBookingFor(dressTitle) {
    cy.contains("h3", dressTitle)
      .closest("article")
      .within(() => {
        cy.contains("button", /Cancel (request|booking)/).click({ force: true });
      });
    return this;
  }

  confirmDialog() {
    return cy.contains('[role="dialog"]', "Cancel this booking?");
  }

  selectReason(reasonText) {
    this.confirmDialog().find('[role="combobox"]').click();
    cy.contains('[role="option"]', reasonText).click();
    return this;
  }

  confirmCancel() {
    this.confirmDialog().contains("button", "Cancel booking").should("not.be.disabled").click();
    return this;
  }

  keepBooking() {
    this.confirmDialog().contains("button", "Keep booking").click();
    return this;
  }
}

export default new RentalsPage();
