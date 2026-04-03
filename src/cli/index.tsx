#!/usr/bin/env bun
import { Command } from "commander";
import chalk from "chalk";
import { getDatabase, resolvePartialId, generateId } from "../db/database.js";
import {
  createEmployee,
  getEmployee,
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
import { exportEmployeesCSV, exportPayrollRunsCSV, exportEmployeeReportCSV } from "../lib/csv.js";
import type { Employee, EmployeeStatus, EmployeeFilter } from "../types/index.js";

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function getPackageVersion(): string {
  try {
    const __dir = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(__dir, "..", "..", "package.json");
    return JSON.parse(readFileSync(pkgPath, "utf-8")).version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const program = new Command();

// Helpers
function handleError(e: unknown): never {
  const globalOpts = program.opts();
  if (globalOpts.json) {
    console.log(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  } else {
    console.error(chalk.red(e instanceof Error ? e.message : String(e)));
  }
  process.exit(1);
}

function resolveEmployeeId(partialId: string): string {
  const db = getDatabase();
  const id = resolvePartialId(db, "employees", partialId);
  if (!id) {
    const similar = db.query("SELECT id FROM employees WHERE id LIKE ? LIMIT 3").all(`%${partialId}%`) as { id: string }[];
    if (similar.length > 0) {
      console.error(chalk.red(`Could not resolve employee ID: ${partialId}`));
      console.error(chalk.dim(`Did you mean: ${similar.map(s => s.id.slice(0, 8)).join(", ")}?`));
    } else {
      console.error(chalk.red(`Could not resolve employee ID: ${partialId}`));
    }
    process.exit(1);
  }
  return id;
}

function resolvePayrollRunId(partialId: string): string {
  const db = getDatabase();
  const id = resolvePartialId(db, "payroll_runs", partialId);
  if (!id) {
    const similar = db.query("SELECT id FROM payroll_runs WHERE id LIKE ? LIMIT 3").all(`%${partialId}%`) as { id: string }[];
    if (similar.length > 0) {
      console.error(chalk.red(`Could not resolve payroll run ID: ${partialId}`));
      console.error(chalk.dim(`Did you mean: ${similar.map(s => s.id.slice(0, 8)).join(", ")}?`));
    } else {
      console.error(chalk.red(`Could not resolve payroll run ID: ${partialId}`));
    }
    process.exit(1);
  }
  return id;
}

function output(data: unknown, jsonMode: boolean): void {
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
  }
}

const statusColors: Record<string, (s: string) => string> = {
  active: chalk.green,
  inactive: chalk.yellow,
  terminated: chalk.red,
  draft: chalk.gray,
  calculated: chalk.blue,
  approved: chalk.cyan,
  processing: chalk.yellow,
  completed: chalk.green,
  cancelled: chalk.gray,
  pending: chalk.yellow,
  processed: chalk.green,
  failed: chalk.red,
};

function formatEmployeeLine(e: Employee): string {
  const statusFn = statusColors[e.status] || chalk.white;
  const name = `${e.first_name} ${e.last_name}`;
  const salary = e.base_salary ? chalk.cyan(`$${e.base_salary.toLocaleString()}`) : (e.hourly_rate ? chalk.cyan(`$${e.hourly_rate}/hr`) : "");
  return `${chalk.dim(e.id.slice(0, 8))} ${statusFn(e.status.padEnd(11))} ${name.padEnd(30)} ${e.department || ""} ${salary}`;
}

// Global options
program
  .name("payroll")
  .description("Open-source payroll management for AI agents")
  .version(getPackageVersion())
  .option("--project <path>", "Project path")
  .option("--json", "Output as JSON")
  .option("--agent <name>", "Agent name");

// === COMMANDS ===

// employee add
program
  .command("employee:add")
  .description("Add a new employee")
  .requiredOption("--first-name <name>", "First name")
  .requiredOption("--last-name <name>", "Last name")
  .option("--email <email>", "Email address")
  .option("--phone <phone>", "Phone number")
  .option("--department <dept>", "Department")
  .option("--position <pos>", "Position/Title")
  .option("--salary <amount>", "Base salary")
  .option("--hourly-rate <rate>", "Hourly rate")
  .option("--currency <curr>", "Currency", "USD")
  .option("--payment-method <method>", "Payment method", "bank_transfer")
  .option("--employee-number <num>", "Employee number")
  .action((opts) => {
    const globalOpts = program.opts();
    try {
      const employee = createEmployee({
        first_name: opts.firstName,
        last_name: opts.lastName,
        email: opts.email,
        phone: opts.phone,
        department: opts.department,
        position: opts.position,
        base_salary: opts.salary ? parseFloat(opts.salary) : undefined,
        hourly_rate: opts.hourlyRate ? parseFloat(opts.hourlyRate) : undefined,
        currency: opts.currency,
        payment_method: opts.paymentMethod,
        employee_number: opts.employeeNumber,
      });

      if (globalOpts.json) {
        output(employee, true);
      } else {
        console.log(chalk.green("Employee created:"));
        console.log(formatEmployeeLine(employee));
      }
    } catch (e) {
      handleError(e);
    }
  });

// employee list
program
  .command("employee:list")
  .description("List employees")
  .option("-s, --status <status>", "Filter by status")
  .option("-d, --department <dept>", "Filter by department")
  .option("-a, --all", "Show all employees (including terminated)")
  .option("--search <query>", "Search by name/email")
  .option("--limit <n>", "Max employees to return")
  .action((opts) => {
    const globalOpts = program.opts();
    try {
      const filter: EmployeeFilter = {};
      if (!opts.all) {
        filter.status = ["active", "inactive"];
      } else if (opts.status) {
        filter.status = opts.status as EmployeeStatus;
      }
      if (opts.department) filter.department = opts.department;
      if (opts.search) filter.search = opts.search;
      if (opts.limit) filter.limit = parseInt(opts.limit, 10);

      const employees = listEmployees(filter);

      if (globalOpts.json) {
        output(employees, true);
      } else {
        console.log(chalk.bold(`\nEmployees (${employees.length}):\n`));
        for (const emp of employees) {
          console.log(formatEmployeeLine(emp));
        }
      }
    } catch (e) {
      handleError(e);
    }
  });

// employee show
program
  .command("employee:show <id>")
  .description("Show employee details")
  .action((id: string) => {
    const globalOpts = program.opts();
    try {
      const resolvedId = resolveEmployeeId(id);
      const employee = getEmployee(resolvedId);

      if (!employee) {
        console.error(chalk.red(`Employee not found: ${id}`));
        process.exit(1);
      }

      if (globalOpts.json) {
        output(employee, true);
        return;
      }

      console.log(chalk.bold("\nEmployee Details:\n"));
      console.log(`  ${chalk.dim("ID:")}           ${employee.id}`);
      console.log(`  ${chalk.dim("Name:")}         ${employee.first_name} ${employee.last_name}`);
      console.log(`  ${chalk.dim("Email:")}        ${employee.email || "-"}`);
      console.log(`  ${chalk.dim("Phone:")}        ${employee.phone || "-"}`);
      console.log(`  ${chalk.dim("Department:")}   ${employee.department || "-"}`);
      console.log(`  ${chalk.dim("Position:")}     ${employee.position || "-"}`);
      console.log(`  ${chalk.dim("Status:")}       ${(statusColors[employee.status] || chalk.white)(employee.status)}`);
      console.log(`  ${chalk.dim("Type:")}        ${employee.employment_type}`);
      if (employee.base_salary) console.log(`  ${chalk.dim("Salary:")}      $${employee.base_salary.toLocaleString()}`);
      if (employee.hourly_rate) console.log(`  ${chalk.dim("Hourly:")}      $${employee.hourly_rate}/hr`);
      console.log(`  ${chalk.dim("Currency:")}     ${employee.currency}`);
      console.log(`  ${chalk.dim("Payment:")}      ${employee.payment_method}`);
      if (employee.hire_date) console.log(`  ${chalk.dim("Hire Date:")}    ${employee.hire_date}`);
      console.log(`  ${chalk.dim("Created:")}      ${employee.created_at}`);
    } catch (e) {
      handleError(e);
    }
  });

// employee update
program
  .command("employee:update <id>")
  .description("Update an employee")
  .option("--first-name <name>", "First name")
  .option("--last-name <name>", "Last name")
  .option("--email <email>", "Email address")
  .option("--department <dept>", "Department")
  .option("--position <pos>", "Position")
  .option("--salary <amount>", "Base salary")
  .option("--status <status>", "Status: active, inactive, terminated")
  .action((id: string, opts) => {
    const globalOpts = program.opts();
    try {
      const resolvedId = resolveEmployeeId(id);
      const existing = getEmployee(resolvedId);
      if (!existing) {
        console.error(chalk.red(`Employee not found: ${id}`));
        process.exit(1);
      }

      const employee = updateEmployee(resolvedId, {
        first_name: opts.firstName,
        last_name: opts.lastName,
        email: opts.email,
        department: opts.department,
        position: opts.position,
        base_salary: opts.salary ? parseFloat(opts.salary) : undefined,
        status: opts.status as EmployeeStatus,
        version: existing.version,
      });

      if (globalOpts.json) {
        output(employee, true);
      } else {
        console.log(chalk.green("Employee updated:"));
        console.log(formatEmployeeLine(employee));
      }
    } catch (e) {
      handleError(e);
    }
  });

// employee delete
program
  .command("employee:delete <id>")
  .description("Delete an employee")
  .action((id: string) => {
    const globalOpts = program.opts();
    try {
      const resolvedId = resolveEmployeeId(id);
      deleteEmployee(resolvedId);
      if (!globalOpts.json) {
        console.log(chalk.green(`Employee deleted: ${id.slice(0, 8)}`));
      }
    } catch (e) {
      handleError(e);
    }
  });

// payroll:run create
program
  .command("payroll:run")
  .description("Manage payroll runs")
  .option("--start <date>", "Period start date (YYYY-MM-DD)")
  .option("--end <date>", "Period end date (YYYY-MM-DD)")
  .option("--status <status>", "Filter by status")
  .action(async (opts) => {
    const globalOpts = program.opts();
    try {
      if (opts.start && opts.end) {
        const run = createPayrollRun({
          period_start: opts.start,
          period_end: opts.end,
        });

        if (globalOpts.json) {
          output(run, true);
        } else {
          console.log(chalk.green("Payroll run created:"));
          console.log(`  ${chalk.dim("ID:")}     ${run.id}`);
          console.log(`  ${chalk.dim("Period:")} ${run.period_start} - ${run.period_end}`);
          console.log(`  ${chalk.dim("Status:")} ${run.status}`);
        }
      } else {
        // List runs
        const runs = listPayrollRuns({
          status: opts.status as any,
        });

        if (globalOpts.json) {
          output(runs, true);
        } else {
          console.log(chalk.bold(`\nPayroll Runs (${runs.length}):\n`));
          for (const run of runs) {
            const statusFn = statusColors[run.status] || chalk.white;
            console.log(`${chalk.dim(run.id.slice(0, 8))} ${statusFn(run.status.padEnd(11))} ${run.period_start} - ${run.period_end} ${run.total_employees} employees`);
          }
        }
      }
    } catch (e) {
      handleError(e);
    }
  });

// payroll:calculate
program
  .command("payroll:calculate <run-id>")
  .description("Calculate payroll for a run")
  .action((runId: string, opts) => {
    const globalOpts = program.opts();
    try {
      const resolvedId = resolvePayrollRunId(runId);
      const run = calculatePayrollRun(resolvedId);

      if (globalOpts.json) {
        output(run, true);
      } else {
        console.log(chalk.green("Payroll calculated:"));
        console.log(`  ${chalk.dim("Total Gross:")}    $${run.total_gross.toLocaleString()}`);
        console.log(`  ${chalk.dim("Total Deductions:")} $${run.total_deductions.toLocaleString()}`);
        console.log(`  ${chalk.dim("Total Net:")}      $${run.total_net.toLocaleString()}`);
        console.log(`  ${chalk.dim("Employees:")}     ${run.total_employees}`);
      }
    } catch (e) {
      handleError(e);
    }
  });

// count
program
  .command("count")
  .description("Show employee count by status")
  .action(() => {
    const globalOpts = program.opts();
    const all = listEmployees({});
    const counts: Record<string, number> = { total: all.length };
    for (const e of all) counts[e.status] = (counts[e.status] || 0) + 1;

    if (globalOpts.json) {
      output(counts, true);
    } else {
      const parts = [
        `total: ${chalk.bold(String(counts.total))}`,
        `active: ${chalk.green(String(counts.active || 0))}`,
        `inactive: ${chalk.yellow(String(counts.inactive || 0))}`,
        `terminated: ${chalk.red(String(counts.terminated || 0))}`,
      ];
      console.log(parts.join("  "));
    }
  });

// export csv
program
  .command("export:employees")
  .description("Export employees to CSV")
  .action(() => {
    console.log(exportEmployeesCSV());
  });

program
  .command("export:payroll [startDate] [endDate]")
  .description("Export payroll runs to CSV (optional start/end dates)")
  .action((startDate?: string, endDate?: string) => {
    console.log(exportPayrollRunsCSV(startDate, endDate));
  });

program
  .command("export:employee <id>")
  .description("Export full employee report (CSV with PTO, bonuses)")
  .action((id: string) => {
    const resolvedId = resolveEmployeeId(id);
    console.log(exportEmployeeReportCSV(resolvedId));
  });

// Default action
program.action(() => {
  program.help();
});

program.parse();
