// Thin accessor around the Excel -> Cypress traceability manifest
// (cypress/fixtures/stripe-test-cases.json). Keeps "how do I look up a test case"
// logic in one place for both Node scripts (excelUpdater.js) and any future Cypress
// spec that wants to read its own manifest entry (e.g. to log the Expected Result).
const manifests = {
  stripe: require("../fixtures/stripe-test-cases.json"),
  credit: require("../fixtures/credit-test-cases.json"),
};

function getManifest(suite) {
  const manifest = manifests[suite];
  if (!manifest) throw new Error(`No traceability manifest registered for suite "${suite}"`);
  return manifest;
}

function getTestCase(suite, testCaseId) {
  return getManifest(suite).testCases.find((tc) => tc.testCaseId === testCaseId);
}

function getTestCaseIdsByStatus(suite, automationStatus) {
  return getManifest(suite)
    .testCases.filter((tc) => (tc.automation || {}).status === automationStatus)
    .map((tc) => tc.testCaseId);
}

module.exports = { getManifest, getTestCase, getTestCaseIdsByStatus };
