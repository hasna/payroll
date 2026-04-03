/**
 * @hasna/payroll-sdk - TypeScript SDK for open-payroll
 * Works with Claude, Codex, Gemini, or any AI agent
 */

// Re-export types
export type {
  Employee,
  EmployeeStatus,
  EmploymentType,
  Currency,
  PaymentMethod,
  PayrollRun,
  PayrollRunStatus,
  SalaryComponent,
  Deduction,
  Payment,
  Org,
  EmployeeFilter,
  PayrollRunFilter,
} from "../../src/types/index.js";

// Re-export database functions
export {
  createEmployee,
  getEmployee,
  getEmployeeByEmail,
  listEmployees,
  updateEmployee,
  deleteEmployee,
  countEmployees,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
} from "../../src/db/employees.js";

export {
  createPayrollRun,
  getPayrollRun,
  listPayrollRuns,
  updatePayrollRun,
  deletePayrollRun,
  calculatePayrollRun,
  type CreatePayrollRunInput,
  type UpdatePayrollRunInput,
} from "../../src/db/payroll-runs.js";

export { getDatabase, generateId } from "../../src/db/database.js";

/**
 * PayrollClient - Main client for payroll operations
 */
export class PayrollClient {
  async createEmployee(input: {
    first_name: string;
    last_name: string;
    email?: string;
    department?: string;
    position?: string;
    base_salary?: number;
  }) {
    const { createEmployee } = await import("../../src/db/employees.js");
    return createEmployee(input);
  }

  async getEmployee(id: string) {
    const { getEmployee } = await import("../../src/db/employees.js");
    return getEmployee(id);
  }

  async listEmployees(filter?: {
    project_id?: string;
    status?: string;
    department?: string;
  }) {
    const { listEmployees } = await import("../../src/db/employees.js");
    return listEmployees(filter || {});
  }

  async updateEmployee(id: string, input: {
    first_name?: string;
    last_name?: string;
    department?: string;
    base_salary?: number;
    status?: string;
    version: number;
  }) {
    const { updateEmployee } = await import("../../src/db/employees.js");
    return updateEmployee(id, input);
  }

  async deleteEmployee(id: string) {
    const { deleteEmployee } = await import("../../src/db/employees.js");
    return deleteEmployee(id);
  }

  async createPayrollRun(input: {
    period_start: string;
    period_end: string;
    project_id?: string;
  }) {
    const { createPayrollRun } = await import("../../src/db/payroll-runs.js");
    return createPayrollRun(input);
  }

  async calculatePayroll(runId: string) {
    const { calculatePayrollRun } = await import("../../src/db/payroll-runs.js");
    return calculatePayrollRun(runId);
  }

  async listPayrollRuns(filter?: {
    project_id?: string;
    status?: string;
  }) {
    const { listPayrollRuns } = await import("../../src/db/payroll-runs.js");
    return listPayrollRuns(filter || {});
  }
}

export default PayrollClient;
