import { getDatabase, generateId } from "../db/database.js";

export interface Organization {
  id: string;
  name: string;
  country: string | null;
  currency: string;
  fiscal_year_start: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function rowToOrg(row: Record<string, unknown>): Organization {
  return {
    id: row.id as string,
    name: row.name as string,
    country: row.country as string | null,
    currency: row.currency as string,
    fiscal_year_start: row.fiscal_year_start as number,
    metadata: JSON.parse(row.metadata as string || "{}") as Record<string, unknown>,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function createOrganization(input: {
  name: string;
  country?: string;
  currency?: string;
  fiscal_year_start?: number;
  metadata?: Record<string, unknown>;
}): Organization {
  const db = getDatabase();
  const id = generateId("org");
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO organizations (id, name, country, currency, fiscal_year_start, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.country || null,
      input.currency || "USD",
      input.fiscal_year_start || 1,
      JSON.stringify(input.metadata || {}),
      now,
      now,
    ]
  );

  return getOrganization(id)!;
}

export function getOrganization(id: string): Organization | null {
  const db = getDatabase();
  const row = db.query("SELECT * FROM organizations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToOrg(row) : null;
}

export function listOrganizations(): Organization[] {
  const db = getDatabase();
  const rows = db.query("SELECT * FROM organizations ORDER BY name").all() as Record<string, unknown>[];
  return rows.map(rowToOrg);
}

export function updateOrganization(id: string, input: Partial<{
  name: string;
  country: string;
  currency: string;
  fiscal_year_start: number;
  metadata: Record<string, unknown>;
}>): Organization | null {
  const db = getDatabase();
  const existing = getOrganization(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updates: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if (input.name !== undefined) { updates.push("name = ?"); params.push(input.name); }
  if (input.country !== undefined) { updates.push("country = ?"); params.push(input.country); }
  if (input.currency !== undefined) { updates.push("currency = ?"); params.push(input.currency); }
  if (input.fiscal_year_start !== undefined) { updates.push("fiscal_year_start = ?"); params.push(input.fiscal_year_start); }
  if (input.metadata !== undefined) { updates.push("metadata = ?"); params.push(JSON.stringify(input.metadata)); }

  params.push(id);
  db.run(`UPDATE organizations SET ${updates.join(", ")} WHERE id = ?`, params);

  return getOrganization(id);
}

export function deleteOrganization(id: string): boolean {
  const db = getDatabase();
  const result = db.run("DELETE FROM organizations WHERE id = ?", [id]);
  return result.changes > 0;
}
