import { getDatabase, generateId } from "../db/database.js";

interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function createAuditLog(input: {
  entity_type: string;
  entity_id: string;
  action: "create" | "update" | "delete" | "approve" | "reject" | "calculate";
  actor_id?: string;
  actor_name?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): AuditLog {
  const db = getDatabase();
  const id = generateId("aud");
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO audit_logs (id, entity_type, entity_id, action, actor_id, actor_name, old_values, new_values, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.entity_type,
      input.entity_id,
      input.action,
      input.actor_id || null,
      input.actor_name || null,
      input.old_values ? JSON.stringify(input.old_values) : null,
      input.new_values ? JSON.stringify(input.new_values) : null,
      JSON.stringify(input.metadata || {}),
      now,
    ]
  );

  return getAuditLog(id)!;
}

export function getAuditLog(id: string): AuditLog | null {
  const db = getDatabase();
  const row = db.query("SELECT * FROM audit_logs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    ...row,
    old_values: row.old_values ? JSON.parse(row.old_values as string) : null,
    new_values: row.new_values ? JSON.parse(row.new_values as string) : null,
    metadata: JSON.parse(row.metadata as string || "{}"),
  } as AuditLog;
}

export function listAuditLogs(filter: {
  entity_type?: string;
  entity_id?: string;
  action?: string;
  actor_name?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}): { logs: AuditLog[]; total: number } {
  const db = getDatabase();
  const limit = filter.limit || 50;
  const offset = filter.offset || 0;

  let query = "SELECT * FROM audit_logs WHERE 1=1";
  let countQuery = "SELECT COUNT(*) as total FROM audit_logs WHERE 1=1";
  const params: unknown[] = [];
  const countParams: unknown[] = [];

  if (filter.entity_type) {
    query += " AND entity_type = ?";
    countQuery += " AND entity_type = ?";
    params.push(filter.entity_type);
    countParams.push(filter.entity_type);
  }
  if (filter.entity_id) {
    query += " AND entity_id = ?";
    countQuery += " AND entity_id = ?";
    params.push(filter.entity_id);
    countParams.push(filter.entity_id);
  }
  if (filter.action) {
    query += " AND action = ?";
    countQuery += " AND action = ?";
    params.push(filter.action);
    countParams.push(filter.action);
  }
  if (filter.actor_name) {
    query += " AND actor_name LIKE ?";
    countQuery += " AND actor_name LIKE ?";
    params.push(`%${filter.actor_name}%`);
    countParams.push(`%${filter.actor_name}%`);
  }
  if (filter.start_date) {
    query += " AND created_at >= ?";
    countQuery += " AND created_at >= ?";
    params.push(filter.start_date);
    countParams.push(filter.start_date);
  }
  if (filter.end_date) {
    query += " AND created_at <= ?";
    countQuery += " AND created_at <= ?";
    params.push(filter.end_date);
    countParams.push(filter.end_date);
  }

  const countResult = db.query(countQuery).get(...countParams) as { total: number };
  const total = countResult.total;

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const rows = db.query(query).all(...params) as Record<string, unknown>[];
  const logs = rows.map(row => ({
    ...row,
    old_values: row.old_values ? JSON.parse(row.old_values as string) : null,
    new_values: row.new_values ? JSON.parse(row.new_values as string) : null,
    metadata: JSON.parse(row.metadata as string || "{}"),
  })) as AuditLog[];

  return { logs, total };
}

// Helper to auto-log changes
export function logEmployeeChange(
  employeeId: string,
  action: "create" | "update" | "delete",
  actorName: string,
  oldValues?: Record<string, unknown>,
  newValues?: Record<string, unknown>
): AuditLog {
  return createAuditLog({
    entity_type: "employee",
    entity_id: employeeId,
    action,
    actor_name: actorName,
    old_values: oldValues,
    new_values: newValues,
  });
}

export function logPayrollChange(
  payrollRunId: string,
  action: "create" | "update" | "calculate" | "approve" | "reject",
  actorName: string,
  oldValues?: Record<string, unknown>,
  newValues?: Record<string, unknown>
): AuditLog {
  return createAuditLog({
    entity_type: "payroll_run",
    entity_id: payrollRunId,
    action,
    actor_name: actorName,
    old_values: oldValues,
    new_values: newValues,
  });
}