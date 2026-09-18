#!/usr/bin/env node
// Post-run utility: reads a suite's automated-result JSONL log + its traceability
// manifest, and writes ONLY Actual Result / Status / Comments / Date Tested back into
// the matching sheet of the source .xlsx — never touching Test Scenario ID/Description,
// Test Case ID/Description, Precondition, Test data, or Expected Result, and never
// touching any other sheet in the workbook.
//
// Run directly with `npm run test:status`, or automatically after `npm run test:<suite>`
// via scripts/run-and-update.js.
const path = require("path");
const ExcelJS = require("exceljs");
const { readLatestResultsBySuite } = require("./testResultWriter");
const { getManifest } = require("./testCaseMapper");

const WORKBOOK_PATH = path.join(__dirname, "..", "..", "Designerex_Test_Cases_By_Feature.xlsx");

const SUITES = {
  stripe: { sheetName: "Stripe Integration Test suite", docsPath: "docs/features/stripe.md" },
  credit: { sheetName: "Credit at Checkout", docsPath: "docs/features/credit-checkout.md" },
};

const COLUMNS = ["Actual Result", "Status", "Comments", "Date Tested"];
const AUTOMATION_MARKER = " | Automation:";

function stripAutomationNote(comment) {
  if (!comment) return "";
  const idx = comment.indexOf(AUTOMATION_MARKER);
  return idx === -1 ? comment : comment.slice(0, idx);
}

function findHeaderRow(sheet) {
  for (let r = 1; r <= 30; r++) {
    const row = sheet.getRow(r);
    const values = row.values.map((v) => (v == null ? "" : String(v).trim()));
    if (values.includes("Test Case ID")) return r;
  }
  throw new Error(`Could not locate the header row (looking for "Test Case ID") in sheet "${sheet.name}"`);
}

function columnIndexMap(sheet, headerRowNum) {
  const row = sheet.getRow(headerRowNum);
  const map = {};
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    map[String(cell.value).trim()] = colNumber;
  });
  return map;
}

async function updateSuite(suiteKey) {
  const suiteConfig = SUITES[suiteKey];
  if (!suiteConfig) throw new Error(`Unknown suite "${suiteKey}". Known suites: ${Object.keys(SUITES).join(", ")}`);

  const manifest = getManifest(suiteKey);
  const results = readLatestResultsBySuite(suiteKey);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(WORKBOOK_PATH);
  const sheet = workbook.getWorksheet(suiteConfig.sheetName);
  if (!sheet) throw new Error(`Sheet "${suiteConfig.sheetName}" not found in ${WORKBOOK_PATH}`);

  const headerRowNum = findHeaderRow(sheet);
  const colIndex = columnIndexMap(sheet, headerRowNum);
  for (const col of COLUMNS) {
    if (!colIndex[col]) throw new Error(`Expected column "${col}" not found in the "${suiteConfig.sheetName}" header row`);
  }
  const testCaseIdCol = colIndex["Test Case ID"];

  // Row lookup by Test Case ID (source of truth for which physical row to update).
  const rowByTestCaseId = {};
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNum) return;
    const id = row.getCell(testCaseIdCol).value;
    if (id) rowByTestCaseId[String(id).trim()] = row;
  });

  const summary = { Pass: 0, Fail: 0, Blocked: 0, "Not Run": 0, missingRow: 0 };

  for (const testCase of manifest.testCases) {
    const row = rowByTestCaseId[testCase.testCaseId];
    if (!row) {
      summary.missingRow += 1;
      console.warn(`[excelUpdater] Warning: no row found for ${testCase.testCaseId} — skipped.`);
      continue;
    }

    const existingComment = stripAutomationNote(row.getCell(colIndex["Comments"]).value);
    const automation = testCase.automation || {};
    let status;
    let actualResult;
    let note;

    if (automation.status === "automated") {
      const result = results[testCase.testCaseId];
      if (result) {
        status = result.status; // "Pass" | "Fail" | "Not Run" — sourced from real Mocha test state, never invented.
        actualResult = result.actualResult;
        note = `Automated (${result.spec || `cypress/e2e/${suiteKey}`}), last run ${result.executedAt}.`;
        row.getCell(colIndex["Date Tested"]).value = result.executedAt ? result.executedAt.slice(0, 10) : "";
      } else {
        status = "Not Run";
        actualResult = "";
        note = `Automated test case — awaiting first execution of \`npm run test:${suiteKey}\`.`;
      }
    } else if (automation.status === "planned") {
      status = "Not Run";
      actualResult = "";
      note = `Automatable but not yet implemented (backlog): ${automation.reason || ""}`;
    } else {
      status = "Blocked";
      actualResult = "";
      note = automation.reason || `Blocked — see ${suiteConfig.docsPath}.`;
    }

    row.getCell(colIndex["Status"]).value = status;
    row.getCell(colIndex["Actual Result"]).value = actualResult;
    row.getCell(colIndex["Comments"]).value = existingComment ? `${existingComment}${AUTOMATION_MARKER} ${note}` : `Automation: ${note}`;

    summary[status] = (summary[status] || 0) + 1;
  }

  await workbook.xlsx.writeFile(WORKBOOK_PATH);

  console.log(`[excelUpdater] "${suiteConfig.sheetName}" updated:`);
  console.table(summary);
  return summary;
}

const updateStripeSuite = () => updateSuite("stripe");
const updateCreditSuite = () => updateSuite("credit");

if (require.main === module) {
  const suiteKey = process.argv[2] || "stripe";
  updateSuite(suiteKey)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[excelUpdater] Failed:", err);
      process.exit(1);
    });
}

module.exports = { updateSuite, updateStripeSuite, updateCreditSuite, SUITES };
