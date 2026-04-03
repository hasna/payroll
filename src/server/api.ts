#!/usr/bin/env bun
import express from "express";
import { listEmployees, createEmployee, getEmployee } from "../db/employees.js";
import { listPayrollRuns } from "../db/payroll-runs.js";
import { getDatabase } from "../db/database.js";
import { rateLimitMiddleware } from "../lib/rate-limit.js";

const app = express();
const PORT = process.env.PORT || 3010;
const API_KEY = process.env.API_KEY;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:5174").split(",").map(s => s.trim());

app.use(express.json());

// Sanitized error response helper
function safeError(error: unknown): string {
  if (error instanceof Error) {
    // Don't leak internal stack traces or implementation details
    return error.message;
  }
  return "An unexpected error occurred";
}

// CORS with restricted origins
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// API key authentication middleware (optional - only required if API_KEY is set)
app.use((req, res, next) => {
  // Skip auth for health check and rate limit info
  if (req.path === "/api/health" || req.path === "/api/rate-limit") {
    return next();
  }

  if (API_KEY) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.slice(7) !== API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }
  next();
});

// Rate limiting: 100 requests per minute
const limiter = rateLimitMiddleware({ windowMs: 60 * 1000, maxRequests: 100 });
app.use(limiter);

// Health check (no auth required)
app.get("/api/health", (req, res) => {
  try {
    const db = getDatabase();
    db.query("SELECT 1").get();
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "unhealthy", error: "Database unavailable" });
  }
});

// Rate limit info (no auth required)
app.get("/api/rate-limit", (req, res) => {
  res.json({
    window_ms: 60000,
    max_requests: 100,
    info: "Rate limit headers (X-RateLimit-*) are included in all responses",
  });
});

// Get all employees
app.get("/api/employees", (req, res) => {
  try {
    const employees = listEmployees();
    res.json(employees);
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({ error: safeError(error) });
  }
});

// Get all payroll runs
app.get("/api/payroll-runs", (req, res) => {
  try {
    const runs = listPayrollRuns();
    res.json(runs);
  } catch (error) {
    console.error("Error fetching payroll runs:", error);
    res.status(500).json({ error: safeError(error) });
  }
});

// Create employee
app.post("/api/employees", (req, res) => {
  try {
    const employee = createEmployee(req.body);
    res.status(201).json(employee);
  } catch (error) {
    console.error("Error creating employee:", error);
    res.status(500).json({ error: safeError(error) });
  }
});

// Get employee by ID (portal)
app.get("/api/employees/:id", (req, res) => {
  try {
    const emp = getEmployee(req.params.id);
    if (!emp) return res.status(404).json({ error: "Employee not found" });
    res.json(emp);
  } catch (error) {
    console.error("Error fetching employee:", error);
    res.status(500).json({ error: safeError(error) });
  }
});

// Get employee PTO balances (portal)
app.get("/api/employees/:id/pto", (req, res) => {
  try {
    const db = getDatabase();
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const balances = db.query(`
      SELECT * FROM pto_balances WHERE employee_id = ? AND year = ?
    `).all(req.params.id, year);
    res.json(balances);
  } catch (error) {
    console.error("Error fetching PTO balances:", error);
    res.status(500).json({ error: safeError(error) });
  }
});

// Get employee payroll history (portal)
app.get("/api/employees/:id/payroll", (req, res) => {
  try {
    const db = getDatabase();
    const runs = db.query(`
      SELECT pr.period_start, pr.period_end, pr.total_gross, pr.total_net, pr.status
      FROM payroll_runs pr
      JOIN employees e ON e.project_id = pr.project_id
      WHERE e.id = ? ORDER BY pr.run_date DESC LIMIT 24
    `).all(req.params.id);
    res.json(runs);
  } catch (error) {
    console.error("Error fetching payroll history:", error);
    res.status(500).json({ error: safeError(error) });
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
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: safeError(error) });
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
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({ error: safeError(error) });
  }
});

app.listen(PORT, () => {
  console.log(`Payroll API server running on http://localhost:${PORT}`);
  if (API_KEY) {
    console.log("API key authentication: ENABLED");
  } else {
    console.log("WARNING: API key authentication is DISABLED (set API_KEY env var to enable)");
  }
  console.log(`CORS origins: ${CORS_ORIGINS.join(", ")}`);
});
