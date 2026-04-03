import { getDatabase, generateId, resolvePartialId } from "./database.js";
import type {
  Employee,
  EmployeeFilter,
  EmployeeStatus,
  EmploymentType,
  Currency,
  PaymentMethod,
} from "../types/index.js";
import { EmployeeNotFoundError } from "../types/index.js";

interface EmployeeRow {
  id: string;
  project_id: string | null;
  org_id: string | null;
  employee_number: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  position: string | null;
  hire_date: string | null;
  employment_type: string;
  status: string;
  base_salary: number | null;
  hourly_rate: number | null;
  currency: string;
  payment_method: string;
  bank_account: string | null;
  tax_id: string | null;
  tags: string;
  metadata: string;
  version: number;
  created_at: string;
  updated_at: string;
  terminated_at: string | null;
}

function rowToEmployee(row: EmployeeRow): Employee {
  return {
    ...row,
    project_id: row.project_id ?? undefined,
    org_id: row.org_id ?? undefined,
    employee_number: row.employee_number ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    department: row.department ?? undefined,
    position: row.position ?? undefined,
    hire_date: row.hire_date ?? undefined,
    base_salary: row.base_salary ?? undefined,
    hourly_rate: row.hourly_rate ?? undefined,
    bank_account: row.bank_account ?? undefined,
    tax_id: row.tax_id ?? undefined,
    terminated_at: row.terminated_at ?? undefined,
    tags: JSON.parse(row.tags || "[]") as string[],
    metadata: JSON.parse(row.metadata || "{}") as Record<string, unknown>,
    employment_type: row.employment_type as EmploymentType,
    status: row.status as EmployeeStatus,
    currency: row.currency as Currency,
    payment_method: row.payment_method as PaymentMethod,
  };
}

export interface CreateEmployeeInput {
  project_id?: string;
  org_id?: string;
  employee_number?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  department?: string;
  position?: string;
  hire_date?: string;
  employment_type?: EmploymentType;
  status?: EmployeeStatus;
  base_salary?: number;
  hourly_rate?: number;
  currency?: Currency;
  payment_method?: PaymentMethod;
  bank_account?: string;
  tax_id?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateEmployeeInput {
  employee_number?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  department?: string;
  position?: string;
  hire_date?: string;
  employment_type?: EmploymentType;
  status?: EmployeeStatus;
  base_salary?: number;
  hourly_rate?: number;
  currency?: Currency;
  payment_method?: PaymentMethod;
  bank_account?: string;
  tax_id?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  version: number;
}

export function createEmployee(input: CreateEmployeeInput, db?: Database): Employee {
  const d = db || getDatabase();
  const id = generateId("emp");
  const now = new Date().toISOString();
  const tags = input.tags || [];
  const metadata = input.metadata || {};

  d.run(
    `INSERT INTO employees (id, project_id, org_id, employee_number, first_name, last_name, email, phone, department, position, hire_date, employment_type, status, base_salary, hourly_rate, currency, payment_method, bank_account, tax_id, tags, metadata, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      id,
      input.project_id || null,
      input.org_id || null,
      input.employee_number || null,
      input.first_name,
      input.last_name,
      input.email || null,
      input.phone || null,
      input.department || null,
      input.position || null,
      input.hire_date || null,
      input.employment_type || "full-time",
      input.status || "active",
      input.base_salary || null,
      input.hourly_rate || null,
      input.currency || "USD",
      input.payment_method || "bank_transfer",
      input.bank_account || null,
      input.tax_id || null,
      JSON.stringify(tags),
      JSON.stringify(metadata),
      now,
      now,
    ]
  );

  return getEmployee(id, d)!;
}

export function createEmployeeIfNotExists(input: CreateEmployeeInput): Employee {
  if (input.email) {
    const existing = getEmployeeByEmail(input.email);
    if (existing) return existing;
  }
  if (input.employee_number) {
    const d = getDatabase();
    const byNumber = d.query("SELECT * FROM employees WHERE employee_number = ?").get(input.employee_number) as EmployeeRow | undefined;
    if (byNumber) return updateEmployee(byNumber.id, input) || byNumber;
  }
  return createEmployee(input);
}

export function upsertEmployee(lookupEmail: string, input: CreateEmployeeInput): Employee {
  const existing = getEmployeeByEmail(lookupEmail);
  if (existing) return updateEmployee(existing.id, input) || existing;
  return createEmployee({ ...input, email: lookupEmail });
}

export function getEmployee(id: string, db?: Database): Employee | null {
  const d = db || getDatabase();
  const row = d.query("SELECT * FROM employees WHERE id = ?").get(id) as EmployeeRow | undefined;
  return row ? rowToEmployee(row) : null;
}

export function getEmployeeByEmail(email: string, db?: Database): Employee | null {
  const d = db || getDatabase();
  const row = d.query("SELECT * FROM employees WHERE email = ?").get(email) as EmployeeRow | undefined;
  return row ? rowToEmployee(row) : null;
}

export function listEmployees(filter: EmployeeFilter = {}, db?: Database): Employee[] {
  return listEmployeesWithPagination(filter, db).employees;
}

export interface PaginatedResult<T> {
  employees: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListEmployeesOptions extends EmployeeFilter {
  limit?: number;
  offset?: number;
}

export function listEmployeesWithPagination(options: ListEmployeesOptions = {}, db?: Database): PaginatedResult<Employee> {
  const d = db || getDatabase();
  const limit = options.limit || 50;
  const offset = options.offset || 0;

  let query = "SELECT * FROM employees WHERE 1=1";
  let countQuery = "SELECT COUNT(*) as total FROM employees WHERE 1=1";
  const params: unknown[] = [];
  const countParams: unknown[] = [];

  if (options.project_id) {
    query += " AND project_id = ?";
    countQuery += " AND project_id = ?";
    params.push(options.project_id);
    countParams.push(options.project_id);
  }

  if (options.org_id) {
    query += " AND org_id = ?";
    countQuery += " AND org_id = ?";
    params.push(options.org_id);
    countParams.push(options.org_id);
  }

  if (options.status) {
    if (Array.isArray(options.status)) {
      query += ` AND status IN (${options.status.map(() => "?").join(",")})`;
      countQuery += ` AND status IN (${options.status.map(() => "?").join(",")})`;
      params.push(...options.status);
      countParams.push(...options.status);
    } else {
      query += " AND status = ?";
      countQuery += " AND status = ?";
      params.push(options.status);
      countParams.push(options.status);
    }
  }

  if (options.department) {
    query += " AND department = ?";
    countQuery += " AND department = ?";
    params.push(options.department);
    countParams.push(options.department);
  }

  if (options.search) {
    const term = `%${options.search}%`;
    query += ` AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR department LIKE ? OR position LIKE ?)`;
    countQuery += ` AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR department LIKE ? OR position LIKE ?)`;
    params.push(term, term, term, term, term);
    countParams.push(term, term, term, term, term);
  }

  // Get total count
  const countResult = d.query(countQuery).get(...countParams) as { total: number };
  const total = countResult.total;

  // Add pagination
  query += " ORDER BY first_name, last_name LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const rows = d.query(query).all(...params) as EmployeeRow[];

  return {
    employees: rows.map(rowToEmployee),
    total,
    limit,
    offset,
  };
}

export function updateEmployee(id: string, input: UpdateEmployeeInput, db?: Database): Employee {
  const d = db || getDatabase();
  const existing = d.query("SELECT version FROM employees WHERE id = ?").get(id) as { version: number } | undefined;

  if (!existing) {
    throw new EmployeeNotFoundError(id);
  }

  if (input.version !== existing.version) {
    throw new Error(`Version conflict: expected version ${existing.version}, got ${input.version}`);
  }

  const now = new Date().toISOString();
  const tags = input.tags !== undefined ? input.tags : undefined;
  const metadata = input.metadata !== undefined ? input.metadata : undefined;

  const updates: string[] = ["version = version + 1", "updated_at = ?"];
  const params: unknown[] = [now];

  if (input.employee_number !== undefined) {
    updates.push("employee_number = ?");
    params.push(input.employee_number);
  }
  if (input.first_name !== undefined) {
    updates.push("first_name = ?");
    params.push(input.first_name);
  }
  if (input.last_name !== undefined) {
    updates.push("last_name = ?");
    params.push(input.last_name);
  }
  if (input.email !== undefined) {
    updates.push("email = ?");
    params.push(input.email);
  }
  if (input.phone !== undefined) {
    updates.push("phone = ?");
    params.push(input.phone);
  }
  if (input.department !== undefined) {
    updates.push("department = ?");
    params.push(input.department);
  }
  if (input.position !== undefined) {
    updates.push("position = ?");
    params.push(input.position);
  }
  if (input.hire_date !== undefined) {
    updates.push("hire_date = ?");
    params.push(input.hire_date);
  }
  if (input.employment_type !== undefined) {
    updates.push("employment_type = ?");
    params.push(input.employment_type);
  }
  if (input.status !== undefined) {
    updates.push("status = ?");
    params.push(input.status);
    if (input.status === "terminated") {
      updates.push("terminated_at = ?");
      params.push(now);
    }
  }
  if (input.base_salary !== undefined) {
    updates.push("base_salary = ?");
    params.push(input.base_salary);
  }
  if (input.hourly_rate !== undefined) {
    updates.push("hourly_rate = ?");
    params.push(input.hourly_rate);
  }
  if (input.currency !== undefined) {
    updates.push("currency = ?");
    params.push(input.currency);
  }
  if (input.payment_method !== undefined) {
    updates.push("payment_method = ?");
    params.push(input.payment_method);
  }
  if (input.bank_account !== undefined) {
    updates.push("bank_account = ?");
    params.push(input.bank_account);
  }
  if (input.tax_id !== undefined) {
    updates.push("tax_id = ?");
    params.push(input.tax_id);
  }
  if (tags !== undefined) {
    updates.push("tags = ?");
    params.push(JSON.stringify(tags));
  }
  if (metadata !== undefined) {
    updates.push("metadata = ?");
    params.push(JSON.stringify(metadata));
  }

  params.push(id);
  d.run(`UPDATE employees SET ${updates.join(", ")} WHERE id = ?`, params);

  return getEmployee(id, d)!;
}

export function deleteEmployee(id: string, db?: Database): void {
  const d = db || getDatabase();
  d.run("DELETE FROM employees WHERE id = ?", [id]);
}

export function searchEmployees(query: string): Employee[] {
  const d = getDatabase();
  const searchTerm = `%${query}%`;

  const rows = d.query(`
    SELECT * FROM employees
    WHERE first_name LIKE ?
       OR last_name LIKE ?
       OR email LIKE ?
       OR department LIKE ?
       OR position LIKE ?
    ORDER BY first_name, last_name
    LIMIT 50
  `).all(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm) as EmployeeRow[];

  return rows.map(rowToEmployee);
}

export function deleteEmployeesBulk(ids: string[]): { deleted: number; ids: string[] } {
  const d = getDatabase();
  let deleted = 0;

  for (const id of ids) {
    const result = d.run("DELETE FROM employees WHERE id = ?", [id]);
    deleted += result.changes;
  }

  return { deleted, ids };
}

export function countEmployees(filter: EmployeeFilter = {}, db?: Database): number {
  const d = db || getDatabase();

  let query = "SELECT COUNT(*) as count FROM employees WHERE 1=1";
  const params: unknown[] = [];

  if (filter.project_id) {
    query += " AND project_id = ?";
    params.push(filter.project_id);
  }

  if (filter.status) {
    if (Array.isArray(filter.status)) {
      query += ` AND status IN (${filter.status.map(() => "?").join(",")})`;
      params.push(...filter.status);
    } else {
      query += " AND status = ?";
      params.push(filter.status);
    }
  }

  if (filter.department) {
    query += " AND department = ?";
    params.push(filter.department);
  }

  if (filter.search) {
    const term = `%${filter.search}%`;
    query += ` AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR department LIKE ? OR position LIKE ?)`;
    params.push(term, term, term, term, term);
  }

  const result = d.query(query).get(...params) as { count: number };
  return result.count;
}

// Type alias for Database from bun:sqlite
import type { Database } from "bun:sqlite";
