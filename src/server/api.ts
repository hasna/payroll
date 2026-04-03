#!/usr/bin/env bun
import express from "express";
import { listEmployees, createEmployee } from "../db/employees.js";
import { listPayrollRuns } from "../db/payroll-runs.js";
import { getDatabase } from "../db/database.js";

const app = express();
const PORT = process.env.PORT || 3010;

app.use(express.json());

// CORS for dashboard
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Get all employees
app.get("/api/employees", (req, res) => {
  try {
    const employees = listEmployees();
    res.json(employees);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get all payroll runs
app.get("/api/payroll-runs", (req, res) => {
  try {
    const runs = listPayrollRuns();
    res.json(runs);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Create employee
app.post("/api/employees", (req, res) => {
  try {
    const employee = createEmployee(req.body);
    res.status(201).json(employee);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get dashboard stats
app.get("/api/stats", (req, res) => {
  try {
    const db = getDatabase();
    const empCount = db.query("SELECT COUNT(*) as count FROM employees WHERE status = 'active'").get() as { count: number };
    const runCount = db.query("SELECT COUNT(*) as count FROM payroll_runs").get() as { count: number };
    res.json({
      activeEmployees: empCount.count,
      totalPayrollRuns: runCount.count,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get dashboard chart data
app.get("/api/dashboard", (req, res) => {
  try {
    const db = getDatabase();

    // Payroll trend (last 12 runs)
    const payrollTrend = db.query(`
      SELECT period_start, period_end, total_gross, total_deductions, total_net, total_employees, status
      FROM payroll_runs ORDER BY run_date DESC LIMIT 12
    `).all().map((r: Record<string, unknown>) => ({
      period: `${r.period_start} - ${r.period_end}`,
      gross: r.total_gross,
      net: r.total_net,
      employees: r.total_employees,
      status: r.status,
    }));

    // Department breakdown
    const deptBreakdown = db.query(`
      SELECT department, COUNT(*) as count FROM employees
      WHERE department IS NOT NULL AND status = 'active'
      GROUP BY department ORDER BY count DESC
    `).all().map((r: Record<string, unknown>) => ({
      department: r.department || "Unassigned",
      count: r.count,
    }));

    // Status breakdown
    const statusBreakdown = db.query(`
      SELECT status, COUNT(*) as count FROM employees GROUP BY status
    `).all().map((r: Record<string, unknown>) => ({
      status: r.status,
      count: r.count,
    }));

    // PTO summary
    const ptoSummary = db.query(`
      SELECT pto_type, SUM(total_days) as total, SUM(used_days) as used
      FROM pto_balances GROUP BY pto_type
    `).all().map((r: Record<string, unknown>) => ({
      type: r.pto_type,
      total: r.total,
      used: r.used,
      remaining: (r.total as number) - (r.used as number),
    }));

    // Monthly payroll totals
    const monthlyPayroll = db.query(`
      SELECT strftime('%Y-%m', period_end) as month,
             SUM(total_gross) as gross, SUM(total_net) as net, SUM(total_employees) as employees
      FROM payroll_runs WHERE status = 'completed'
      GROUP BY month ORDER BY month DESC LIMIT 12
    `).all().map((r: Record<string, unknown>) => ({
      month: r.month,
      gross: r.gross,
      net: r.net,
      employees: r.employees,
    }));

    res.json({ payrollTrend, deptBreakdown, statusBreakdown, ptoSummary, monthlyPayroll });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  try {
    const db = getDatabase();
    db.query("SELECT 1").get();
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: "unhealthy", error: String(error) });
  }
});

app.listen(PORT, () => {
  console.log(`Payroll API server running on http://localhost:${PORT}`);
});