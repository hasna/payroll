import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getEmployee } from "../db/employees.js";
import { getPayrollRun } from "../db/payroll-runs.js";
import { listBonuses } from "../db/bonuses.js";
import { getDatabase } from "../db/database.js";
import type { Employee, PayrollRun } from "../types/index.js";

interface PayslipData {
  employee: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    department: string;
    position: string;
  };
  payroll_run: {
    id: string;
    period_start: string;
    period_end: string;
    run_date: string;
    status: string;
  };
  earnings: Array<{ description: string; amount: number }>;
  deductions: Array<{ description: string; amount: number }>;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  payment_date: string;
  organization?: string;
}

export async function generatePayslip(data: PayslipData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const gray = rgb(0.5, 0.5, 0.5);
  const darkGray = rgb(0.2, 0.2, 0.2);
  const blue = rgb(0.1, 0.3, 0.7);
  const lightBlue = rgb(0.9, 0.95, 1.0);

  // Header
  page.drawRectangle({ x: 0, y: height - 120, width, height: 120, color: blue });
  page.drawText("PAYSLIP", { x: 50, y: height - 60, size: 28, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText(data.organization || "Open Payroll", { x: 50, y: height - 85, size: 12, font, color: rgb(0.8, 0.9, 1) });
  page.drawText(`Pay Period: ${data.payroll_run.period_start} to ${data.payroll_run.period_end}`, { x: 380, y: height - 60, size: 10, font, color: rgb(1, 1, 1) });
  page.drawText(`Pay Date: ${data.payment_date}`, { x: 380, y: height - 75, size: 10, font, color: rgb(1, 1, 1) });

  // Employee Info Box
  page.drawRectangle({ x: 40, y: height - 210, width: width - 80, height: 75, color: lightBlue, borderColor: gray, borderWidth: 0.5 });
  const empY = height - 155;
  page.drawText("Employee", { x: 55, y: empY, size: 8, font, color: gray });
  page.drawText(`${data.employee.first_name} ${data.employee.last_name}`, { x: 55, y: empY - 15, size: 11, font: boldFont, color: darkGray });
  page.drawText(data.employee.email, { x: 55, y: empY - 30, size: 9, font, color: gray });

  page.drawText("Department", { x: 250, y: empY, size: 8, font, color: gray });
  page.drawText(data.employee.department || "-", { x: 250, y: empY - 15, size: 10, font, color: darkGray });

  page.drawText("Position", { x: 380, y: empY, size: 8, font, color: gray });
  page.drawText(data.employee.position || "-", { x: 380, y: empY - 15, size: 10, font, color: darkGray });

  page.drawText("Run ID", { x: 500, y: empY, size: 8, font, color: gray });
  page.drawText(data.payroll_run.id.slice(0, 12) + "...", { x: 500, y: empY - 15, size: 9, font, color: darkGray });

  // Earnings table
  const tableY = height - 240;
  page.drawText("EARNINGS", { x: 50, y: tableY, size: 10, font: boldFont, color: blue });

  let y = tableY - 20;
  page.drawText("Description", { x: 50, y, size: 9, font: boldFont, color: gray });
  page.drawText("Amount", { x: 450, y, size: 9, font: boldFont, color: gray });

  for (const earning of data.earnings) {
    y -= 18;
    page.drawText(earning.description, { x: 50, y, size: 10, font, color: darkGray });
    page.drawText(`$${earning.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, { x: 450, y, size: 10, font, color: darkGray });
  }

  y -= 10;
  page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: gray });

  y -= 18;
  page.drawText("Gross Pay", { x: 50, y, size: 10, font: boldFont, color: darkGray });
  page.drawText(`$${data.gross_pay.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, { x: 450, y, size: 11, font: boldFont, color: darkGray });

  // Deductions table
  y -= 35;
  page.drawText("DEDUCTIONS", { x: 50, y, size: 10, font: boldFont, color: rgb(0.7, 0.1, 0.1) });

  y -= 20;
  page.drawText("Description", { x: 50, y, size: 9, font: boldFont, color: gray });
  page.drawText("Amount", { x: 450, y, size: 9, font: boldFont, color: gray });

  for (const ded of data.deductions) {
    y -= 18;
    page.drawText(ded.description, { x: 50, y, size: 10, font, color: darkGray });
    page.drawText(`-$${ded.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, { x: 450, y, size: 10, font, color: rgb(0.7, 0.1, 0.1) });
  }

  y -= 10;
  page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: gray });

  y -= 18;
  page.drawText("Total Deductions", { x: 50, y, size: 10, font: boldFont, color: darkGray });
  page.drawText(`-$${data.total_deductions.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, { x: 450, y, size: 11, font: boldFont, color: rgb(0.7, 0.1, 0.1) });

  // Net Pay Box
  y -= 40;
  page.drawRectangle({ x: 350, y: y - 5, width: 195, height: 40, color: blue });
  page.drawText("NET PAY", { x: 360, y: y + 15, size: 10, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText(`$${data.net_pay.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, { x: 360, y: y - 5, size: 18, font: boldFont, color: rgb(1, 1, 1) });

  // Footer
  page.drawLine({ start: { x: 40, y: 60 }, end: { x: width - 40, y: 60 }, thickness: 0.5, color: gray });
  page.drawText("This payslip is generated by Open Payroll. For questions, contact your HR department.", { x: 50, y: 40, size: 8, font, color: gray });

  return pdfDoc.save();
}

export async function generatePayslipForRun(payrollRunId: string, employeeId: string): Promise<Uint8Array> {
  const db = getDatabase();
  const emp = getEmployee(employeeId);
  const run = getPayrollRun(payrollRunId);

  if (!emp || !run) {
    throw new Error("Employee or payroll run not found");
  }

  // Get salary components
  const components = db.query(`
    SELECT * FROM salary_components
    WHERE employee_id = ? AND (payroll_run_id = ? OR (payroll_run_id IS NULL AND recurring = 1))
  `).all(employeeId, payrollRunId) as Array<{ component_type: string; amount: number; taxable: number }>;

  const earnings: Array<{ description: string; amount: number }> = [];

  // Base salary
  if (emp.base_salary) {
    const monthlyBase = (emp.base_salary || 0) / 12;
    earnings.push({ description: "Base Salary", amount: monthlyBase });
  }

  // Salary components
  for (const comp of components) {
    earnings.push({ description: comp.component_type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()), amount: comp.amount });
  }

  // Bonuses
  const bonuses = listBonuses({ employee_id: employeeId, payroll_run_id: payrollRunId });
  for (const bonus of bonuses) {
    earnings.push({ description: `${bonus.bonus_type} Bonus`, amount: bonus.amount });
  }

  // Deductions
  const deductions: Array<{ description: string; amount: number }> = [];
  const dedRows = db.query(`
    SELECT * FROM deductions WHERE employee_id = ? AND (payroll_run_id = ? OR payroll_run_id IS NULL)
  `).all(employeeId, payrollRunId) as Array<{ deduction_type: string; amount: number; pre_tax: number }>;

  for (const ded of dedRows) {
    deductions.push({ description: ded.deduction_type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()), amount: ded.amount });
  }

  const grossPay = earnings.reduce((s, e) => s + e.amount, 0);
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);

  return generatePayslip({
    employee: {
      id: emp.id,
      first_name: emp.first_name,
      last_name: emp.last_name,
      email: emp.email || "",
      department: emp.department || "",
      position: emp.position || "",
    },
    payroll_run: {
      id: run.id,
      period_start: run.period_start,
      period_end: run.period_end,
      run_date: run.run_date,
      status: run.status,
    },
    earnings,
    deductions,
    gross_pay: grossPay,
    total_deductions: totalDeductions,
    net_pay: grossPay - totalDeductions,
    payment_date: run.run_date,
  });
}
