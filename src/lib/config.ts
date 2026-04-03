import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

export interface PayrollConfig {
  org_id?: string;
  project_id?: string;
  default_currency?: string;
  fiscal_zone?: string;
  output_format?: "json" | "table" | "csv";
  db_path?: string;
}

const DEFAULT_CONFIG: PayrollConfig = {
  default_currency: "USD",
  fiscal_zone: "US",
  output_format: "table",
};

let cachedConfig: PayrollConfig | null = null;

export function loadConfig(cwd?: string): PayrollConfig {
  if (cachedConfig) return cachedConfig;

  const searchDirs = cwd ? [cwd] : [];

  // Search up from cwd
  let dir = cwd || process.cwd();
  for (let i = 0; i < 10; i++) {
    searchDirs.push(dir);
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }

  // Also check home and standard locations
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  searchDirs.push(home);
  searchDirs.push(join(home, ".config", "payroll"));

  for (const dir of searchDirs) {
    for (const name of ["payroll.json", "payroll.yaml", ".payrollrc"]) {
      const path = join(dir, name);
      if (existsSync(path)) {
        try {
          const content = readFileSync(path, "utf-8");
          if (name.endsWith(".json")) {
            cachedConfig = { ...DEFAULT_CONFIG, ...JSON.parse(content) };
          } else if (name.endsWith(".yaml") || name.endsWith(".yml")) {
            // Simple YAML parser for basic key-value
            const parsed: Record<string, string> = {};
            content.split("\n").forEach(line => {
              const match = line.match(/^(\w+):\s*(.*)$/);
              if (match) parsed[match[1]] = match[2].trim();
            });
            cachedConfig = { ...DEFAULT_CONFIG, ...parsed };
          }
          if (cachedConfig) return cachedConfig;
        } catch {
          // Ignore parse errors
        }
      }
    }
  }

  cachedConfig = DEFAULT_CONFIG;
  return cachedConfig;
}

export function clearConfigCache(): void {
  cachedConfig = null;
}

export function getConfigValue(key: keyof PayrollConfig, cwd?: string): string | undefined {
  const config = loadConfig(cwd);
  return config[key] as string | undefined;
}