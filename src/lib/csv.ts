import { listEmployees } from "../db/employees.js";
import { listPayrollRuns } from "../db/payroll-runs.js";
import { listBonuses } from "../db/bonuses.js";
import { getEmployeePTOBalance, listPTORequests } from "../db/pto.js";

function toCSV(headers: string[], rows: Record<string, unknown>[]): string {
  const headerLine = headers.join(",");
  const dataLines = rows.map(row =>
    headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = String(val);
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}

export function exportEmployeesCSV(): string {
  const employees = listEmployees();
  const headers = ["id", "first_name", "last_name", "email", "department", "position", "status", "base_salary", "currency"];
  return toCSV(headers, employees);
}

export function exportPayrollRunsCSV(startDate?: string, endDate?: string): string {
  const runs = listPayrollRuns({ period_start: startDate, period_end: endDate });
  const headers = ["id", "period_start", "period_end", "status", "total_gross", "total_deductions", "total_net", "total_employees"];
  return toCSV(headers, runs);
}

export function exportEmployeeReportCSV(employeeId: string): string {
  const employees = listEmployees({ id: employeeId });
  if (employees.length === 0) return "";

  const emp = employees[0];
  const bonuses = listBonuses({ employee_id: employeeId });
  const pto = getEmployeePTOBalance(employeeId);
  const ptoRequests = listPTORequests({ employee_id: employeeId });

  const rows = [
    { type: "employee", ...emp },
    ...bonuses.map(b => ({ type: "bonus", ...b })),
    ...pto.map(p => ({ type: "pto_balance", ...p })),
    ...ptoRequests.map(p => ({ type: "pto_request", ...p })),
  ];

  return toCSV(["type", "id", "first_name", "last_name", "department", "position", "base_salary", "bonus_type", "amount", "pto_type", "total_days", "used_days", "status", "period_start", "period_end"], rows);
}

export function parseEmployeesCSV(csv: string): Record<string, string>[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim());
  const employees: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      let val = values[idx]?.trim() || "";
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/""/g, '"');
      }
      row[h] = val;
    });
    employees.push(row);
  }

  return employees;
}