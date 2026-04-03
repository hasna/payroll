// Employee types
export type EmploymentType = "full-time" | "part-time" | "contractor" | "intern";
export type EmployeeStatus = "active" | "inactive" | "terminated";
export type PaymentMethod = "bank_transfer" | "check" | "cash" | "crypto";
export type Currency = "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "other";

// Payroll run types
export type PayrollRunStatus = "draft" | "calculated" | "approved" | "processing" | "completed" | "cancelled";

// Component types
export type SalaryComponentType = "base" | "bonus" | "overtime" | "commission" | "allowance" | "reimbursement" | "other";
export type ComponentPeriod = "hourly" | "daily" | "weekly" | "biweekly" | "monthly" | "one-time";

// Deduction types
export type DeductionType = "federal_tax" | "state_tax" | "social_security" | "medicare" | "health_insurance" | "dental_insurance" | "vision_insurance" | "401k" | "hsa" | "fsa" | "other";

// Payment types
export type PaymentStatus = "pending" | "processed" | "failed" | "cancelled";

// Interfaces
export interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  project_id?: string;
  org_id?: string;
  employee_number?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  department?: string;
  position?: string;
  hire_date?: string;
  employment_type: EmploymentType;
  status: EmployeeStatus;
  base_salary?: number;
  hourly_rate?: number;
  currency: Currency;
  payment_method: PaymentMethod;
  bank_account?: string;
  tax_id?: string;
  tags: string[];
  metadata: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
  terminated_at?: string;
}

export interface PayrollRun {
  id: string;
  project_id?: string;
  org_id?: string;
  period_start: string;
  period_end: string;
  run_date: string;
  status: PayrollRunStatus;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  total_employees: number;
  processed_by?: string;
  approved_by?: string;
  approved_at?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SalaryComponent {
  id: string;
  employee_id: string;
  payroll_run_id?: string;
  component_type: SalaryComponentType;
  name: string;
  amount: number;
  taxable: boolean;
  recurring: boolean;
  period?: ComponentPeriod;
  effective_from?: string;
  effective_to?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Deduction {
  id: string;
  employee_id: string;
  payroll_run_id?: string;
  deduction_type: DeductionType;
  name: string;
  amount: number;
  pre_tax: boolean;
  employer_match?: number;
  effective_from?: string;
  effective_to?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Payment {
  id: string;
  employee_id: string;
  payroll_run_id: string;
  gross_amount: number;
  deductions_amount: number;
  net_amount: number;
  payment_date?: string;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  transaction_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Org {
  id: string;
  project_id?: string;
  name: string;
  legal_name?: string;
  tax_id?: string;
  address?: string;
  city?: string;
  state?: string;
  country: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  website?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  last_seen_at: string;
}

export interface TaskList {
  id: string;
  project_id?: string;
  slug: string;
  name: string;
  description?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Filter types
export interface EmployeeFilter {
  project_id?: string;
  org_id?: string;
  status?: EmployeeStatus | EmployeeStatus[];
  department?: string;
  tags?: string[];
  search?: string;
  limit?: number;
}

export interface PayrollRunFilter {
  project_id?: string;
  org_id?: string;
  status?: PayrollRunStatus;
  period_start?: string;
  period_end?: string;
  limit?: number;
}

export interface PaymentFilter {
  employee_id?: string;
  payroll_run_id?: string;
  payment_status?: PaymentStatus;
  limit?: number;
}

// Error classes
export class EmployeeNotFoundError extends Error {
  static code = "EMPLOYEE_NOT_FOUND";
  static suggestion = "Check the employee ID and try again";

  constructor(id: string) {
    super(`Employee not found: ${id}`);
    this.name = "EmployeeNotFoundError";
  }
}

export class PayrollRunNotFoundError extends Error {
  static code = "PAYROLL_RUN_NOT_FOUND";
  static suggestion = "Check the payroll run ID and try again";

  constructor(id: string) {
    super(`Payroll run not found: ${id}`);
    this.name = "PayrollRunNotFoundError";
  }
}

export class ProjectNotFoundError extends Error {
  static code = "PROJECT_NOT_FOUND";
  static suggestion = "Check the project ID and try again";

  constructor(id: string) {
    super(`Project not found: ${id}`);
    this.name = "ProjectNotFoundError";
  }
}

export class LockError extends Error {
  static code = "LOCK_ERROR";
  static suggestion = "Release the lock before proceeding";

  constructor(resource: string) {
    super(`Resource is locked: ${resource}`);
    this.name = "LockError";
  }
}

export class ValidationError extends Error {
  static code = "VALIDATION_ERROR";
  static suggestion = "Check the input data and try again";

  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
