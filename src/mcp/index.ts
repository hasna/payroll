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
} from "../db/employees.js";
import {
  createPayrollRun,
  getPayrollRun,
  listPayrollRuns,
  updatePayrollRun,
  deletePayrollRun,
  calculatePayrollRun,
} from "../db/payroll-runs.js";
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

async function main() {
  const transport = new StdioServerTransport();
  await server.run(transport);
}

main().catch(console.error);
