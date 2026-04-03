import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const LOCK_EXPIRY_MINUTES = 30;

function isInMemoryDb(path: string): boolean {
  return path === ":memory:" || path.startsWith("file::memory:");
}

function findNearestPayrollDb(startDir: string): string | null {
  let dir = resolve(startDir);
  while (true) {
    const candidate = join(dir, ".payroll", "payroll.db");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function findGitRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  while (true) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function getDbPath(): string {
  // 1. Environment variable override
  if (process.env["HASNA_PAYROLL_DB_PATH"]) {
    return process.env["HASNA_PAYROLL_DB_PATH"];
  }
  if (process.env["PAYROLL_DB_PATH"]) {
    return process.env["PAYROLL_DB_PATH"];
  }

  // 2. Per-project: .payroll/payroll.db in cwd or any parent
  const cwd = process.cwd();
  const nearest = findNearestPayrollDb(cwd);
  if (nearest) return nearest;

  // 3. Default: ~/.hasna/payroll/payroll.db
  const home = process.env["HOME"] || process.env["USERPROFILE"] || "~";
  return join(home, ".hasna", "payroll", "payroll.db");
}

function ensureDir(filePath: string): void {
  if (isInMemoryDb(filePath)) return;
  const dir = dirname(resolve(filePath));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  org_id TEXT,
  employee_number TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  department TEXT,
  position TEXT,
  hire_date TEXT,
  employment_type TEXT DEFAULT 'full-time' CHECK(employment_type IN ('full-time', 'part-time', 'contractor', 'intern')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'terminated')),
  base_salary REAL,
  hourly_rate REAL,
  currency TEXT DEFAULT 'USD',
  payment_method TEXT DEFAULT 'bank_transfer' CHECK(payment_method IN ('bank_transfer', 'check', 'cash', 'crypto')),
  bank_account TEXT,
  tax_id TEXT,
  tags TEXT DEFAULT '[]',
  metadata TEXT DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  terminated_at TEXT
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  org_id TEXT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  run_date TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'calculated', 'approved', 'processing', 'completed', 'cancelled')),
  total_gross REAL DEFAULT 0,
  total_deductions REAL DEFAULT 0,
  total_net REAL DEFAULT 0,
  total_employees INTEGER DEFAULT 0,
  processed_by TEXT,
  approved_by TEXT,
  approved_at TEXT,
  metadata TEXT DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS salary_components (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  payroll_run_id TEXT REFERENCES payroll_runs(id) ON DELETE SET NULL,
  component_type TEXT NOT NULL CHECK(component_type IN ('base', 'bonus', 'overtime', 'commission', 'allowance', 'reimbursement', 'other')),
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  taxable INTEGER NOT NULL DEFAULT 1,
  recurring INTEGER NOT NULL DEFAULT 0,
  period TEXT CHECK(period IN ('hourly', 'daily', 'weekly', 'biweekly', 'monthly', 'one-time')),
  effective_from TEXT,
  effective_to TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deductions (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  payroll_run_id TEXT REFERENCES payroll_runs(id) ON DELETE SET NULL,
  deduction_type TEXT NOT NULL CHECK(deduction_type IN ('federal_tax', 'state_tax', 'social_security', 'medicare', 'health_insurance', 'dental_insurance', 'vision_insurance', '401k', 'hsa', 'fsa', 'other')),
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  pre_tax INTEGER NOT NULL DEFAULT 0,
  employer_match REAL DEFAULT 0,
  effective_from TEXT,
  effective_to TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  gross_amount REAL NOT NULL,
  deductions_amount REAL NOT NULL DEFAULT 0,
  net_amount REAL NOT NULL,
  payment_date TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending', 'processed', 'failed', 'cancelled')),
  payment_method TEXT DEFAULT 'bank_transfer',
  transaction_id TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  legal_name TEXT,
  tax_id TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'US',
  postal_code TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_employees_project ON employees(project_id);
CREATE INDEX IF NOT EXISTS idx_employees_org ON employees(org_id);
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_project ON payroll_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_org ON payroll_runs(org_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs(status);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON payroll_runs(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_salary_components_employee ON salary_components(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_components_run ON salary_components(payroll_run_id);

CREATE INDEX IF NOT EXISTS idx_deductions_employee ON deductions(employee_id);
CREATE INDEX IF NOT EXISTS idx_deductions_run ON deductions(payroll_run_id);

CREATE INDEX IF NOT EXISTS idx_payments_employee ON payments(employee_id);
CREATE INDEX IF NOT EXISTS idx_payments_run ON payments(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(payment_status);

CREATE INDEX IF NOT EXISTS idx_orgs_project ON orgs(project_id);

CREATE INDEX IF NOT EXISTS idx_bonuses_employee ON bonuses(employee_id);
CREATE INDEX IF NOT EXISTS idx_bonuses_run ON bonuses(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_bonuses_type ON bonuses(bonus_type);

CREATE INDEX IF NOT EXISTS idx_pto_balances_employee ON pto_balances(employee_id);
CREATE INDEX IF NOT EXISTS idx_pto_balances_employee_year ON pto_balances(employee_id, year);

CREATE INDEX IF NOT EXISTS idx_pto_requests_employee ON pto_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_pto_requests_status ON pto_requests(status);
CREATE INDEX IF NOT EXISTS idx_pto_requests_dates ON pto_requests(start_date, end_date);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  working_dir TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_activity TEXT NOT NULL DEFAULT (datetime('now')),
  metadata TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_lists (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, slug)
);

CREATE TABLE IF NOT EXISTS bonuses (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  payroll_run_id TEXT REFERENCES payroll_runs(id) ON DELETE SET NULL,
  bonus_type TEXT NOT NULL CHECK(bonus_type IN ('performance', 'signing', 'retention', 'commission', 'holiday', 'spot', 'other')),
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'USD',
  taxable INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  effective_date TEXT NOT NULL,
  period TEXT CHECK(period IN ('hourly', 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annual', 'one-time')),
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pto_balances (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  pto_type TEXT NOT NULL CHECK(pto_type IN ('vacation', 'sick', 'personal', 'bereavement', 'parental', 'other')),
  year INTEGER NOT NULL,
  total_days REAL NOT NULL DEFAULT 0,
  used_days REAL NOT NULL DEFAULT 0,
  accrued_days REAL NOT NULL DEFAULT 0,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(employee_id, pto_type, year)
);

CREATE TABLE IF NOT EXISTS pto_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  pto_type TEXT NOT NULL CHECK(pto_type IN ('vacation', 'sick', 'personal', 'bereavement', 'parental', 'other')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  total_days REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reason TEXT,
  approved_by TEXT,
  approved_at TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let db: Database | null = null;

export function getDatabase(): Database {
  if (db) return db;

  const path = getDbPath();
  ensureDir(path);

  db = new Database(path);

  // Run schema
  db.exec(SCHEMA);

  return db;
}

export function resolvePartialId(db: Database, table: string, partialId: string): string | null {
  const row = db.query(`SELECT id FROM ${table} WHERE id = ?`).get(partialId) as { id: string } | undefined;
  if (row) return row.id;

  // Try LIKE match
  const rows = db.query(`SELECT id FROM ${table} WHERE id LIKE ? LIMIT 3`).all(`%${partialId}%`) as { id: string }[];
  if (rows.length > 0) {
    return rows[0].id;
  }

  return null;
}

export function generateId(prefix: string = ""): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}
