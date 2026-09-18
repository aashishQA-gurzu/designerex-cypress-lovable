import "cypress-mochawesome-reporter/register";
import "./commands";

// --- Automatic Test Case ID -> result recording -------------------------------------
// Every `it()` title that contains a Test Case ID (e.g. "TC-STR-001 - ..." or
// "CR-TC-030 - ...") is automatically mapped to a Pass/Fail result from Mocha's own
// test state, with zero per-test bookkeeping required in the spec. This is what lets
// `npm run test:<suite>` update the Excel tracker without anyone manually flipping
// Status after a run. Add a new {regex, suite} entry here when a new feature's ID
// format doesn't already match one of these (check first — don't assume, a near-miss
// here silently drops results, as happened once with CR-TC-* before this fix).
const TEST_CASE_PATTERNS = [
  { regex: /TC-STR-\d+/, suite: "stripe" },
  { regex: /CR-TC-\d+/, suite: "credit" },
];

afterEach(function () {
  const test = this.currentTest;
  if (!test) return;
  const matched = TEST_CASE_PATTERNS.map((p) => ({ match: test.title.match(p.regex), suite: p.suite })).find((m) => m.match);
  if (!matched) return; // Not a traceable test-case spec (e.g. a smoke/setup test) — skip recording.

  const testCaseId = matched.match[0];
  const suiteName = matched.suite;

  // Mocha state is 'passed', 'failed', or undefined (e.g. skipped) — never invented as Pass.
  const state = test.state === "passed" ? "Pass" : test.state === "failed" ? "Fail" : "Not Run";
  const err = test.err;

  const actualResult =
    state === "Pass"
      ? Cypress.env("lastActualResult") || "Automated assertions passed against the live application."
      : state === "Fail"
        ? `Automated test failed: ${err && err.message ? err.message.split("\n")[0] : "see Cypress error"}`
        : "Test did not run to completion.";

  cy.task(
    "recordTestResult",
    {
      suite: suiteName,
      testCaseId,
      testTitle: test.title,
      status: state,
      actualResult,
      errorMessage: err && err.message ? err.message : null,
      spec: Cypress.spec && Cypress.spec.relative,
      executedAt: new Date().toISOString(),
    },
    { log: false },
  );

  // Reset for the next test so a stale message can't leak across specs.
  Cypress.env("lastActualResult", null);
});

// No global uncaught:exception handler: an unhandled app error should fail the test
// (per "avoid false positives" / "do not swallow exceptions"), not be silently caught.
