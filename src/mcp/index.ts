#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createEmployee,
  createEmployeeIfNotExists,
  upsertEmployee,
  getEmployee,
  getEmployeeByEmail,
  listEmployees,
  listEmployeesWithPagination,
  updateEmployee,
  deleteEmployee,
  countEmployees,
  searchEmployees,
  deleteEmployeesBulk,
} from "../db/employees.js";
import {
  createPayrollRun,
  getPayrollRun,
  listPayrollRuns,
  listPayrollRunsWithPagination,
  updatePayrollRun,
  deletePayrollRun,
  calculatePayrollRun,
  calculatePayrollRunDryRun,
} from "../db/payroll-runs.js";
import { createBonus, getBonus, listBonuses, updateBonus, deleteBonus, getEmployeeBonusTotal } from "../db/bonuses.js";
import { createPTOBalance, getEmployeePTOBalance, createPTORequest, listPTORequests, approvePTORequest, rejectPTORequest } from "../db/pto.js";
import { getDatabase, resolvePartialId, generateId } from "../db/database.js";
import type { Employee, PayrollRun } from "../types/index.js";
import { createAuditLog, listAuditLogs } from "../lib/audit.js";
import { createWebhook, listWebhooks, getWebhook, updateWebhook, deleteWebhook, triggerWebhooks, type WebhookEvent } from "../lib/webhooks.js";
import { createScheduledPayroll, listScheduledPayrolls, getScheduledPayroll, updateScheduledPayroll, deleteScheduledPayroll, runScheduledPayrolls, computeNextRun } from "../lib/scheduler.js";
import { createOrganization, listOrganizations, getOrganization, updateOrganization, deleteOrganization } from "../lib/organizations.js";
import { createFiscalZone, listFiscalZones, getFiscalZone, updateFiscalZone, deleteFiscalZone, computeTax, getOrCreateDefaultZone, type TaxBracket, type FiscalZone as FiscalZoneType } from "../lib/fiscal-zones.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

function getMcpVersion(): string {
  try {
    const __dir = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(__dir, "..", "package.json");
    return JSON.parse(readFileSync(pkgPath, "utf-8")).version || "0.0.0";
  } catch { return "0.0.0"; }
}

const server = new McpServer({
  name: "payroll",
  version: getMcpVersion(),
});

// === AGENT AUTH TOOLS ===

server.tool(
  "register_agent",
  "Register a new agent with the payroll system",
  {
    name: z.string().describe("Agent unique name"),
    description: z.string().optional().describe("Agent description"),
  },
  async ({ name, description }) => {
    const db = getDatabase();
    const id = generateId("agt");
    const now = new Date().toISOString();

    try {
      db.run(
        `INSERT INTO agents (id, name, description, metadata, created_at, last_seen_at) VALUES (?, ?, ?, '{}', ?, ?)`,
        [id, name, description || null, now, now]
      );
      return { content: [{ type: "text", text: JSON.stringify({ success: true, id, name }, null, 2) }] };
    } catch (e: unknown) {
      if (String(e).includes("UNIQUE constraint failed")) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "Agent already exists", name }) }] };
      }
      throw e;
    }
  }
);

server.tool(
  "agent_heartbeat",
  "Send heartbeat to maintain agent presence",
  {
    name: z.string().describe("Agent name"),
  },
  async ({ name }) => {
    const db = getDatabase();
    const now = new Date().toISOString();

    db.run(`UPDATE agents SET last_seen_at = ? WHERE name = ?`, [now, name]);
    const agent = db.query("SELECT * FROM agents WHERE name = ?").get(name);

    return { content: [{ type: "text", text: JSON.stringify({ success: true, last_seen_at: now, agent }, null, 2) }] };
  }
);

server.tool(
  "list_agents",
  "List all registered agents",
  {},
  async () => {
    const db = getDatabase();
    const agents = db.query("SELECT * FROM agents ORDER BY last_seen_at DESC").all();
    return { content: [{ type: "text", text: JSON.stringify(agents, null, 2) }] };
  }
);

// === EMPLOYEE TOOLS ===

server.tool(
  "create_employee",
  "Create a new employee",
  {
    first_name: z.string().describe("Employee first name"),
    last_name: z.string().describe("Employee last name"),
    email: z.string().email().optional().describe("Email address"),
    phone: z.string().optional().describe("Phone number"),
    department: z.string().optional().describe("Department"),
    position: z.string().optional().describe("Position/Title"),
    base_salary: z.number().positive().optional().describe("Annual base salary"),
    hourly_rate: z.number().positive().optional().describe("Hourly rate"),
    currency: z.string().default("USD").describe("Currency code"),
    payment_method: z.enum(["bank_transfer", "check", "cash", "crypto"]).default("bank_transfer").describe("Payment method"),
    employee_number: z.string().optional().describe("Employee number"),
    project_id: z.string().optional().describe("Project ID"),
    org_id: z.string().optional().describe("Organization ID"),
  },
  async ({ first_name, last_name, email, phone, department, position, base_salary, hourly_rate, currency, payment_method, employee_number, project_id, org_id }) => {
    const employee = createEmployee({
      first_name,
      last_name,
      email,
      phone,
      department,
      position,
      base_salary,
      hourly_rate,
      currency,
      payment_method,
      employee_number,
      project_id,
      org_id,
    });
    createAuditLog({
      entity_type: "employee",
      entity_id: employee.id,
      action: "create",
      new_values: employee as unknown as Record<string, unknown>,
      metadata: { source: "mcp" },
    });
    triggerWebhooks("employee.created", { employee }).catch(() => {});
    return { content: [{ type: "text", text: JSON.stringify(employee, null, 2) }] };
  }
);

server.tool(
  "create_employee_if_not_exists",
  "Create employee only if email/number doesn't exist (idempotent)",
  {
    first_name: z.string().describe("Employee first name"),
    last_name: z.string().describe("Employee last name"),
    email: z.string().email().optional().describe("Email address"),
    employee_number: z.string().optional().describe("Employee number"),
    department: z.string().optional().describe("Department"),
    position: z.string().optional().describe("Position"),
    base_salary: z.number().positive().optional().describe("Annual base salary"),
  },
  async (args) => {
    const employee = createEmployeeIfNotExists(args);
    return { content: [{ type: "text", text: JSON.stringify(employee, null, 2) }] };
  }
);

server.tool(
  "upsert_employee",
  "Update existing or create new employee by email (idempotent)",
  {
    email: z.string().email().describe("Email to lookup and set"),
    first_name: z.string().optional().describe("First name"),
    last_name: z.string().optional().describe("Last name"),
    department: z.string().optional().describe("Department"),
    position: z.string().optional().describe("Position"),
    base_salary: z.number().positive().optional().describe("Annual base salary"),
    status: z.enum(["active", "inactive", "terminated"]).optional().describe("Status"),
  },
  async (args) => {
    const { email, ...rest } = args;
    const employee = upsertEmployee(email, rest);
    return { content: [{ type: "text", text: JSON.stringify(employee, null, 2) }] };
  }
);

server.tool(
  "get_employee",
  "Get an employee by ID",
  {
    id: z.string().describe("Employee ID"),
  },
  async ({ id }) => {
    const employee = getEmployee(id);
    if (!employee) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Employee not found" }) }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(employee, null, 2) }] };
  }
);

server.tool(
  "list_employees",
  "List employees with optional filters and pagination",
  {
    project_id: z.string().optional().describe("Filter by project ID"),
    org_id: z.string().optional().describe("Filter by organization ID"),
    status: z.enum(["active", "inactive", "terminated"]).optional().describe("Filter by status"),
    department: z.string().optional().describe("Filter by department"),
    search: z.string().optional().describe("Search by name or email"),
    limit: z.number().min(1).max(100).optional().describe("Max results (default 50)"),
    offset: z.number().min(0).optional().describe("Pagination offset (default 0)"),
  },
  async ({ project_id, org_id, status, department, search, limit, offset }) => {
    const result = listEmployeesWithPagination({ project_id, org_id, status, department, search, limit, offset });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "update_employee",
  "Update an employee",
  {
    id: z.string().describe("Employee ID"),
    first_name: z.string().optional().describe("First name"),
    last_name: z.string().optional().describe("Last name"),
    email: z.string().email().optional().describe("Email address"),
    department: z.string().optional().describe("Department"),
    position: z.string().optional().describe("Position"),
    base_salary: z.number().positive().optional().describe("Annual base salary"),
    status: z.enum(["active", "inactive", "terminated"]).optional().describe("Employment status"),
    version: z.number().describe("Current version for optimistic locking"),
  },
  async ({ id, first_name, last_name, email, department, position, base_salary, status, version }) => {
    const oldEmp = getEmployee(id);
    const employee = updateEmployee(id, {
      first_name,
      last_name,
      email,
      department,
      position,
      base_salary,
      status,
      version,
    });
    createAuditLog({
      entity_type: "employee",
      entity_id: id,
      action: "update",
      old_values: oldEmp as unknown as Record<string, unknown>,
      new_values: employee as unknown as Record<string, unknown>,
      metadata: { source: "mcp" },
    });
    triggerWebhooks("employee.updated", { employee }).catch(() => {});
    return { content: [{ type: "text", text: JSON.stringify(employee, null, 2) }] };
  }
);

server.tool(
  "delete_employee",
  "Delete an employee",
  {
    id: z.string().describe("Employee ID"),
  },
  async ({ id }) => {
    const old = getEmployee(id);
    deleteEmployee(id);
    createAuditLog({
      entity_type: "employee",
      entity_id: id,
      action: "delete",
      old_values: old as unknown as Record<string, unknown>,
      metadata: { source: "mcp" },
    });
    triggerWebhooks("employee.deleted", { employee_id: id }).catch(() => {});
    return { content: [{ type: "text", text: JSON.stringify({ success: true, id }) }] };
  }
);

server.tool(
  "count_employees",
  "Count employees",
  {
    project_id: z.string().optional().describe("Filter by project ID"),
    status: z.enum(["active", "inactive", "terminated"]).optional().describe("Filter by status"),
  },
  async ({ project_id, status }) => {
    const count = countEmployees({ project_id, status });
    return { content: [{ type: "text", text: JSON.stringify({ count }) }] };
  }
);

server.tool(
  "search_employees",
  "Search employees by name, email, department, or position",
  {
    query: z.string().describe("Search query"),
  },
  async ({ query }) => {
    const employees = searchEmployees(query);
    return { content: [{ type: "text", text: JSON.stringify(employees, null, 2) }] };
  }
);

server.tool(
  "delete_employees_bulk",
  "Delete multiple employees at once",
  {
    ids: z.array(z.string()).describe("Array of employee IDs to delete"),
  },
  async ({ ids }) => {
    const result = deleteEmployeesBulk(ids);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// === PAYROLL RUN TOOLS ===

server.tool(
  "create_payroll_run",
  "Create a new payroll run",
  {
    period_start: z.string().describe("Pay period start date (YYYY-MM-DD)"),
    period_end: z.string().describe("Pay period end date (YYYY-MM-DD)"),
    project_id: z.string().optional().describe("Project ID"),
    org_id: z.string().optional().describe("Organization ID"),
  },
  async ({ period_start, period_end, project_id, org_id }) => {
    const run = createPayrollRun({ period_start, period_end, project_id, org_id });
    createAuditLog({
      entity_type: "payroll_run",
      entity_id: run.id,
      action: "create",
      new_values: run as unknown as Record<string, unknown>,
      metadata: { source: "mcp" },
    });
    triggerWebhooks("payroll_run.created", { payroll_run: run }).catch(() => {});
    return { content: [{ type: "text", text: JSON.stringify(run, null, 2) }] };
  }
);

server.tool(
  "get_payroll_run",
  "Get a payroll run by ID",
  {
    id: z.string().describe("Payroll run ID"),
  },
  async ({ id }) => {
    const run = getPayrollRun(id);
    if (!run) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Payroll run not found" }) }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(run, null, 2) }] };
  }
);

server.tool(
  "list_payroll_runs",
  "List payroll runs with pagination",
  {
    project_id: z.string().optional().describe("Filter by project ID"),
    org_id: z.string().optional().describe("Filter by organization ID"),
    status: z.enum(["draft", "calculated", "approved", "processing", "completed", "cancelled"]).optional().describe("Filter by status"),
    period_start: z.string().optional().describe("Filter by period start"),
    period_end: z.string().optional().describe("Filter by period end"),
    limit: z.number().min(1).max(100).optional().describe("Max results (default 50)"),
    offset: z.number().min(0).optional().describe("Pagination offset (default 0)"),
  },
  async ({ project_id, org_id, status, period_start, period_end, limit, offset }) => {
    const result = listPayrollRunsWithPagination({ project_id, org_id, status, period_start, period_end, limit, offset });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "calculate_payroll",
  "Calculate payroll for a run",
  {
    id: z.string().describe("Payroll run ID"),
    dry_run: z.boolean().optional().default(false).describe("If true, compute totals without persisting changes"),
  },
  async ({ id, dry_run }) => {
    if (dry_run) {
      const result = calculatePayrollRunDryRun(id);
      return { content: [{ type: "text", text: JSON.stringify({ dry_run: true, ...result }, null, 2) }] };
    }
    const run = calculatePayrollRun(id);
    createAuditLog({
      entity_type: "payroll_run",
      entity_id: id,
      action: "calculate",
      new_values: run as unknown as Record<string, unknown>,
      metadata: { source: "mcp" },
    });
    return { content: [{ type: "text", text: JSON.stringify(run, null, 2) }] };
  }
);

server.tool(
  "update_payroll_run",
  "Update a payroll run",
  {
    id: z.string().describe("Payroll run ID"),
    status: z.enum(["draft", "calculated", "approved", "processing", "completed", "cancelled"]).optional().describe("Status"),
    approved_by: z.string().optional().describe("Approved by agent name"),
    version: z.number().describe("Current version for optimistic locking"),
  },
  async ({ id, status, approved_by, version }) => {
    const oldRun = getPayrollRun(id);
    const run = updatePayrollRun(id, { status, approved_by, approved_at: approved_by ? new Date().toISOString() : undefined, version });
    createAuditLog({
      entity_type: "payroll_run",
      entity_id: id,
      action: status === "approved" ? "approve" : status === "rejected" ? "reject" : "update",
      old_values: oldRun as unknown as Record<string, unknown>,
      new_values: run as unknown as Record<string, unknown>,
      metadata: { source: "mcp", approved_by },
    });
    if (status === "approved") triggerWebhooks("payroll_run.approved", { payroll_run: run }).catch(() => {});
    else if (status === "rejected") triggerWebhooks("payroll_run.rejected", { payroll_run: run }).catch(() => {});
    else triggerWebhooks("payroll_run.updated", { payroll_run: run }).catch(() => {});
    return { content: [{ type: "text", text: JSON.stringify(run, null, 2) }] };
  }
);

server.tool(
  "delete_payroll_run",
  "Delete a payroll run",
  {
    id: z.string().describe("Payroll run ID"),
  },
  async ({ id }) => {
    deletePayrollRun(id);
    return { content: [{ type: "text", text: JSON.stringify({ success: true, id }) }] };
  }
);

// === BONUS TOOLS ===

server.tool(
  "create_bonus",
  "Create a bonus for an employee",
  {
    employee_id: z.string().describe("Employee ID"),
    bonus_type: z.enum(["performance", "signing", "retention", "commission", "holiday", "spot", "other"]).describe("Type of bonus"),
    amount: z.number().positive().describe("Bonus amount"),
    currency: z.string().optional().describe("Currency code"),
    taxable: z.boolean().optional().describe("Whether bonus is taxable"),
    reason: z.string().optional().describe("Reason for bonus"),
    effective_date: z.string().describe("Effective date (YYYY-MM-DD)"),
    period: z.enum(["hourly", "daily", "weekly", "biweekly", "monthly", "quarterly", "annual", "one-time"]).optional().describe("Bonus period"),
  },
  async ({ employee_id, bonus_type, amount, currency, taxable, reason, effective_date, period }) => {
    const bonus = createBonus({ employee_id, bonus_type, amount, currency, taxable, reason, effective_date, period });
    return { content: [{ type: "text", text: JSON.stringify(bonus, null, 2) }] };
  }
);

server.tool(
  "get_bonus",
  "Get a bonus by ID",
  { id: z.string().describe("Bonus ID") },
  async ({ id }) => {
    const bonus = getBonus(id);
    return { content: [{ type: "text", text: JSON.stringify(bonus, null, 2) }] };
  }
);

server.tool(
  "list_bonuses",
  "List bonuses with optional filters",
  {
    employee_id: z.string().optional().describe("Filter by employee ID"),
    payroll_run_id: z.string().optional().describe("Filter by payroll run ID"),
    bonus_type: z.enum(["performance", "signing", "retention", "commission", "holiday", "spot", "other"]).optional().describe("Filter by bonus type"),
  },
  async ({ employee_id, payroll_run_id, bonus_type }) => {
    const bonuses = listBonuses({ employee_id, payroll_run_id, bonus_type });
    return { content: [{ type: "text", text: JSON.stringify(bonuses, null, 2) }] };
  }
);

server.tool(
  "update_bonus",
  "Update a bonus",
  {
    id: z.string().describe("Bonus ID"),
    bonus_type: z.enum(["performance", "signing", "retention", "commission", "holiday", "spot", "other"]).optional(),
    amount: z.number().positive().optional(),
    reason: z.string().optional(),
    effective_date: z.string().optional(),
    period: z.enum(["hourly", "daily", "weekly", "biweekly", "monthly", "quarterly", "annual", "one-time"]).optional(),
  },
  async ({ id, ...input }) => {
    const bonus = updateBonus(id, input);
    return { content: [{ type: "text", text: JSON.stringify(bonus, null, 2) }] };
  }
);

server.tool(
  "delete_bonus",
  "Delete a bonus",
  { id: z.string().describe("Bonus ID") },
  async ({ id }) => {
    deleteBonus(id);
    return { content: [{ type: "text", text: JSON.stringify({ success: true, id }) }] };
  }
);

// === PTO TOOLS ===

server.tool(
  "create_pto_balance",
  "Create PTO balance for an employee",
  {
    employee_id: z.string().describe("Employee ID"),
    pto_type: z.enum(["vacation", "sick", "personal", "bereavement", "parental", "other"]).describe("Type of PTO"),
    year: z.number().describe("Year"),
    total_days: z.number().describe("Total days for the year"),
    accrued_days: z.number().optional().describe("Accrued days"),
  },
  async ({ employee_id, pto_type, year, total_days, accrued_days }) => {
    const balance = createPTOBalance({ employee_id, pto_type, year, total_days, accrued_days });
    return { content: [{ type: "text", text: JSON.stringify(balance, null, 2) }] };
  }
);

server.tool(
  "get_pto_balance",
  "Get employee PTO balances",
  {
    employee_id: z.string().describe("Employee ID"),
    pto_type: z.enum(["vacation", "sick", "personal", "bereavement", "parental", "other"]).optional(),
    year: z.number().optional(),
  },
  async ({ employee_id, pto_type, year }) => {
    const balances = getEmployeePTOBalance(employee_id, pto_type, year);
    return { content: [{ type: "text", text: JSON.stringify(balances, null, 2) }] };
  }
);

server.tool(
  "create_pto_request",
  "Create a PTO request",
  {
    employee_id: z.string().describe("Employee ID"),
    pto_type: z.enum(["vacation", "sick", "personal", "bereavement", "parental", "other"]).describe("Type of PTO"),
    start_date: z.string().describe("Start date (YYYY-MM-DD)"),
    end_date: z.string().describe("End date (YYYY-MM-DD)"),
    total_days: z.number().positive().describe("Total days"),
    reason: z.string().optional().describe("Reason"),
  },
  async ({ employee_id, pto_type, start_date, end_date, total_days, reason }) => {
    const request = createPTORequest({ employee_id, pto_type, start_date, end_date, total_days, reason });
    createAuditLog({
      entity_type: "pto_request",
      entity_id: request.id,
      action: "create",
      new_values: request as unknown as Record<string, unknown>,
      metadata: { source: "mcp" },
    });
    triggerWebhooks("pto_request.created", { pto_request: request }).catch(() => {});
    return { content: [{ type: "text", text: JSON.stringify(request, null, 2) }] };
  }
);

server.tool(
  "list_pto_requests",
  "List PTO requests",
  {
    employee_id: z.string().optional(),
    status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
  },
  async ({ employee_id, status, start_date, end_date }) => {
    const requests = listPTORequests({ employee_id, status, start_date, end_date });
    return { content: [{ type: "text", text: JSON.stringify(requests, null, 2) }] };
  }
);

server.tool(
  "approve_pto_request",
  "Approve a PTO request",
  {
    id: z.string().describe("PTO request ID"),
    approved_by: z.string().describe("Approver name"),
  },
  async ({ id, approved_by }) => {
    const request = approvePTORequest(id, approved_by);
    createAuditLog({
      entity_type: "pto_request",
      entity_id: id,
      action: "approve",
      new_values: request as unknown as Record<string, unknown>,
      metadata: { source: "mcp", approved_by },
    });
    triggerWebhooks("pto_request.approved", { pto_request: request }).catch(() => {});
    return { content: [{ type: "text", text: JSON.stringify(request, null, 2) }] };
  }
);

server.tool(
  "reject_pto_request",
  "Reject a PTO request",
  { id: z.string().describe("PTO request ID") },
  async ({ id }) => {
    const request = rejectPTORequest(id);
    createAuditLog({
      entity_type: "pto_request",
      entity_id: id,
      action: "reject",
      new_values: request as unknown as Record<string, unknown>,
      metadata: { source: "mcp" },
    });
    triggerWebhooks("pto_request.rejected", { pto_request: request }).catch(() => {});
    return { content: [{ type: "text", text: JSON.stringify(request, null, 2) }] };
  }
);

// === SUMMARY TOOLS ===

server.tool(
  "get_payroll_summary",
  "Get payroll summary for a period",
  {
    project_id: z.string().optional().describe("Project ID"),
    period_start: z.string().optional().describe("Period start"),
    period_end: z.string().optional().describe("Period end"),
  },
  async ({ project_id, period_start, period_end }) => {
    const runs = listPayrollRuns({
      project_id,
      period_start,
      period_end,
      status: "completed",
    });

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    let totalEmployees = 0;

    for (const run of runs) {
      totalGross += run.total_gross;
      totalDeductions += run.total_deductions;
      totalNet += run.total_net;
      totalEmployees += run.total_employees;
    }

    return { content: [{ type: "text", text: JSON.stringify({
      total_runs: runs.length,
      total_gross: totalGross,
      total_deductions: totalDeductions,
      total_net: totalNet,
      total_employees_paid: totalEmployees,
    }, null, 2) }] };
  }
);

server.tool(
  "calculate_net_payroll",
  "Calculate net pay for an employee after deductions",
  {
    employee_id: z.string().describe("Employee ID"),
    period_start: z.string().describe("Period start (YYYY-MM-DD)"),
    period_end: z.string().describe("Period end (YYYY-MM-DD)"),
    fiscal_zone_id: z.string().optional().describe("Fiscal zone ID for tax calculation"),
  },
  async ({ employee_id, period_start, period_end, fiscal_zone_id }) => {
    const emp = getEmployee(employee_id);
    if (!emp) return { content: [{ type: "text", text: JSON.stringify({ error: "Employee not found" }) }] };

    const baseSalary = emp.base_salary || 0;
    const monthlyRate = baseSalary / 12;
    const periodGross = monthlyRate;

    const bonuses = listBonuses({ employee_id });
    const periodBonuses = bonuses.filter(b =>
      b.effective_date >= period_start && b.effective_date <= period_end
    );
    const bonusTotal = periodBonuses.reduce((sum, b) => sum + b.amount, 0);

    const totalGross = periodGross + bonusTotal;

    if (fiscal_zone_id) {
      const zone = getFiscalZone(fiscal_zone_id);
      if (!zone) return { content: [{ type: "text", text: JSON.stringify({ error: "Fiscal zone not found" }) }] };
      const tax = computeTax(totalGross, zone);
      return { content: [{ type: "text", text: JSON.stringify({
        employee: { id: emp.id, name: `${emp.first_name} ${emp.last_name}` },
        period: { start: period_start, end: period_end },
        fiscal_zone: { id: zone.id, country: zone.country, tax_year: zone.tax_year },
        breakdown: {
          base_salary: periodGross,
          bonuses: bonusTotal,
          total_gross: tax.gross,
          deductions: {
            federal_tax: tax.federal_tax,
            social_security: tax.social_security,
            medicare: tax.medicare,
            unemployment: tax.unemployment,
            total: tax.total_deductions,
          },
          net_pay: tax.net,
        },
      }, null, 2) }] };
    }

    // Fallback to default calculation
    const federalTax = totalGross * 0.25;
    const socialSecurity = totalGross * 0.062;
    const medicare = totalGross * 0.0145;
    const totalDeductions = federalTax + socialSecurity + medicare;
    const netPay = totalGross - totalDeductions;

    return { content: [{ type: "text", text: JSON.stringify({
      employee: { id: emp.id, name: `${emp.first_name} ${emp.last_name}` },
      period: { start: period_start, end: period_end },
      breakdown: {
        base_salary: periodGross,
        bonuses: bonusTotal,
        total_gross: totalGross,
        deductions: {
          federal_tax: federalTax,
          social_security: socialSecurity,
          medicare: medicare,
          total: totalDeductions,
        },
        net_pay: netPay,
      },
    }, null, 2) }] };
  }
);

// === AUDIT LOG TOOLS ===

server.tool(
  "list_audit_logs",
  "List audit logs with filters and pagination",
  {
    entity_type: z.string().optional().describe("Filter by entity type (employee, payroll_run, pto_request)"),
    entity_id: z.string().optional().describe("Filter by entity ID"),
    action: z.string().optional().describe("Filter by action (create, update, delete, approve, reject, calculate)"),
    actor_name: z.string().optional().describe("Filter by actor name"),
    start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
    end_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
    limit: z.number().min(1).max(100).optional().describe("Max results (default 50)"),
    offset: z.number().min(0).optional().describe("Pagination offset"),
  },
  async ({ entity_type, entity_id, action, actor_name, start_date, end_date, limit, offset }) => {
    const result = listAuditLogs({ entity_type, entity_id, action, actor_name, start_date, end_date, limit, offset });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// === ORGANIZATION TOOLS ===

server.tool(
  "create_organization",
  "Create an organization",
  {
    name: z.string().describe("Organization name"),
    country: z.string().optional().describe("Country code (e.g. US, RO)"),
    currency: z.string().optional().describe("Default currency (default USD)"),
    fiscal_year_start: z.number().min(1).max(12).optional().describe("Fiscal year start month (1-12, default 1)"),
    metadata: z.record(z.unknown()).optional(),
  },
  async ({ name, country, currency, fiscal_year_start, metadata }) => {
    const org = createOrganization({ name, country, currency, fiscal_year_start, metadata });
    return { content: [{ type: "text", text: JSON.stringify(org, null, 2) }] };
  }
);

server.tool(
  "list_organizations",
  "List all organizations",
  {},
  async () => {
    const orgs = listOrganizations();
    return { content: [{ type: "text", text: JSON.stringify(orgs, null, 2) }] };
  }
);

server.tool(
  "get_organization",
  "Get an organization by ID",
  { id: z.string().describe("Organization ID") },
  async ({ id }) => {
    const org = getOrganization(id);
    if (!org) return { content: [{ type: "text", text: JSON.stringify({ error: "Not found" }) }] };
    return { content: [{ type: "text", text: JSON.stringify(org, null, 2) }] };
  }
);

server.tool(
  "update_organization",
  "Update an organization",
  {
    id: z.string().describe("Organization ID"),
    name: z.string().optional(),
    country: z.string().optional(),
    currency: z.string().optional(),
    fiscal_year_start: z.number().min(1).max(12).optional(),
    metadata: z.record(z.unknown()).optional(),
  },
  async ({ id, ...input }) => {
    const org = updateOrganization(id, input);
    if (!org) return { content: [{ type: "text", text: JSON.stringify({ error: "Not found" }) }] };
    return { content: [{ type: "text", text: JSON.stringify(org, null, 2) }] };
  }
);

server.tool(
  "delete_organization",
  "Delete an organization",
  { id: z.string().describe("Organization ID") },
  async ({ id }) => {
    const deleted = deleteOrganization(id);
    return { content: [{ type: "text", text: JSON.stringify({ success: deleted, id }) }] };
  }
);

// === FISCAL ZONE TOOLS ===

server.tool(
  "create_fiscal_zone",
  "Create a fiscal zone with tax brackets",
  {
    country: z.string().describe("Country code (e.g. US, RO)"),
    region: z.string().optional().describe("Region/state code"),
    tax_year: z.number().describe("Tax year"),
    brackets: z.array(z.object({
      min: z.number().describe("Minimum income"),
      max: z.number().nullable().describe("Maximum income (null for unlimited)"),
      rate: z.number().describe("Tax rate (e.g. 0.22 for 22%)"),
    })).describe("Tax brackets"),
    social_security_rate: z.number().optional().describe("Social security rate (default 0)"),
    social_security_cap: z.number().optional().describe("Social security annual cap"),
    medicare_rate: z.number().optional().describe("Medicare rate (default 0)"),
    unemployment_rate: z.number().optional().describe("Unemployment rate (default 0)"),
    currency: z.string().optional().describe("Currency code (default USD)"),
  },
  async ({ country, region, tax_year, brackets, social_security_rate, social_security_cap, medicare_rate, unemployment_rate, currency }) => {
    const zone = createFiscalZone({ country, region, tax_year, brackets, social_security_rate, social_security_cap, medicare_rate, unemployment_rate, currency });
    return { content: [{ type: "text", text: JSON.stringify(zone, null, 2) }] };
  }
);

server.tool(
  "list_fiscal_zones",
  "List fiscal zones",
  {
    country: z.string().optional().describe("Filter by country"),
    active_only: z.boolean().optional().describe("Filter to active only"),
    tax_year: z.number().optional().describe("Tax year"),
  },
  async ({ country, active_only, tax_year }) => {
    const zones = listFiscalZones({ country, active: active_only, tax_year });
    return { content: [{ type: "text", text: JSON.stringify(zones, null, 2) }] };
  }
);

server.tool(
  "get_fiscal_zone",
  "Get a fiscal zone by ID",
  { id: z.string().describe("Fiscal zone ID") },
  async ({ id }) => {
    const zone = getFiscalZone(id);
    if (!zone) return { content: [{ type: "text", text: JSON.stringify({ error: "Not found" }) }] };
    return { content: [{ type: "text", text: JSON.stringify(zone, null, 2) }] };
  }
);

server.tool(
  "update_fiscal_zone",
  "Update a fiscal zone",
  {
    id: z.string().describe("Fiscal zone ID"),
    brackets: z.array(z.object({ min: z.number(), max: z.number().nullable(), rate: z.number() })).optional(),
    social_security_rate: z.number().optional(),
    social_security_cap: z.number().optional(),
    medicare_rate: z.number().optional(),
    unemployment_rate: z.number().optional(),
    active: z.boolean().optional(),
  },
  async ({ id, ...input }) => {
    const zone = updateFiscalZone(id, input);
    if (!zone) return { content: [{ type: "text", text: JSON.stringify({ error: "Not found" }) }] };
    return { content: [{ type: "text", text: JSON.stringify(zone, null, 2) }] };
  }
);

server.tool(
  "delete_fiscal_zone",
  "Delete a fiscal zone",
  { id: z.string().describe("Fiscal zone ID") },
  async ({ id }) => {
    const deleted = deleteFiscalZone(id);
    return { content: [{ type: "text", text: JSON.stringify({ success: deleted, id }) }] };
  }
);

server.tool(
  "compute_tax",
  "Compute taxes for a gross amount using a fiscal zone",
  {
    gross: z.number().describe("Gross income amount"),
    fiscal_zone_id: z.string().describe("Fiscal zone ID to use"),
  },
  async ({ gross, fiscal_zone_id }) => {
    const zone = getFiscalZone(fiscal_zone_id);
    if (!zone) return { content: [{ type: "text", text: JSON.stringify({ error: "Fiscal zone not found" }) }] };
    const result = computeTax(gross, zone);
    return { content: [{ type: "text", text: JSON.stringify({ zone: zone.country, tax_year: zone.tax_year, ...result }, null, 2) }] };
  }
);

server.tool(
  "get_or_create_default_zone",
  "Get or create default fiscal zone for a country (US, RO)",
  {
    country: z.string().describe("Country code (US or RO)"),
    tax_year: z.number().describe("Tax year"),
  },
  async ({ country, tax_year }) => {
    const zone = getOrCreateDefaultZone(country, tax_year);
    if (!zone) return { content: [{ type: "text", text: JSON.stringify({ error: "No default zone for country" }) }] };
    return { content: [{ type: "text", text: JSON.stringify({ created: true, zone }, null, 2) }] };
  }
);

// === RECURRING SCHEDULER TOOLS ===

server.tool(
  "create_scheduled_payroll",
  "Create a recurring payroll schedule",
  {
    name: z.string().describe("Schedule name"),
    frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "annual"]).describe("Pay frequency"),
    project_id: z.string().optional().describe("Project ID"),
    org_id: z.string().optional().describe("Organization ID"),
    day_of_month: z.number().min(1).max(31).optional().describe("Day of month for monthly/quarterly/annual"),
    day_of_week: z.number().min(0).max(6).optional().describe("Day of week for weekly (0=Sunday)"),
    period_start_offset: z.number().optional().describe("Days before pay day to start period (default 0)"),
    period_end_offset: z.number().optional().describe("Days before pay day to end period (default 0)"),
    auto_approve: z.boolean().optional().describe("Auto-approve runs (default false)"),
  },
  async ({ name, frequency, project_id, org_id, day_of_month, day_of_week, period_start_offset, period_end_offset, auto_approve }) => {
    const schedule = createScheduledPayroll({ name, frequency, project_id, org_id, day_of_month, day_of_week, period_start_offset, period_end_offset, auto_approve });
    return { content: [{ type: "text", text: JSON.stringify(schedule, null, 2) }] };
  }
);

server.tool(
  "list_scheduled_payrolls",
  "List recurring payroll schedules",
  {
    active_only: z.boolean().optional().describe("Filter to active only"),
    project_id: z.string().optional(),
    org_id: z.string().optional(),
  },
  async ({ active_only, project_id, org_id }) => {
    const schedules = listScheduledPayrolls({ active: active_only, project_id, org_id });
    return { content: [{ type: "text", text: JSON.stringify(schedules, null, 2) }] };
  }
);

server.tool(
  "get_scheduled_payroll",
  "Get a scheduled payroll by ID",
  { id: z.string().describe("Schedule ID") },
  async ({ id }) => {
    const schedule = getScheduledPayroll(id);
    if (!schedule) return { content: [{ type: "text", text: JSON.stringify({ error: "Not found" }) }] };
    return { content: [{ type: "text", text: JSON.stringify(schedule, null, 2) }] };
  }
);

server.tool(
  "update_scheduled_payroll",
  "Update a recurring payroll schedule",
  {
    id: z.string().describe("Schedule ID"),
    name: z.string().optional(),
    frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "annual"]).optional(),
    day_of_month: z.number().min(1).max(31).optional(),
    day_of_week: z.number().min(0).max(6).optional(),
    period_start_offset: z.number().optional(),
    period_end_offset: z.number().optional(),
    auto_approve: z.boolean().optional(),
    active: z.boolean().optional(),
  },
  async ({ id, ...input }) => {
    const schedule = updateScheduledPayroll(id, input);
    if (!schedule) return { content: [{ type: "text", text: JSON.stringify({ error: "Not found" }) }] };
    return { content: [{ type: "text", text: JSON.stringify(schedule, null, 2) }] };
  }
);

server.tool(
  "delete_scheduled_payroll",
  "Delete a recurring payroll schedule",
  { id: z.string().describe("Schedule ID") },
  async ({ id }) => {
    const deleted = deleteScheduledPayroll(id);
    return { content: [{ type: "text", text: JSON.stringify({ success: deleted, id }) }] };
  }
);

server.tool(
  "trigger_scheduled_payrolls",
  "Manually trigger all due scheduled payroll runs",
  {},
  async () => {
    const result = await runScheduledPayrolls();
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "preview_next_pay_date",
  "Preview the next pay date for a schedule",
  {
    frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "annual"]).describe("Pay frequency"),
    day_of_month: z.number().min(1).max(31).optional(),
    day_of_week: z.number().min(0).max(6).optional(),
  },
  async ({ frequency, day_of_month, day_of_week }) => {
    const next = computeNextRun(frequency, day_of_month ?? 1, day_of_week ?? 0);
    return { content: [{ type: "text", text: JSON.stringify({ frequency, next_pay_date: next }, null, 2) }] };
  }
);

server.tool(
  "create_webhook",
  "Register a webhook endpoint",
  {
    url: z.string().url().describe("Webhook URL"),
    events: z.array(z.string()).describe("Events to subscribe to (e.g. employee.created, payroll_run.completed) or '*' for all"),
    secret: z.string().optional().describe("Optional shared secret for signature verification"),
    active: z.boolean().optional().describe("Whether webhook is active (default true)"),
    metadata: z.record(z.unknown()).optional().describe("Additional metadata"),
  },
  async ({ url, events, secret, active, metadata }) => {
    const webhook = createWebhook({ url, events, secret, active, metadata });
    return { content: [{ type: "text", text: JSON.stringify(webhook, null, 2) }] };
  }
);

server.tool(
  "list_webhooks",
  "List all webhooks",
  { active_only: z.boolean().optional().describe("Filter to active webhooks only") },
  async ({ active_only }) => {
    const webhooks = listWebhooks(active_only ? { active: true } : undefined);
    return { content: [{ type: "text", text: JSON.stringify(webhooks, null, 2) }] };
  }
);

server.tool(
  "get_webhook",
  "Get a webhook by ID",
  { id: z.string().describe("Webhook ID") },
  async ({ id }) => {
    const webhook = getWebhook(id);
    if (!webhook) return { content: [{ type: "text", text: JSON.stringify({ error: "Webhook not found" }) }] };
    return { content: [{ type: "text", text: JSON.stringify(webhook, null, 2) }] };
  }
);

server.tool(
  "update_webhook",
  "Update a webhook",
  {
    id: z.string().describe("Webhook ID"),
    url: z.string().url().optional(),
    events: z.array(z.string()).optional(),
    secret: z.string().optional(),
    active: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
  },
  async ({ id, ...input }) => {
    const webhook = updateWebhook(id, input);
    if (!webhook) return { content: [{ type: "text", text: JSON.stringify({ error: "Webhook not found" }) }] };
    return { content: [{ type: "text", text: JSON.stringify(webhook, null, 2) }] };
  }
);

server.tool(
  "delete_webhook",
  "Delete a webhook",
  { id: z.string().describe("Webhook ID") },
  async ({ id }) => {
    const deleted = deleteWebhook(id);
    return { content: [{ type: "text", text: JSON.stringify({ success: deleted, id }) }] };
  }
);

server.tool(
  "list_webhook_events",
  "List available webhook events",
  {},
  async () => {
    const events: WebhookEvent[] = [
      "employee.created", "employee.updated", "employee.deleted",
      "payroll_run.created", "payroll_run.updated", "payroll_run.completed",
      "payroll_run.approved", "payroll_run.rejected",
      "pto_request.created", "pto_request.approved", "pto_request.rejected",
    ];
    return { content: [{ type: "text", text: JSON.stringify({ events }, null, 2) }] };
  }
);

// === BULK OPERATIONS ===

server.tool(
  "create_employees_bulk",
  "Create multiple employees at once",
  {
    employees: z.array(z.object({
      first_name: z.string(),
      last_name: z.string(),
      email: z.string().optional(),
      department: z.string().optional(),
      position: z.string().optional(),
      base_salary: z.number().optional(),
      currency: z.string().optional(),
    })).describe("Array of employee data"),
  },
  async ({ employees }) => {
    const results = [];
    for (const emp of employees) {
      const created = createEmployee(emp);
      results.push(created);
    }
    return { content: [{ type: "text", text: JSON.stringify({ created: results.length, employees: results }, null, 2) }] };
  }
);

server.tool(
  "update_employees_bulk",
  "Update multiple employees at once",
  {
    updates: z.array(z.object({
      id: z.string(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      department: z.string().optional(),
      position: z.string().optional(),
      base_salary: z.number().optional(),
      status: z.string().optional(),
    })).describe("Array of employee updates"),
  },
  async ({ updates }) => {
    const results = [];
    for (const u of updates) {
      const { id, ...data } = u;
      const updated = updateEmployee(id, data);
      results.push(updated);
    }
    return { content: [{ type: "text", text: JSON.stringify({ updated: results.length, employees: results }, null, 2) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.run(transport);
}

main().catch(console.error);
