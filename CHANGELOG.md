# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2026-04-03

### Added

- Initial release
- CLI with employee management (add, list, show, update, delete)
- CLI with payroll run management (create, calculate)
- SQLite database layer with employee and payroll run tables
- MCP server with 14 tools for AI agents
- TypeScript SDK (PayrollClient)
- React web dashboard with employee and payroll tabs
- Multi-org support (orgs table)
- Fiscal zone architecture

### Features

- Employee CRUD operations
- Payroll run creation and calculation
- Multiple payment methods (bank_transfer, check, cash, crypto)
- Currency support (USD, EUR, GBP, etc.)
- Employment types (full-time, part-time, contractor, intern)
- Salary components (base, bonus, overtime, commission, allowance)
- Deductions (taxes, insurance, 401k, HSA, FSA)

### Commands

- `employee:add` - Add new employee
- `employee:list` - List employees
- `employee:show` - Show employee details
- `employee:update` - Update employee
- `employee:delete` - Delete employee
- `payroll:run` - Manage payroll runs
- `payroll:calculate` - Calculate payroll
- `count` - Employee count by status

### MCP Tools

- create_employee, get_employee, list_employees, update_employee, delete_employee
- create_payroll_run, get_payroll_run, list_payroll_runs, calculate_payroll
- update_payroll_run, delete_payroll_run
- get_payroll_summary, count_employees
