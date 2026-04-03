import { getDatabase, generateId } from "./database.js";

interface Bonus {
  id: string;
  employee_id: string;
  payroll_run_id: string | null;
  bonus_type: string;
  amount: number;
  currency: string;
  taxable: boolean;
  reason: string | null;
  effective_date: string;
  period: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface BonusRow {
  id: string;
  employee_id: string;
  payroll_run_id: string | null;
  bonus_type: string;
  amount: number;
  currency: string;
  taxable: number;
  reason: string | null;
  effective_date: string;
  period: string | null;
  metadata: string;
  created_at: string;
}

function rowToBonus(row: BonusRow): Bonus {
  return {
    ...row,
    payroll_run_id: row.payroll_run_id ?? undefined,
    reason: row.reason ?? undefined,
    period: row.period ?? undefined,
    taxable: row.taxable === 1,
    metadata: JSON.parse(row.metadata || "{}"),
  };
}

export interface CreateBonusInput {
  employee_id: string;
  payroll_run_id?: string;
  bonus_type: "performance" | "signing" | "retention" | "commission" | "holiday" | "spot" | "other";
  amount: number;
  currency?: string;
  taxable?: boolean;
  reason?: string;
  effective_date: string;
  period?: "hourly" | "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "annual" | "one-time";
  metadata?: Record<string, unknown>;
}

export function createBonus(input: CreateBonusInput): Bonus {
  const db = getDatabase();
  const id = generateId("bon");
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO bonuses (id, employee_id, payroll_run_id, bonus_type, amount, currency, taxable, reason, effective_date, period, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.employee_id,
      input.payroll_run_id || null,
      input.bonus_type,
      input.amount,
      input.currency || "USD",
      input.taxable !== false ? 1 : 0,
      input.reason || null,
      input.effective_date,
      input.period || null,
      JSON.stringify(input.metadata || {}),
      now,
    ]
  );

  return getBonus(id)!;
}

export function getBonus(id: string): Bonus | null {
  const db = getDatabase();
  const row = db.query("SELECT * FROM bonuses WHERE id = ?").get(id) as BonusRow | undefined;
  return row ? rowToBonus(row) : null;
}

export function listBonuses(filter: {
  employee_id?: string;
  payroll_run_id?: string;
  bonus_type?: string;
} = {}): Bonus[] {
  const db = getDatabase();

  let query = "SELECT * FROM bonuses WHERE 1=1";
  const params: unknown[] = [];

  if (filter.employee_id) {
    query += " AND employee_id = ?";
    params.push(filter.employee_id);
  }
  if (filter.payroll_run_id) {
    query += " AND payroll_run_id = ?";
    params.push(filter.payroll_run_id);
  }
  if (filter.bonus_type) {
    query += " AND bonus_type = ?";
    params.push(filter.bonus_type);
  }

  query += " ORDER BY effective_date DESC";

  const rows = db.query(query).all(...params) as BonusRow[];
  return rows.map(rowToBonus);
}

export function updateBonus(id: string, input: Partial<CreateBonusInput>): Bonus | null {
  const db = getDatabase();
  const existing = getBonus(id);
  if (!existing) return null;

  db.run(
    `UPDATE bonuses SET
      bonus_type = COALESCE(?, bonus_type),
      amount = COALESCE(?, amount),
      currency = COALESCE(?, currency),
      taxable = COALESCE(?, taxable),
      reason = COALESCE(?, reason),
      effective_date = COALESCE(?, effective_date),
      period = COALESCE(?, period),
      metadata = COALESCE(?, metadata)
     WHERE id = ?`,
    [
      input.bonus_type || null,
      input.amount ?? null,
      input.currency || null,
      input.taxable !== undefined ? (input.taxable ? 1 : 0) : null,
      input.reason || null,
      input.effective_date || null,
      input.period || null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      id,
    ]
  );

  return getBonus(id);
}

export function deleteBonus(id: string): boolean {
  const db = getDatabase();
  const result = db.run("DELETE FROM bonuses WHERE id = ?", [id]);
  return result.changes > 0;
}

export function getEmployeeBonusTotal(employeeId: string, startDate?: string, endDate?: string): number {
  const db = getDatabase();

  let query = "SELECT COALESCE(SUM(amount), 0) as total FROM bonuses WHERE employee_id = ?";
  const params: unknown[] = [employeeId];

  if (startDate) {
    query += " AND effective_date >= ?";
    params.push(startDate);
  }
  if (endDate) {
    query += " AND effective_date <= ?";
    params.push(endDate);
  }

  const result = db.query(query).get(...params) as { total: number };
  return result.total;
}