// Reusable result-tracking sink for every automated test case.
// Pattern: append one JSON line per test result to a .jsonl file from the Cypress Node
// process (via cy.task), so partial/crashed runs never lose already-recorded results.
// A separate post-run utility (excelUpdater.js) reads this file and writes the
// aggregated latest-per-testCaseId result back into the source .xlsx workbook.
const fs = require("fs");
const path = require("path");

const RESULTS_DIR = path.join(__dirname, "..", "results");

function resultsFilePath(suite) {
  return path.join(RESULTS_DIR, `${suite}-results.jsonl`);
}

function ensureDir() {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

/** Registers the `recordTestResult` Cypress task used by cypress/support/e2e.js. */
function registerExcelResultTask(on) {
  on("task", {
    recordTestResult(entry) {
      ensureDir();
      const suite = entry.suite || "stripe";
      fs.appendFileSync(resultsFilePath(suite), JSON.stringify(entry) + "\n");
      return null;
    },
  });
}

/** Reads a suite's JSONL result log and returns the LATEST entry per testCaseId. */
function readLatestResultsBySuite(suite) {
  const file = resultsFilePath(suite);
  if (!fs.existsSync(file)) return {};
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  const latest = {};
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (!entry.testCaseId) continue;
      // Later lines overwrite earlier ones — last run wins.
      latest[entry.testCaseId] = entry;
    } catch {
      // Ignore a malformed line rather than crashing the whole aggregation.
    }
  }
  return latest;
}

module.exports = { registerExcelResultTask, readLatestResultsBySuite, resultsFilePath };
