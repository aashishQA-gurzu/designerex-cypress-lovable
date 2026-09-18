const { defineConfig } = require("cypress");
const { registerExcelResultTask } = require("./cypress/utils/testResultWriter");

module.exports = defineConfig({
  projectId: undefined,
  video: false,
  screenshotOnRunFailure: true,
  chromeWebSecurity: false,
  defaultCommandTimeout: 10000,
  retries: { runMode: 1, openMode: 0 },

  reporter: "cypress-mochawesome-reporter",
  reporterOptions: {
    reportDir: "cypress/reports",
    overwrite: false,
    html: true,
    json: true,
    charts: true,
    embeddedScreenshots: true,
  },

  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || "https://designerex.gurzu.net",
    specPattern: "cypress/e2e/**/*.cy.js",
    supportFile: "cypress/support/e2e.js",
    setupNodeEvents(on, config) {
      require("cypress-mochawesome-reporter/plugin")(on);
      registerExcelResultTask(on);
      return config;
    },

    env: {
      // --- Environment (centralized; swap for staging by overriding these, never hardcode a domain in a Page Object) ---
      // DEV is the environment the Lovable platform is deployed to for dev/QA testing (per project brief).
      // The consumer app (designerex-unlocked.lovable.app) and admin app (dxdashboardtest.lovable.app) are
      // alternate Lovable preview URLs for the same/related builds. Override CYPRESS_baseUrl to target either.
      authName: "designerex_dev",
      authPass: "Hlp2P4Rt13Iz",

      // --- Supabase (same project the DEV deployment itself uses — anon/publishable key only,
      // safe for client-side use). NOTE: this differs from the value committed in the local
      // designerex-consumer-main/.env (lgyecdudufnmrkzikvwd) — that .env snapshot doesn't match
      // what's actually built/deployed to designerex.gurzu.net. Verified by extracting the real
      // value from the deployed JS bundle (curl the site, grep the bundle for *.supabase.co).
      // If DEV's deployment is rebuilt from a different source snapshot later, re-verify this.
      supabaseUrl: "https://owmmdxudhcjgsqniyoxw.supabase.co",
      supabaseAnonKey: "sb_publishable_eo2m7noj01tJaUUMHt3Zug_qFIU_nVM",
      supabaseProjectId: "owmmdxudhcjgsqniyoxw",

      // --- Test accounts (centralized; do not hardcode credentials in specs/pages) ---
      adminEmail: "admin@designerex.com.au",
      adminPassword: "TestAdmin123!",
      lenderEmail: "lender@designerex.com.au",
      lenderPassword: "TestLender123!",
      renterEmail: "renter@designerex.com.au",
      renterPassword: "TestRenter123!",

      // --- Credit-at-checkout test accounts (see Chabbi/2026-09-17-credit-test-pack.md) ---
      // Single shared password; each account holds a FIXED, NOT-automatically-replenished
      // credit balance ("each balance is spent by the test that uses it"). Tests that spend
      // a balance must restore it (cancel-before-lender-action) so the suite stays repeatable
      // — see docs/features/credit-checkout.md before adding a new case here.
      qaCreditPassword: "QaCredit123!",
      qaCreditNoneEmail: "qa-credit-none@designerex.com.au",
      qaCredit50Email: "qa-credit-50@designerex.com.au",
      qaCredit150Email: "qa-credit-150@designerex.com.au",
      qaCreditEdgeEmail: "qa-credit-edge@designerex.com.au",
      qaCreditExactEmail: "qa-credit-exact@designerex.com.au",
      creditDiscountCode: "QACREDIT20",
    },
  },
});
