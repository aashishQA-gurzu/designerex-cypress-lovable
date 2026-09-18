// Page Object for /login (renders <LoginForm/> — see src/components/auth/LoginForm.tsx
// in designerex-consumer-main). The app has no data-testid attributes anywhere, so this
// page is selected by autoComplete attributes and button text, which are stable
// semantic hooks tied to the form's actual purpose rather than styling.
class LoginPage {
  visit() {
    cy.visitApp("/login");
    return this;
  }

  emailInput() {
    return cy.get('input[autocomplete="email"]');
  }

  passwordInput() {
    return cy.get('input[autocomplete="current-password"]');
  }

  submitButton() {
    return cy.contains("button", "Sign in");
  }

  errorMessage() {
    // No data-testid exists for this element; `.text-destructive` is a semantic
    // error-state utility class (not an obfuscated hash), the most stable hook available.
    return cy.get("form p.text-destructive");
  }

  login(email, password) {
    this.emailInput().clear().type(email, { log: false });
    this.passwordInput().clear().type(password, { log: false });
    this.submitButton().click();
    return this;
  }
}

export default new LoginPage();
