#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createEmployee,
  getEmployee,
  getEmployeeByEmail,
  listEmployees,
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
  updatePayrollRun,
  deletePayrollRun,
  calculatePayrollRun,
} from "../db/payroll-runs.js";
import { createBonus, getBonus, listBonuses, updateBonus, deleteBonus, getEmployeeBonusTotal } from "../db/bonuses.js";
import { createPTOBalance, getEmployeePTOBalance, createPTORequest, listPTORequests, approvePTORequest, rejectPTORequest } from "../db/pto.js";
import { getDatabase, resolvePartialId, generateId } from "../db/database.js";
import type { Employee, PayrollRun } from "../types/index.js";
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
  "List employees with optional filters",
  {
    project_id: z.string().optional().describe("Filter by project ID"),
    org_id: z.string().optional().describe("Filter by organization ID"),
    status: z.enum(["active", "inactive", "terminated"]).optional().describe("Filter by status"),
    department: z.string().optional().describe("Filter by department"),
    search: z.string().optional().describe("Search by name or email"),
    limit: z.number().min(1).max(100).optional().describe("Max results"),
  },
  async ({ project_id, org_id, status, department, search, limit }) => {
    const employees = listEmployees({ project_id, org_id, status, department, search, limit });
    return { content: [{ type: "text", text: JSON.stringify(employees, null, 2) }] };
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
    deleteEmployee(id);
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
  "List payroll runs",
  {
    project_id: z.string().optional().describe("Filter by project ID"),
    org_id: z.string().optional().describe("Filter by organization ID"),
    status: z.enum(["draft", "calculated", "approved", "processing", "completed", "cancelled"]).optional().describe("Filter by status"),
    limit: z.number().min(1).max(100).optional().describe("Max results"),
  },
  async ({ project_id, org_id, status, limit }) => {
    const runs = listPayrollRuns({ project_id, org_id, status, limit });
    return { content: [{ type: "text", text: JSON.stringify(runs, null, 2) }] };
  }
);

server.tool(
  "calculate_payroll",
  "Calculate payroll for a run",
  {
    id: z.string().describe("Payroll run ID"),
  },
  async ({ id }) => {
    const run = calculatePayrollRun(id);
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
    const run = updatePayrollRun(id, { status, approved_by, approved_at: approved_by ? new Date().toISOString() : undefined, version });
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
    return { content: [{ type: "text", text: JSON.stringify(request, null, 2) }] };
  }
);

server.tool(
  "reject_pto_request",
  "Reject a PTO request",
  { id: z.string().describe("PTO request ID") },
  async ({ id }) => {
    const request = rejectPTORequest(id);
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
  },
  async ({ employee_id, period_start, period_end }) => {
    const emp = getEmployee(employee_id);
    if (!emp) return { content: [{ type: "text", text: JSON.stringify({ error: "Employee not found" }) }] };

    // Calculate base salary for period
    const baseSalary = emp.base_salary || 0;
    const monthlyRate = baseSalary / 12;
    const periodGross = monthlyRate;

    // Get bonuses for period
    const bonuses = listBonuses({ employee_id });
    const periodBonuses = bonuses.filter(b =>
      b.effective_date >= period_start && b.effective_date <= period_end
    );
    const bonusTotal = periodBonuses.reduce((sum, b) => sum + b.amount, 0);

    const totalGross = periodGross + bonusTotal;

    // Simple tax calculation (25% flat for demo - should use fiscal zone rules)
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
