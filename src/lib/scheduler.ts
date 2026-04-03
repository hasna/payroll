import { getDatabase, generateId } from "../db/database.js";
import { createPayrollRun } from "../db/payroll-runs.js";
import { triggerWebhooks } from "./webhooks.js";

export interface ScheduledPayroll {
  id: string;
  org_id: string | null;
  project_id: string | null;
  name: string;
  frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";
  day_of_month: number | null;
  day_of_week: number | null;
  period_start_offset: number;
  period_end_offset: number;
  auto_approve: boolean;
  active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function rowToScheduled(row: Record<string, unknown>): ScheduledPayroll {
  return {
    id: row.id as string,
    org_id: row.org_id as string | null,
    project_id: row.project_id as string | null,
    name: row.name as string,
    frequency: row.frequency as ScheduledPayroll["frequency"],
    day_of_month: row.day_of_month as number | null,
    day_of_week: row.day_of_week as number | null,
    period_start_offset: row.period_start_offset as number,
    period_end_offset: row.period_end_offset as number,
    auto_approve: row.auto_approve === 1,
    active: row.active === 1,
    last_run_at: row.last_run_at as string | null,
    next_run_at: row.next_run_at as string | null,
    metadata: JSON.parse(row.metadata as string || "{}") as Record<string, unknown>,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function createScheduledPayroll(input: {
  org_id?: string;
  project_id?: string;
  name: string;
  frequency: ScheduledPayroll["frequency"];
  day_of_month?: number;
  day_of_week?: number;
  period_start_offset?: number;
  period_end_offset?: number;
  auto_approve?: boolean;
}): ScheduledPayroll {
  const db = getDatabase();
  const id = generateId("sch");
  const now = new Date().toISOString();
  const nextRun = computeNextRun(input.frequency, input.day_of_month ?? 1, input.day_of_week ?? 0);

  db.run(
    `INSERT INTO scheduled_payrolls (id, org_id, project_id, name, frequency, day_of_month, day_of_week, period_start_offset, period_end_offset, auto_approve, active, next_run_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [
      id,
      input.org_id || null,
      input.project_id || null,
      input.name,
      input.frequency,
      input.day_of_month ?? null,
      input.day_of_week ?? null,
      input.period_start_offset ?? 0,
      input.period_end_offset ?? 0,
      input.auto_approve ? 1 : 0,
      nextRun,
      now,
      now,
    ]
  );

  return getScheduledPayroll(id)!;
}

export function getScheduledPayroll(id: string): ScheduledPayroll | null {
  const db = getDatabase();
  const row = db.query("SELECT * FROM scheduled_payrolls WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToScheduled(row) : null;
}

export function listScheduledPayrolls(filter?: { active?: boolean; org_id?: string; project_id?: string }): ScheduledPayroll[] {
  const db = getDatabase();
  let query = "SELECT * FROM scheduled_payrolls WHERE 1=1";
  const params: unknown[] = [];

  if (filter?.active !== undefined) {
    query += " AND active = ?";
    params.push(filter.active ? 1 : 0);
  }
  if (filter?.org_id) {
    query += " AND org_id = ?";
    params.push(filter.org_id);
  }
  if (filter?.project_id) {
    query += " AND project_id = ?";
    params.push(filter.project_id);
  }

  const rows = db.query(query).all(...params) as Record<string, unknown>[];
  return rows.map(rowToScheduled);
}

export function updateScheduledPayroll(id: string, input: Partial<{
  name: string;
  frequency: ScheduledPayroll["frequency"];
  day_of_month: number;
  day_of_week: number;
  period_start_offset: number;
  period_end_offset: number;
  auto_approve: boolean;
  active: boolean;
}>): ScheduledPayroll | null {
  const db = getDatabase();
  const existing = getScheduledPayroll(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updates: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if (input.name !== undefined) { updates.push("name = ?"); params.push(input.name); }
  if (input.frequency !== undefined) { updates.push("frequency = ?"); params.push(input.frequency); }
  if (input.day_of_month !== undefined) { updates.push("day_of_month = ?"); params.push(input.day_of_month); }
  if (input.day_of_week !== undefined) { updates.push("day_of_week = ?"); params.push(input.day_of_week); }
  if (input.period_start_offset !== undefined) { updates.push("period_start_offset = ?"); params.push(input.period_start_offset); }
  if (input.period_end_offset !== undefined) { updates.push("period_end_offset = ?"); params.push(input.period_end_offset); }
  if (input.auto_approve !== undefined) { updates.push("auto_approve = ?"); params.push(input.auto_approve ? 1 : 0); }
  if (input.active !== undefined) { updates.push("active = ?"); params.push(input.active ? 1 : 0); }

  // Recompute next_run if schedule changed
  const freq = input.frequency ?? existing.frequency;
  const dom = input.day_of_month ?? existing.day_of_month ?? 1;
  const dow = input.day_of_week ?? existing.day_of_week ?? 0;
  updates.push("next_run_at = ?");
  params.push(computeNextRun(freq, dom, dow));

  params.push(id);
  db.run(`UPDATE scheduled_payrolls SET ${updates.join(", ")} WHERE id = ?`, params);

  return getScheduledPayroll(id);
}

export function deleteScheduledPayroll(id: string): boolean {
  const db = getDatabase();
  const result = db.run("DELETE FROM scheduled_payrolls WHERE id = ?", [id]);
  return result.changes > 0;
}

export function computeNextRun(frequency: ScheduledPayroll["frequency"], dayOfMonth: number, dayOfWeek: number): string {
  const now = new Date();
  const next = new Date(now);

  switch (frequency) {
    case "weekly":
      // Next occurrence of day_of_week
      const currentDow = now.getDay();
      const daysUntil = (dayOfWeek - currentDow + 7) % 7 || 7;
      next.setDate(now.getDate() + daysUntil);
      break;
    case "biweekly":
      const daysUntilBi = (dayOfWeek - currentDow + 7) % 7 || 7;
      next.setDate(now.getDate() + daysUntilBi + 14);
      break;
    case "monthly":
      next.setDate(dayOfMonth);
      if (next <= now) next.setMonth(next.getMonth() + 1);
      // Handle months with fewer days
      if (next.getDate() !== dayOfMonth) next.setDate(0);
      break;
    case "quarterly":
      next.setDate(dayOfMonth);
      if (next <= now) next.setMonth(next.getMonth() + 1);
      if (next.getDate() !== dayOfMonth) next.setDate(0);
      // Only run on quarter months (1, 4, 7, 10)
      while (![1, 4, 7, 10].includes(next.getMonth() + 1)) {
        next.setMonth(next.getMonth() + 1);
        if (next.getDate() !== dayOfMonth) next.setDate(0);
      }
      break;
    case "annual":
      next.setMonth(0, dayOfMonth); // Jan + dayOfMonth
      if (next <= now) next.setFullYear(next.getFullYear() + 1);
      break;
  }

  next.setHours(0, 0, 0, 0);
  return next.toISOString();
}

export function getPeriodDates(schedule: ScheduledPayroll): { period_start: string; period_end: string } {
  const now = new Date();
  const endOffset = schedule.period_end_offset;
  const startOffset = schedule.period_start_offset;

  const end = new Date(now);
  end.setDate(end.getDate() + endOffset);

  const start = new Date(end);
  start.setDate(start.getDate() + startOffset);

  return {
    period_start: start.toISOString().split("T")[0],
    period_end: end.toISOString().split("T")[0],
  };
}

export interface SchedulerResult {
  triggered: number;
  skipped: number;
  errors: string[];
}

export async function runScheduledPayrolls(): Promise<SchedulerResult> {
  const db = getDatabase();
  const now = new Date();
  const result: SchedulerResult = { triggered: 0, skipped: 0, errors: [] };

  const due = db.query(`
    SELECT * FROM scheduled_payrolls
    WHERE active = 1 AND next_run_at <= ?
  `).all(now.toISOString()) as Record<string, unknown>[];

  for (const row of due) {
    const schedule = rowToScheduled(row);
    try {
      const { period_start, period_end } = getPeriodDates(schedule);

      const run = createPayrollRun({
        project_id: schedule.project_id ?? undefined,
        org_id: schedule.org_id ?? undefined,
        period_start,
        period_end,
      });

      // Update last_run and next_run
      const nextRun = computeNextRun(schedule.frequency, schedule.day_of_month ?? 1, schedule.day_of_week ?? 0);
      db.run(
        `UPDATE scheduled_payrolls SET last_run_at = ?, next_run_at = ?, updated_at = ? WHERE id = ?`,
        [now.toISOString(), nextRun, now.toISOString(), schedule.id]
      );

      triggerWebhooks("payroll_run.created", { payroll_run: run, scheduled_by: schedule.id }).catch(() => {});
      result.triggered++;
    } catch (e) {
      result.errors.push(`${schedule.id}: ${e}`);
    }
  }

  result.skipped = due.length - result.triggered;
  return result;
}
