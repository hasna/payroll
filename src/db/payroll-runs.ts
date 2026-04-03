import { getDatabase, generateId } from "./database.js";
import type {
  PayrollRun,
  PayrollRunFilter,
  PayrollRunStatus,
} from "../types/index.js";
import { PayrollRunNotFoundError } from "../types/index.js";

interface PayrollRunRow {
  id: string;
  project_id: string | null;
  org_id: string | null;
  period_start: string;
  period_end: string;
  run_date: string;
  status: string;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  total_employees: number;
  processed_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

function rowToPayrollRun(row: PayrollRunRow): PayrollRun {
  return {
    ...row,
    project_id: row.project_id ?? undefined,
    org_id: row.org_id ?? undefined,
    processed_by: row.processed_by ?? undefined,
    approved_by: row.approved_by ?? undefined,
    approved_at: row.approved_at ?? undefined,
    metadata: JSON.parse(row.metadata || "{}") as Record<string, unknown>,
    status: row.status as PayrollRunStatus,
  };
}

export interface CreatePayrollRunInput {
  project_id?: string;
  org_id?: string;
  period_start: string;
  period_end: string;
  processed_by?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdatePayrollRunInput {
  status?: PayrollRunStatus;
  total_gross?: number;
  total_deductions?: number;
  total_net?: number;
  total_employees?: number;
  processed_by?: string;
  approved_by?: string;
  approved_at?: string;
  metadata?: Record<string, unknown>;
  version: number;
}

export function createPayrollRun(input: CreatePayrollRunInput, db?: Database): PayrollRun {
  const d = db || getDatabase();
  const id = generateId("pr");
  const now = new Date().toISOString();
  const metadata = input.metadata || {};

  d.run(
    `INSERT INTO payroll_runs (id, project_id, org_id, period_start, period_end, run_date, status, total_gross, total_deductions, total_net, total_employees, processed_by, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', 0, 0, 0, 0, ?, ?, ?, ?)`,
    [
      id,
      input.project_id || null,
      input.org_id || null,
      input.period_start,
      input.period_end,
      now,
      input.processed_by || null,
      JSON.stringify(metadata),
      now,
      now,
    ]
  );

  return getPayrollRun(id, d)!;
}

export function getPayrollRun(id: string, db?: Database): PayrollRun | null {
  const d = db || getDatabase();
  const row = d.query("SELECT * FROM payroll_runs WHERE id = ?").get(id) as PayrollRunRow | undefined;
  return row ? rowToPayrollRun(row) : null;
}

export function listPayrollRuns(filter: PayrollRunFilter = {}, db?: Database): PayrollRun[] {
  return listPayrollRunsWithPagination(filter, db).payrollRuns;
}

export interface PaginatedPayrollRuns {
  payrollRuns: PayrollRun[];
  total: number;
  limit: number;
  offset: number;
}

export function listPayrollRunsWithPagination(filter: PayrollRunFilter = {}, db?: Database): PaginatedPayrollRuns {
  const d = db || getDatabase();
  const limit = filter.limit || 50;
  const offset = filter.offset || 0;

  let query = "SELECT * FROM payroll_runs WHERE 1=1";
  let countQuery = "SELECT COUNT(*) as total FROM payroll_runs WHERE 1=1";
  const params: unknown[] = [];
  const countParams: unknown[] = [];

  if (filter.project_id) {
    query += " AND project_id = ?";
    countQuery += " AND project_id = ?";
    params.push(filter.project_id);
    countParams.push(filter.project_id);
  }

  if (filter.org_id) {
    query += " AND org_id = ?";
    countQuery += " AND org_id = ?";
    params.push(filter.org_id);
    countParams.push(filter.org_id);
  }

  if (filter.status) {
    query += " AND status = ?";
    countQuery += " AND status = ?";
    params.push(filter.status);
    countParams.push(filter.status);
  }

  if (filter.period_start) {
    query += " AND period_start >= ?";
    countQuery += " AND period_start >= ?";
    params.push(filter.period_start);
    countParams.push(filter.period_start);
  }

  if (filter.period_end) {
    query += " AND period_end <= ?";
    countQuery += " AND period_end <= ?";
    params.push(filter.period_end);
    countParams.push(filter.period_end);
  }

  const countResult = d.query(countQuery).get(...countParams) as { total: number };
  const total = countResult.total;

  query += " ORDER BY run_date DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const rows = d.query(query).all(...params) as PayrollRunRow[];
  return {
    payrollRuns: rows.map(rowToPayrollRun),
    total,
    limit,
    offset,
  };
}

export function updatePayrollRun(id: string, input: UpdatePayrollRunInput, db?: Database): PayrollRun {
  const d = db || getDatabase();
  const existing = d.query("SELECT version FROM payroll_runs WHERE id = ?").get(id) as { version: number } | undefined;

  if (!existing) {
    throw new PayrollRunNotFoundError(id);
  }

  if (input.version !== existing.version) {
    throw new Error(`Version conflict: expected version ${existing.version}, got ${input.version}`);
  }

  const now = new Date().toISOString();
  const metadata = input.metadata !== undefined ? input.metadata : undefined;

  const updates: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if (input.status !== undefined) {
    updates.push("status = ?");
    params.push(input.status);
  }
  if (input.total_gross !== undefined) {
    updates.push("total_gross = ?");
    params.push(input.total_gross);
  }
  if (input.total_deductions !== undefined) {
    updates.push("total_deductions = ?");
    params.push(input.total_deductions);
  }
  if (input.total_net !== undefined) {
    updates.push("total_net = ?");
    params.push(input.total_net);
  }
  if (input.total_employees !== undefined) {
    updates.push("total_employees = ?");
    params.push(input.total_employees);
  }
  if (input.processed_by !== undefined) {
    updates.push("processed_by = ?");
    params.push(input.processed_by);
  }
  if (input.approved_by !== undefined) {
    updates.push("approved_by = ?");
    params.push(input.approved_by);
  }
  if (input.approved_at !== undefined) {
    updates.push("approved_at = ?");
    params.push(input.approved_at);
  }
  if (metadata !== undefined) {
    updates.push("metadata = ?");
    params.push(JSON.stringify(metadata));
  }

  params.push(id);
  d.run(`UPDATE payroll_runs SET ${updates.join(", ")} WHERE id = ?`, params);

  return getPayrollRun(id, d)!;
}

export function deletePayrollRun(id: string, db?: Database): void {
  const d = db || getDatabase();
  d.run("DELETE FROM payroll_runs WHERE id = ?", [id]);
}

export function calculatePayrollRun(id: string, db?: Database): PayrollRun {
  const d = db || getDatabase();
  const run = getPayrollRun(id, d);

  if (!run) {
    throw new PayrollRunNotFoundError(id);
  }

  // Get all active employees for this project/org
  const employees = d.query(`
    SELECT * FROM employees
    WHERE (project_id = ? OR (project_id IS NULL AND org_id = ?))
    AND status = 'active'
  `).all(run.project_id ?? null, run.org_id ?? null) as EmployeeRow[];

  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  for (const emp of employees) {
    // Get salary components for this employee
    const components = d.query(`
      SELECT * FROM salary_components
      WHERE employee_id = ? AND (payroll_run_id = ? OR (payroll_run_id IS NULL AND recurring = 1))
    `).all(emp.id, id) as SalaryComponentRow[];

    let employeeGross = 0;
    let employeeDeductions = 0;

    for (const comp of components) {
      if (comp.taxable) {
        employeeGross += comp.amount;
      }
    }

    // Get deductions
    const deductions = d.query(`
      SELECT * FROM deductions
      WHERE employee_id = ? AND (payroll_run_id = ? OR (payroll_run_id IS NULL))
    `).all(emp.id, id) as DeductionRow[];

    for (const ded of deductions) {
      if (ded.pre_tax) {
        employeeGross -= ded.amount;
      } else {
        employeeDeductions += ded.amount;
      }
    }

    totalGross += employeeGross;
    totalDeductions += employeeDeductions;
    totalNet += employeeGross - employeeDeductions;
  }

  const now = new Date().toISOString();
  d.run(`
    UPDATE payroll_runs
    SET status = 'calculated', total_gross = ?, total_deductions = ?, total_net = ?, total_employees = ?, updated_at = ?
    WHERE id = ?
  `, [totalGross, totalDeductions, totalNet, employees.length, now, id]);

  return getPayrollRun(id, d)!;
}

// Helper types
interface EmployeeRow {
  id: string;
  project_id: string | null;
  base_salary: number | null;
  hourly_rate: number | null;
}

interface SalaryComponentRow {
  id: string;
  employee_id: string;
  payroll_run_id: string | null;
  amount: number;
  taxable: number;
  recurring: number;
}

interface DeductionRow {
  id: string;
  employee_id: string;
  payroll_run_id: string | null;
  amount: number;
  pre_tax: number;
}

import type { Database } from "bun:sqlite";
