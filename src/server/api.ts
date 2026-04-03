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