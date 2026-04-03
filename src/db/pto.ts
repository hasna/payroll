import { getDatabase, generateId } from "./database.js";

interface PTOBalance {
  id: string;
  employee_id: string;
  pto_type: string;
  year: number;
  total_days: number;
  used_days: number;
  accrued_days: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface PTOBalanceRow {
  id: string;
  employee_id: string;
  pto_type: string;
  year: number;
  total_days: number;
  used_days: number;
  accrued_days: number;
  metadata: string;
  created_at: string;
  updated_at: string;
}

function rowToPTOBalance(row: PTOBalanceRow): PTOBalance {
  return {
    ...row,
    metadata: JSON.parse(row.metadata || "{}"),
  };
}

export interface CreatePTOBalanceInput {
  employee_id: string;
  pto_type: "vacation" | "sick" | "personal" | "bereavement" | "parental" | "other";
  year: number;
  total_days: number;
  used_days?: number;
  accrued_days?: number;
  metadata?: Record<string, unknown>;
}

export function createPTOBalance(input: CreatePTOBalanceInput): PTOBalance {
  const db = getDatabase();
  const id = generateId("pto");
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO pto_balances (id, employee_id, pto_type, year, total_days, used_days, accrued_days, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.employee_id,
      input.pto_type,
      input.year,
      input.total_days,
      input.used_days || 0,
      input.accrued_days || 0,
      JSON.stringify(input.metadata || {}),
      now,
      now,
    ]
  );

  return getPTOBalance(id)!;
}

export function getPTOBalance(id: string): PTOBalance | null {
  const db = getDatabase();
  const row = db.query("SELECT * FROM pto_balances WHERE id = ?").get(id) as PTOBalanceRow | undefined;
  return row ? rowToPTOBalance(row) : null;
}

export function getEmployeePTOBalance(employeeId: string, ptoType?: string, year?: number): PTOBalance[] {
  const db = getDatabase();

  let query = "SELECT * FROM pto_balances WHERE employee_id = ?";
  const params: unknown[] = [employeeId];

  if (ptoType) {
    query += " AND pto_type = ?";
    params.push(ptoType);
  }
  if (year) {
    query += " AND year = ?";
    params.push(year);
  }

  query += " ORDER BY year DESC, pto_type";

  const rows = db.query(query).all(...params) as PTOBalanceRow[];
  return rows.map(rowToPTOBalance);
}

export function updatePTOBalance(id: string, input: Partial<CreatePTOBalanceInput>): PTOBalance | null {
  const db = getDatabase();
  const existing = getPTOBalance(id);
  if (!existing) return null;

  const now = new Date().toISOString();

  db.run(
    `UPDATE pto_balances SET
      total_days = COALESCE(?, total_days),
      used_days = COALESCE(?, used_days),
      accrued_days = COALESCE(?, accrued_days),
      metadata = COALESCE(?, metadata),
      updated_at = ?
     WHERE id = ?`,
    [
      input.total_days ?? null,
      input.used_days ?? null,
      input.accrued_days ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now,
      id,
    ]
  );

  return getPTOBalance(id);
}

export function usePTODays(id: string, days: number): PTOBalance | null {
  const db = getDatabase();
  const existing = getPTOBalance(id);
  if (!existing) return null;

  const newUsed = existing.used_days + days;
  if (newUsed > existing.total_days) {
    throw new Error(`Cannot use ${days} days. Only ${existing.total_days - existing.used_days} days available.`);
  }

  return updatePTOBalance(id, { used_days: newUsed });
}

// PTO Requests
interface PTORequest {
  id: string;
  employee_id: string;
  pto_type: string;
  start_date: string;
  end_date: string;
  total_days: number;
  status: string;
  reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface PTORequestRow {
  id: string;
  employee_id: string;
  pto_type: string;
  start_date: string;
  end_date: string;
  total_days: number;
  status: string;
  reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

function rowToPTORequest(row: PTORequestRow): PTORequest {
  return {
    ...row,
    reason: row.reason ?? undefined,
    approved_by: row.approved_by ?? undefined,
    approved_at: row.approved_at ?? undefined,
    metadata: JSON.parse(row.metadata || "{}"),
  };
}

export interface CreatePTORequestInput {
  employee_id: string;
  pto_type: "vacation" | "sick" | "personal" | "bereavement" | "parental" | "other";
  start_date: string;
  end_date: string;
  total_days: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export function createPTORequest(input: CreatePTORequestInput): PTORequest {
  const db = getDatabase();
  const id = generateId("ptr");
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO pto_requests (id, employee_id, pto_type, start_date, end_date, total_days, status, reason, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    [
      id,
      input.employee_id,
      input.pto_type,
      input.start_date,
      input.end_date,
      input.total_days,
      input.reason || null,
      JSON.stringify(input.metadata || {}),
      now,
      now,
    ]
  );

  return getPTORequest(id)!;
}

export function getPTORequest(id: string): PTORequest | null {
  const db = getDatabase();
  const row = db.query("SELECT * FROM pto_requests WHERE id = ?").get(id) as PTORequestRow | undefined;
  return row ? rowToPTORequest(row) : null;
}

export function listPTORequests(filter: {
  employee_id?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
} = {}): PTORequest[] {
  const db = getDatabase();

  let query = "SELECT * FROM pto_requests WHERE 1=1";
  const params: unknown[] = [];

  if (filter.employee_id) {
    query += " AND employee_id = ?";
    params.push(filter.employee_id);
  }
  if (filter.status) {
    query += " AND status = ?";
    params.push(filter.status);
  }
  if (filter.start_date) {
    query += " AND end_date >= ?";
    params.push(filter.start_date);
  }
  if (filter.end_date) {
    query += " AND start_date <= ?";
    params.push(filter.end_date);
  }

  query += " ORDER BY created_at DESC";

  const rows = db.query(query).all(...params) as PTORequestRow[];
  return rows.map(rowToPTORequest);
}

export function approvePTORequest(id: string, approvedBy: string): PTORequest | null {
  const db = getDatabase();
  const now = new Date().toISOString();

  db.run(
    `UPDATE pto_requests SET status = 'approved', approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?`,
    [approvedBy, now, now, id]
  );

  // Update the balance
  const request = getPTORequest(id);
  if (request) {
    const balances = getEmployeePTOBalance(request.employee_id, request.pto_type, new Date(request.start_date).getFullYear());
    if (balances.length > 0) {
      usePTODays(balances[0].id, request.total_days);
    }
  }

  return getPTORequest(id);
}

export function rejectPTORequest(id: string): PTORequest | null {
  const db = getDatabase();
  const now = new Date().toISOString();

  db.run(`UPDATE pto_requests SET status = 'rejected', updated_at = ? WHERE id = ?`, [now, id]);
  return getPTORequest(id);
}