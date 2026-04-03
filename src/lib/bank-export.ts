import { getPayrollRun } from "../db/payroll-runs.js";
import { getEmployee } from "../db/employees.js";
import { getDatabase } from "../db/database.js";

export interface AchEntry {
  employee_id: string;
  routing_number: string;
  account_number: string;
  account_type: "checking" | "savings";
  amount: number;
  employee_name: string;
}

export interface AchFileResult {
  payroll_run_id: string;
  company_name: string;
  company_discretionary: string;
  company_identification: string;
  entries: AchEntry[];
  total_debit: number;
  entry_count: number;
  file_content: string;
}

/**
 * Generates a NACHA ACH file for bank transfers.
 * This is a simplified implementation following the NACHA format spec.
 */
export function generateAchFile(input: {
  payroll_run_id: string;
  company_name: string;
  company_discretionary?: string;
  company_identification: string;
  originating_dfi_identification: string;
  entries: AchEntry[];
}): AchFileResult {
  const totalDebit = input.entries.reduce((s, e) => s + Math.round(e.amount * 100), 0);
  const entryCount = input.entries.length;

  const now = new Date();
  const fileDate = `${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const fileTime = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

  const lines: string[] = [];

  // File Header Record (type 1)
  lines.push([
    "1",                                  // Record Type Code
    "01",                                 // Priority Code
    " " + input.originating_dfi_identification.padEnd(10), // Immediate Destination
    input.company_name.padEnd(16),        // Immediate Origin
    fileDate,                             // File Creation Date
    fileTime,                             // File Creation Time
    input.company_identification.padEnd(10), // Company Identification
    (input.company_discretionary || "").padEnd(20), // Company Discretionary Data
    "B",                                  // Country Code
    "   ",                                // Immediate Destination Name (blank)
    input.company_name.padEnd(23),        // Immediate Origin Name
    "094",                                // Reference Code (blank)
  ].join(""));

  // Batch Header Record (type 5)
  lines.push([
    "5",                                  // Record Type Code
    "200",                                // Service Class Code (200 = mixed debits/credits)
    input.company_name.padEnd(16),        // Company Name
    (input.company_discretionary || "").padEnd(20), // Company Discretionary Data
    input.company_identification.padEnd(10), // Company Identification
    "PPD",                                // Standard Entry Class (PPD = Prearranged Payment and Deposit)
    "PAYROLL      ",                      // Company Entry Description
    fileDate,                             // Company Descriptive Date
    fileDate,                             // Effective Entry Date
    "",                                   // Settlement Date (blank)
    "1",                                  // Originator Status Code
    input.originating_dfi_identification.padEnd(8), // Originating DFI Identification
    (entryCount + 1).toString().padStart(7, "0"), // Batch Number
  ].join(""));

  // Entry Detail Records (type 6)
  let traceNumber = 1;
  for (const entry of input.entries) {
    const amountCents = Math.round(entry.amount * 100).toString().padStart(10, "0");
    const routingWithCheck = entry.routing_number.padEnd(9, "0");
    const accountPadded = entry.account_number.padEnd(17, "0");
    const individualId = entry.employee_id.padEnd(15, " ");

    // Name field: individual name
    const namePadded = entry.employee_name.padEnd(22, " ");

    lines.push([
      "6",                    // Record Type Code
      routingWithCheck,       // Receiving DFI Identification + Check Digit
      entry.account_type === "savings" ? "2" : "3", // DFI Account Number Type
      amountCents,            // Amount (10 digits, cents)
      individualId,           // Individual ID
      namePadded,             // Individual Name
      "                      ", // Discretionary Data (12 spaces)
      "0",                    // Addenda Record Indicator
      input.originating_dfi_identification.padEnd(8), // Trace Number - ODFI Routing Number
      traceNumber.toString().padStart(7, "0"), // Trace Number - Sequence Number
    ].join(""));
    traceNumber++;
  }

  // Batch Control Record (type 8)
  lines.push([
    "8",                                  // Record Type Code
    "200",                                // Service Class Code
    (entryCount).toString().padStart(6, "0"), // Entry/Addenda Count
    totalDebit.toString().padStart(12, "0"), // Entry Hash
    input.company_discretionary?.padEnd(10) || "          ", // Entry Debit Amount (zero)
    input.company_discretionary?.padEnd(10) || "          ", // Entry Credit Amount (zero)
    input.company_identification.padEnd(10), // Company Identification
    "                         ",           // Message Authentication Code (blank)
    "                    ",                 // Reserved
    input.originating_dfi_identification.padEnd(8), // Originating DFI Identification
    (entryCount + 1).toString().padStart(7, "0"), // Batch Number
  ].join(""));

  // File Control Record (type 9)
  const batchCount = 1;
  const blockCount = Math.ceil((lines.length + 1) / 10) * 10; // Pad to multiple of 10
  lines.push([
    "9",                                  // Record Type Code
    batchCount.toString().padStart(6, "0"), // Batch Count
    blockCount.toString().padStart(6, "0"), // Block Count
    entryCount.toString().padStart(8, "0"), // Entry/Addenda Count
    totalDebit.toString().padStart(12, "0"), // Entry Hash
    "                    ",                 // Entry Debit Amount (zero)
    "                    ",                 // Entry Credit Amount (zero)
    "                    ",                 // Reserved
    "                         ",           // Reserved
  ].join(""));

  return {
    payroll_run_id: input.payroll_run_id,
    company_name: input.company_name,
    company_discretionary: input.company_discretionary || "",
    company_identification: input.company_identification,
    entries: input.entries,
    total_debit: totalDebit / 100,
    entry_count: entryCount,
    file_content: lines.join("\n") + "\n",
  };
}

export function generateAchFromPayrollRun(
  payrollRunId: string,
  companyName: string,
  companyIdentification: string,
  originatingDfiIdentification: string
): AchFileResult {
  const run = getPayrollRun(payrollRunId);
  if (!run) throw new Error("Payroll run not found");

  const db = getDatabase();

  // Get employees with bank account info for this payroll run
  const entries: AchEntry[] = [];

  // Get employees in this payroll run
  const empRows = db.query(`
    SELECT * FROM employees
    WHERE (project_id = ? OR (project_id IS NULL AND org_id = ?))
    AND status = 'active'
  `).all(run.project_id ?? null, run.org_id ?? null) as Array<{
    id: string; first_name: string; last_name: string;
    routing_number: string | null; account_number: string | null; account_type: string | null
  }>;

  // Get deductions for this run to compute net pay
  for (const emp of empRows) {
    if (!emp.routing_number || !emp.account_number) continue;

    // Compute net pay for this employee
    const components = db.query(`
      SELECT SUM(amount) as total FROM salary_components
      WHERE employee_id = ? AND (payroll_run_id = ? OR (payroll_run_id IS NULL AND recurring = 1))
    `).get(emp.id, payrollRunId) as { total: number | null };

    const bonuses = db.query(`
      SELECT SUM(amount) as total FROM bonuses WHERE employee_id = ? AND payroll_run_id = ?
    `).get(emp.id, payrollRunId) as { total: number | null };

    const deductions = db.query(`
      SELECT SUM(amount) as total FROM deductions WHERE employee_id = ? AND (payroll_run_id = ? OR payroll_run_id IS NULL)
    `).get(emp.id, payrollRunId) as { total: number | null };

    const gross = (components.total || 0) + (bonuses.total || 0);
    const dedTotal = deductions.total || 0;
    const netPay = gross - dedTotal;

    if (netPay <= 0) continue;

    entries.push({
      employee_id: emp.id,
      routing_number: emp.routing_number,
      account_number: emp.account_number,
      account_type: (emp.account_type as "checking" | "savings") || "checking",
      amount: netPay,
      employee_name: `${emp.first_name} ${emp.last_name}`,
    });
  }

  return generateAchFile({
    payroll_run_id: payrollRunId,
    company_name: companyName,
    company_identification: companyIdentification,
    originating_dfi_identification: originatingDfiIdentification,
    entries,
  });
}
