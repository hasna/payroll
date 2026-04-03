# AGENTS.md — Developer Guide for AI Agents

This document provides context for AI agents working on `@hasna/open-payroll`.

## Project Overview

Open-source payroll management system for AI agents — CLI + MCP server + web dashboard. Manages employees, payroll runs, salary calculations, and deductions across multiple organizations and fiscal zones.

## Tech Stack

- **Runtime**: Bun (ES modules)
- **Language**: TypeScript
- **Database**: SQLite (bun:sqlite)
- **CLI**: Commander + Ink (React TUI)
- **MCP**: @modelcontextprotocol/sdk
- **Dashboard**: React + Vite

## Directory Structure

```
open-payroll/
├── src/
│   ├── cli/index.tsx     # CLI with all commands
│   ├── db/
│   │   ├── database.ts   # SQLite setup + migrations
│   │   ├── employees.ts # Employee CRUD
│   │   └── payroll-runs.ts # Payroll run logic
│   ├── mcp/index.ts      # MCP server (14 tools)
│   ├── lib/              # Business logic
│   ├── types/index.ts    # TypeScript types + errors
│   └── index.ts          # Main exports
├── dashboard/            # React web app
└── sdk/                  # TypeScript SDK
```

## Database Schema

### Key Tables

- `employees` — Employee records with salary, payment info
- `payroll_runs` — Payroll periods with status tracking
- `salary_components` — Base, bonus, overtime, etc.
- `deductions` — Taxes, insurance, 401k, etc.
- `payments` — Processed payments per employee
- `orgs` — Organizations/companies
- `fiscal_zones` — Country tax rules (future)

## Working with the Database

```typescript
import { getDatabase, generateId } from "./db/database.js";

const db = getDatabase();
const employees = db.query("SELECT * FROM employees").all();
```

## CLI Patterns

Commands follow this structure:
- `employee:add [options]` — Create employee
- `employee:list [options]` — List with filters
- `employee:show <id>` — Show details
- `employee:update <id> [options]` — Update
- `employee:delete <id>` — Delete

### Adding a New Employee

```typescript
import { createEmployee } from "./db/employees.js";

const employee = createEmployee({
  first_name: "John",
  last_name: "Doe",
  email: "john@company.com",
  base_salary: 100000,
});
```

## MCP Server Patterns

Tools are registered with `server.tool()`:

```typescript
server.tool(
  "tool_name",
  "Description",
  { param: z.type() },
  async ({ param }) => {
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);
```

## Key Patterns

### Generating IDs

```typescript
const id = generateId("emp"); // "emp_xxxxxx"
```

### Error Handling

Use custom error classes from `./types/index.ts`:
- `EmployeeNotFoundError`
- `PayrollRunNotFoundError`
- `ValidationError`

### Status Transitions

Payroll runs: `draft` → `calculated` → `approved` → `processing` → `completed`

## Testing

```bash
# Run CLI
bun run dev:cli

# Run MCP
bun run dev:mcp

# Build
bun run build
```

## Building

```bash
# Build all
bun run build

# Or individually
bun build src/cli/index.tsx --outdir dist/cli --target bun
bun build src/mcp/index.ts --outdir dist/mcp --target bun
```

## Common Tasks

### Adding a New CLI Command

1. Add command in `src/cli/index.tsx`
2. Use existing patterns (resolve IDs, format output)
3. Add to build script in package.json

### Adding a New MCP Tool

1. Add tool in `src/mcp/index.ts`
2. Use zod for input validation
3. Return `{ content: [{ type: "text", text: JSON.stringify(result) }] }`

### Adding Database Fields

1. Update schema in `src/db/database.ts`
2. Add migrations if needed
3. Update types in `src/types/index.ts`
4. Update CRUD functions

## Fiscal Zones (Planned)

Future support for country-specific rules:
- Romania (RO) — 10% income tax, CAS 25%, CASS 10%
- United States (US) — Federal brackets, state tax, SS/Medicare
- Each fiscal zone has tax rates, deduction rules, reporting requirements
