import { getDatabase, generateId } from "../db/database.js";

interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret: string | null;
  active: boolean;
  last_triggered_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// SSRF protection: block internal/private IPs and dangerous URLs
function validateWebhookUrl(url: string): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(url);

    // Only allow HTTPS in production
    if (parsed.protocol !== "https:") {
      return { valid: false, reason: "Webhook URLs must use HTTPS" };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0") {
      return { valid: false, reason: "Webhook URLs cannot point to localhost" };
    }

    // Block private IP ranges
    const privatePatterns = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./, // link-local (including AWS metadata)
      /^127\./,
      /^fc00:/,
      /^fe80:/,
      /^::1$/,
    ];
    if (privatePatterns.some((p) => p.test(hostname))) {
      return { valid: false, reason: "Webhook URLs cannot point to private/internal networks" };
    }

    // Block AWS metadata endpoint
    if (hostname.includes("169.254.169.254") || hostname.includes("metadata.google.internal")) {
      return { valid: false, reason: "Webhook URLs cannot point to cloud metadata services" };
    }

    // Block internal hostnames that might leak info
    const blocked = ["internal", "intranet", "private", "local", "localhost", "intranet"];
    if (blocked.some((b) => hostname.includes(b))) {
      return { valid: false, reason: "Webhook URLs cannot use reserved hostnames" };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: "Invalid webhook URL" };
  }
}

export function createWebhook(input: {
  url: string;
  events: string[];
  secret?: string;
  active?: boolean;
  metadata?: Record<string, unknown>;
}): Webhook {
  // Validate URL for SSRF protection
  const validation = validateWebhookUrl(input.url);
  if (!validation.valid) {
    throw new Error(`Invalid webhook URL: ${validation.reason}`);
  }

  const db = getDatabase();
  const id = generateId("whk");
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO webhooks (id, url, events, secret, active, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.url,
      JSON.stringify(input.events),
      input.secret || null,
      input.active !== false ? 1 : 0,
      JSON.stringify(input.metadata || {}),
      now,
      now,
    ]
  );

  return getWebhook(id)!;
}

export function getWebhook(id: string): Webhook | null {
  const db = getDatabase();
  const row = db.query("SELECT * FROM webhooks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    ...row,
    events: JSON.parse(row.events as string),
    secret: row.secret as string | null,
    active: row.active === 1,
    metadata: JSON.parse(row.metadata as string || "{}"),
  } as Webhook;
}

export function listWebhooks(filter?: { active?: boolean }): Webhook[] {
  const db = getDatabase();
  let query = "SELECT * FROM webhooks";
  const params: unknown[] = [];

  if (filter?.active !== undefined) {
    query += " WHERE active = ?";
    params.push(filter.active ? 1 : 0);
  }

  const rows = db.query(query).all(...params) as Record<string, unknown>[];
  return rows.map(row => ({
    ...row,
    events: JSON.parse(row.events as string),
    secret: row.secret as string | null,
    active: row.active === 1,
    metadata: JSON.parse(row.metadata as string || "{}"),
  })) as Webhook[];
}

export function updateWebhook(id: string, input: Partial<{
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  metadata: Record<string, unknown>;
}>): Webhook | null {
  // Validate URL for SSRF protection
  if (input.url !== undefined) {
    const validation = validateWebhookUrl(input.url);
    if (!validation.valid) {
      throw new Error(`Invalid webhook URL: ${validation.reason}`);
    }
  }

  const db = getDatabase();
  const existing = getWebhook(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updates: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if (input.url !== undefined) {
    updates.push("url = ?");
    params.push(input.url);
  }
  if (input.events !== undefined) {
    updates.push("events = ?");
    params.push(JSON.stringify(input.events));
  }
  if (input.secret !== undefined) {
    updates.push("secret = ?");
    params.push(input.secret);
  }
  if (input.active !== undefined) {
    updates.push("active = ?");
    params.push(input.active ? 1 : 0);
  }
  if (input.metadata !== undefined) {
    updates.push("metadata = ?");
    params.push(JSON.stringify(input.metadata));
  }

  params.push(id);
  db.run(`UPDATE webhooks SET ${updates.join(", ")} WHERE id = ?`, params);

  return getWebhook(id);
}

export function deleteWebhook(id: string): boolean {
  const db = getDatabase();
  const result = db.run("DELETE FROM webhooks WHERE id = ?", [id]);
  return result.changes > 0;
}

// Trigger webhooks for an event
export type WebhookEvent =
  | "employee.created"
  | "employee.updated"
  | "employee.deleted"
  | "payroll_run.created"
  | "payroll_run.updated"
  | "payroll_run.completed"
  | "payroll_run.approved"
  | "payroll_run.rejected"
  | "pto_request.created"
  | "pto_request.approved"
  | "pto_request.rejected";

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

export async function triggerWebhooks(event: WebhookEvent, data: Record<string, unknown>): Promise<{ triggered: number; failed: number }> {
  const webhooks = listWebhooks({ active: true });
  const matching = webhooks.filter(w => w.events.includes(event) || w.events.includes("*"));

  let triggered = 0;
  let failed = 0;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  for (const webhook of matching) {
    try {
      // Validate URL at trigger time for SSRF protection
      const validation = validateWebhookUrl(webhook.url);
      if (!validation.valid) {
        console.warn(`Webhook ${webhook.id} blocked: ${validation.reason}`);
        failed++;
        continue;
      }

      const body = JSON.stringify(payload);

      // Simple fetch - in production would add signature header verification
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Event": event,
        },
        body,
      });

      if (response.ok) {
        triggered++;
        // Update last_triggered_at
        const db = getDatabase();
        db.run("UPDATE webhooks SET last_triggered_at = ? WHERE id = ?", [new Date().toISOString(), webhook.id]);
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { triggered, failed };
}