#!/usr/bin/env node
// Runs a Cypress suite and ALWAYS updates the Excel status afterwards — including when
// Cypress itself reports failures — then exits with Cypress's own exit code, so CI still
// sees a failing suite as a failure. This is what `npm run test:stripe` wires together.
//
// The "credit" suite is a special case: its qa-credit-* accounts hold FIXED,
// non-replenished balances (see docs/features/credit-checkout.md) — running it again
// blindly will fail cases that already correctly spent their balance the first time, for
// a reason that has nothing to do with the app. `npm run test:credit` refuses to run
// unless you explicitly acknowledge that with `--i-know-this-spends-real-credit`.
const { spawnSync } = require("child_process");
const path = require("path");

const SUITE = process.argv[2] || "stripe";
const SPEC_GLOBS = {
  stripe: "cypress/e2e/stripe/**/*.cy.js",
  credit: "cypress/e2e/credit/**/*.cy.js",
};
const NOT_FREELY_RERUNNABLE = new Set(["credit"]);
const CONFIRM_FLAG = "--i-know-this-spends-real-credit";

const spec = SPEC_GLOBS[SUITE];
if (!spec) {
  console.error(`[run-and-update] Unknown suite "${SUITE}". Known suites: ${Object.keys(SPEC_GLOBS).join(", ")}`);
  process.exit(1);
}

if (NOT_FREELY_RERUNNABLE.has(SUITE) && !process.argv.includes(CONFIRM_FLAG)) {
  console.error(
    `[run-and-update] Refusing to run suite "${SUITE}": its test accounts hold fixed, non-replenished\n` +
      `balances (see docs/features/${SUITE}-checkout.md). Re-running will spend real balances again and\n` +
      `most cases will then fail for a reason unrelated to the app. Check each account's actual current\n` +
      `balance first, then re-run with ${CONFIRM_FLAG} once you're sure.`,
  );
  process.exit(1);
}

// Cypress's own retries.runMode:1 (cypress.config.js) is good resilience for the Stripe
// suite's known transient DEV flakiness (see docs/features/stripe.md) — but for a
// balance-spending suite, a "helpful" automatic retry would spend a balance a second
// time on a genuine failure. Force retries off there specifically.
const cypressArgs = ["cypress", "run", "--spec", spec];
if (NOT_FREELY_RERUNNABLE.has(SUITE)) cypressArgs.push("--config", '{"retries":{"runMode":0,"openMode":0}}');

console.log(`[run-and-update] Running Cypress for suite "${SUITE}" (${spec})...`);
const cypressResult = spawnSync("npx", cypressArgs, {
  stdio: "inherit",
  cwd: path.join(__dirname, ".."),
  shell: false,
});

console.log(`[run-and-update] Cypress exited with code ${cypressResult.status}. Updating Excel tracker...`);
const { updateSuite } = require("../cypress/utils/excelUpdater");

updateSuite(SUITE)
  .catch((err) => {
    console.error("[run-and-update] Excel update failed:", err);
  })
  .finally(() => {
    process.exit(cypressResult.status == null ? 1 : cypressResult.status);
  });
