import { getDatabase, generateId } from "../db/database.js";

export interface TaxBracket {
  min: number;
  max: number | null;
  rate: number;
}

export interface FiscalZone {
  id: string;
  country: string;
  region: string | null;
  tax_year: number;
  brackets: TaxBracket[];
  social_security_rate: number;
  social_security_cap: number | null;
  medicare_rate: number;
  unemployment_rate: number;
  currency: string;
  active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TaxBreakdown {
  gross: number;
  federal_tax: number;
  social_security: number;
  medicare: number;
  unemployment: number;
  total_deductions: number;
  net: number;
}

function rowToZone(row: Record<string, unknown>): FiscalZone {
  return {
    id: row.id as string,
    country: row.country as string,
    region: row.region as string | null,
    tax_year: row.tax_year as number,
    brackets: JSON.parse(row.brackets as string) as TaxBracket[],
    social_security_rate: row.social_security_rate as number,
    social_security_cap: row.social_security_cap as number | null,
    medicare_rate: row.medicare_rate as number,
    unemployment_rate: row.unemployment_rate as number,
    currency: row.currency as string,
    active: row.active === 1,
    metadata: JSON.parse(row.metadata as string || "{}") as Record<string, unknown>,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function createFiscalZone(input: {
  country: string;
  region?: string;
  tax_year: number;
  brackets: TaxBracket[];
  social_security_rate?: number;
  social_security_cap?: number;
  medicare_rate?: number;
  unemployment_rate?: number;
  currency?: string;
  active?: boolean;
  metadata?: Record<string, unknown>;
}): FiscalZone {
  const db = getDatabase();
  const id = generateId("fz");
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO fiscal_zones (id, country, region, tax_year, brackets, social_security_rate, social_security_cap, medicare_rate, unemployment_rate, currency, active, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.country,
      input.region || null,
      input.tax_year,
      JSON.stringify(input.brackets),
      input.social_security_rate ?? 0,
      input.social_security_cap ?? null,
      input.medicare_rate ?? 0,
      input.unemployment_rate ?? 0,
      input.currency ?? "USD",
      input.active !== false ? 1 : 0,
      JSON.stringify(input.metadata || {}),
      now,
      now,
    ]
  );

  return getFiscalZone(id)!;
}

export function getFiscalZone(id: string): FiscalZone | null {
  const db = getDatabase();
  const row = db.query("SELECT * FROM fiscal_zones WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToZone(row) : null;
}

export function listFiscalZones(filter?: { country?: string; active?: boolean; tax_year?: number }): FiscalZone[] {
  const db = getDatabase();
  let query = "SELECT * FROM fiscal_zones WHERE 1=1";
  const params: unknown[] = [];

  if (filter?.country) {
    query += " AND country = ?";
    params.push(filter.country);
  }
  if (filter?.active !== undefined) {
    query += " AND active = ?";
    params.push(filter.active ? 1 : 0);
  }
  if (filter?.tax_year) {
    query += " AND tax_year = ?";
    params.push(filter.tax_year);
  }

  const rows = db.query(query).all(...params) as Record<string, unknown>[];
  return rows.map(rowToZone);
}

export function updateFiscalZone(id: string, input: Partial<{
  brackets: TaxBracket[];
  social_security_rate: number;
  social_security_cap: number;
  medicare_rate: number;
  unemployment_rate: number;
  active: boolean;
  metadata: Record<string, unknown>;
}>): FiscalZone | null {
  const db = getDatabase();
  const existing = getFiscalZone(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updates: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if (input.brackets !== undefined) { updates.push("brackets = ?"); params.push(JSON.stringify(input.brackets)); }
  if (input.social_security_rate !== undefined) { updates.push("social_security_rate = ?"); params.push(input.social_security_rate); }
  if (input.social_security_cap !== undefined) { updates.push("social_security_cap = ?"); params.push(input.social_security_cap); }
  if (input.medicare_rate !== undefined) { updates.push("medicare_rate = ?"); params.push(input.medicare_rate); }
  if (input.unemployment_rate !== undefined) { updates.push("unemployment_rate = ?"); params.push(input.unemployment_rate); }
  if (input.active !== undefined) { updates.push("active = ?"); params.push(input.active ? 1 : 0); }
  if (input.metadata !== undefined) { updates.push("metadata = ?"); params.push(JSON.stringify(input.metadata)); }

  params.push(id);
  db.run(`UPDATE fiscal_zones SET ${updates.join(", ")} WHERE id = ?`, params);

  return getFiscalZone(id);
}

export function deleteFiscalZone(id: string): boolean {
  const db = getDatabase();
  const result = db.run("DELETE FROM fiscal_zones WHERE id = ?", [id]);
  return result.changes > 0;
}

export function computeTax(gross: number, zone: FiscalZone): TaxBreakdown {
  // Apply tax brackets progressively
  let federalTax = 0;
  let remaining = gross;

  const sorted = [...zone.brackets].sort((a, b) => a.min - b.min);

  for (const bracket of sorted) {
    if (remaining <= 0) break;
    const bracketMin = bracket.min;
    const bracketMax = bracket.max ?? Infinity;
    const taxableInBracket = Math.min(remaining, bracketMax - bracketMin);
    if (gross >= bracketMin) {
      federalTax += Math.max(0, taxableInBracket) * bracket.rate;
      remaining -= taxableInBracket;
    }
  }

  // Social security (capped)
  let socialSecurity = gross * zone.social_security_rate;
  if (zone.social_security_cap) {
    socialSecurity = Math.min(socialSecurity, zone.social_security_cap);
  }

  const medicare = gross * zone.medicare_rate;
  const unemployment = gross * zone.unemployment_rate;
  const totalDeductions = federalTax + socialSecurity + medicare + unemployment;

  return {
    gross,
    federal_tax: federalTax,
    social_security: socialSecurity,
    medicare,
    unemployment,
    total_deductions: totalDeductions,
    net: gross - totalDeductions,
  };
}

export function getOrCreateDefaultZone(country: string, taxYear: number): FiscalZone | null {
  const existing = listFiscalZones({ country, tax_year: taxYear, active: true });
  if (existing.length > 0) return existing[0];

  // Seed defaults for US and Romania
  if (country === "US") {
    return createFiscalZone({
      country: "US",
      tax_year: taxYear,
      brackets: [
        { min: 0, max: 11600, rate: 0.10 },
        { min: 11600, max: 47150, rate: 0.12 },
        { min: 47150, max: 100525, rate: 0.22 },
        { min: 100525, max: 191950, rate: 0.24 },
        { min: 191950, max: 243725, rate: 0.32 },
        { min: 243725, max: 609350, rate: 0.35 },
        { min: 609350, max: null, rate: 0.37 },
      ],
      social_security_rate: 0.062,
      social_security_cap: 168600,
      medicare_rate: 0.0145,
      unemployment_rate: 0.006,
      currency: "USD",
    });
  }

  if (country === "RO") {
    return createFiscalZone({
      country: "RO",
      tax_year: taxYear,
      brackets: [
        { min: 0, max: null, rate: 0.10 }, // Flat 10% for Romania
      ],
      social_security_rate: 0.25,
      social_security_cap: null,
      medicare_rate: 0.01,
      unemployment_rate: 0,
      currency: "RON",
    });
  }

  return null;
}
