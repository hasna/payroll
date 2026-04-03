# @hasna/open-payroll

Open-source payroll management system for AI agents — CLI + MCP server + web dashboard.

## Overview

`@hasna/open-payroll` is a universal payroll management system designed for AI coding agents. It provides a complete solution for managing employees, running payroll calculations, and generating reports across multiple organizations and fiscal zones.

## Features

- **CLI** — Full command-line interface for all payroll operations
- **MCP Server** — Exposes all tools via Model Context Protocol for AI agents
- **Web Dashboard** — React-based UI for visual payroll management
- **TypeScript SDK** — Library for programmatic access
- **Multi-Org Support** — Manage payroll for multiple companies
- **Fiscal Zones** — Country-specific tax rules and deductions

## Installation

```bash
# Install globally
bun install -g @hasna/open-payroll

# Or use via bunx
bunx @hasna/open-payroll
```

## Quick Start

### CLI

```bash
# Add an employee
payroll employee:add --first-name "John" --last-name "Doe" --email "john@company.com" --salary 100000

# List employees
payroll employee:list

# Create a payroll run
payroll payroll:run --start 2026-01-01 --end 2026-01-31

# Calculate payroll
payroll payroll:calculate <run-id>
```

### MCP Server

```bash
# Start the MCP server
payroll-mcp
```

Then configure in your AI agent to use the `payroll` MCP server.

## Architecture

```
open-payroll/
├── src/
│   ├── cli/          # Command-line interface
│   ├── db/           # SQLite database layer
│   ├── mcp/          # MCP server implementation
│   ├── lib/           # Business logic
│   └── types/         # TypeScript types
├── dashboard/        # React web dashboard
└── sdk/              # TypeScript SDK
```

## Configuration

Database location: `~/.hasna/payroll/payroll.db`

Environment variables:
- `PAYROLL_DB_PATH` — Custom database path
- `HASNA_PAYROLL_DB_PATH` — Override database path

## Commands

### Employee Management

| Command | Description |
|---------|-------------|
| `employee:add` | Add a new employee |
| `employee:list` | List employees |
| `employee:show` | Show employee details |
| `employee:update` | Update employee |
| `employee:delete` | Delete employee |

### Payroll Operations

| Command | Description |
|---------|-------------|
| `payroll:run` | Manage payroll runs |
| `payroll:calculate` | Calculate payroll for a run |

### Utility

| Command | Description |
|---------|-------------|
| `count` | Show employee count by status |

## MCP Tools

### Employee Tools

- `create_employee` — Create a new employee
- `get_employee` — Get employee by ID
- `list_employees` — List employees with filters
- `update_employee` — Update employee
- `delete_employee` — Delete employee
- `count_employees` — Count employees

### Payroll Run Tools

- `create_payroll_run` — Create a new payroll run
- `get_payroll_run` — Get payroll run by ID
- `list_payroll_runs` — List payroll runs
- `calculate_payroll` — Calculate payroll for a run
- `update_payroll_run` — Update payroll run
- `delete_payroll_run` — Delete payroll run

### Summary Tools

- `get_payroll_summary` — Get payroll summary

## Supported Fiscal Zones

- Romania (RO) — Income tax, social contributions
- United States (US) — Federal tax, state tax, Social Security, Medicare

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Run CLI
bun run dev:cli

# Run MCP server
bun run dev:mcp

# Run dashboard
cd dashboard && bun run dev
```

## License

Apache-2.0 — See LICENSE file.
