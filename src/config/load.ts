import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ModelEntry = {
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  contextLength?: number;
  roles?: string[];
};

export type LoadedConfig = {
  path: string;
  missing: boolean;
  invalid?: string;
  defaultModel: string;
  auto?: { orchestrator?: string; fallback?: string };
  models: Record<string, ModelEntry>;
  lastModel?: string;
};

export type ModelChoice = {
  key: string;
  label: string;
  baseURL?: string;
  disabled?: boolean;
};

export function configDir(): string {
  return join(homedir(), ".waytech-agent");
}

export function defaultConfigPath(): string {
  return process.env.WTAGENT_CONFIG?.trim() || join(configDir(), "config.json");
}

export function statePath(): string {
  return join(configDir(), "state.json");
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return undefined;
}

function parseModel(raw: unknown, key: string): ModelEntry | undefined {
  const o = asRecord(raw);
  if (!o) {
    return undefined;
  }
  const baseURL = typeof o.baseURL === "string" ? o.baseURL : undefined;
  const model = typeof o.model === "string" ? o.model : undefined;
  if (!baseURL || !model) {
    return undefined;
  }
  const name = typeof o.name === "string" && o.name.length > 0 ? o.name : key;
  const apiKey = typeof o.apiKey === "string" ? o.apiKey : "local";
  const contextLength = typeof o.contextLength === "number" ? o.contextLength : undefined;
  const roles = Array.isArray(o.roles)
    ? o.roles.filter((r): r is string => typeof r === "string")
    : undefined;
  return { name, baseURL, apiKey, model, contextLength, roles };
}

function readLastModel(): string | undefined {
  try {
    const raw = JSON.parse(readFileSync(statePath(), "utf8")) as unknown;
    const o = asRecord(raw);
    return typeof o?.lastModel === "string" ? o.lastModel : undefined;
  } catch {
    return undefined;
  }
}

export function writeLastModel(key: string): void {
  mkdirSync(configDir(), { recursive: true });
  let prev: Record<string, unknown> = {};
  try {
    const raw = JSON.parse(readFileSync(statePath(), "utf8")) as unknown;
    prev = asRecord(raw) ?? {};
  } catch {
    prev = {};
  }
  prev.lastModel = key;
  writeFileSync(statePath(), `${JSON.stringify(prev, null, 2)}\n`, "utf8");
}

export function loadConfig(): LoadedConfig {
  const path = defaultConfigPath();
  const lastModel = readLastModel();

  if (!existsSync(path)) {
    return {
      path,
      missing: true,
      defaultModel: "auto",
      models: {},
      lastModel,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return {
      path,
      missing: false,
      invalid: err instanceof Error ? err.message : "invalid JSON",
      defaultModel: "auto",
      models: {},
      lastModel,
    };
  }

  const root = asRecord(parsed);
  if (!root) {
    return {
      path,
      missing: false,
      invalid: "config root must be an object",
      defaultModel: "auto",
      models: {},
      lastModel,
    };
  }

  const modelsRaw = asRecord(root.models) ?? {};
  const models: Record<string, ModelEntry> = {};
  for (const [key, value] of Object.entries(modelsRaw)) {
    const entry = parseModel(value, key);
    if (entry) {
      models[key] = entry;
    }
  }

  const autoRaw = asRecord(root.auto);
  const auto = autoRaw
    ? {
        orchestrator: typeof autoRaw.orchestrator === "string" ? autoRaw.orchestrator : undefined,
        fallback: typeof autoRaw.fallback === "string" ? autoRaw.fallback : undefined,
      }
    : undefined;

  const defaultModel = typeof root.defaultModel === "string" ? root.defaultModel : "auto";

  const envBase = process.env.WTAGENT_BASE_URL?.trim();
  const envKey = process.env.WTAGENT_API_KEY?.trim();
  const envModel = process.env.WTAGENT_MODEL?.trim();

  if (envBase || envKey || envModel) {
    const targetKey =
      envModel && models[envModel]
        ? envModel
        : Object.keys(models)[0];
    if (targetKey && models[targetKey]) {
      const cur = models[targetKey];
      models[targetKey] = {
        ...cur,
        baseURL: envBase || cur.baseURL,
        apiKey: envKey || cur.apiKey,
        model: envModel && !models[envModel] ? envModel : cur.model,
      };
    }
  }

  return {
    path,
    missing: false,
    defaultModel,
    auto,
    models,
    lastModel,
  };
}

export function modelChoices(config: LoadedConfig): ModelChoice[] {
  const auto: ModelChoice = {
    key: "auto",
    label: "Auto",
    disabled: true,
  };
  const rest: ModelChoice[] = Object.entries(config.models).map(([key, m]) => ({
    key,
    label: m.name,
    baseURL: m.baseURL,
  }));
  return [auto, ...rest];
}

export function resolveModelKey(config: LoadedConfig, flag?: string): string {
  const envModel = process.env.WTAGENT_MODEL?.trim();
  const candidates = [flag, envModel, config.lastModel, config.defaultModel, Object.keys(config.models)[0]];
  for (const c of candidates) {
    if (!c || c === "auto") {
      continue;
    }
    if (config.models[c]) {
      return c;
    }
  }
  return Object.keys(config.models)[0] ?? "auto";
}

export function printListModels(): void {
  const config = loadConfig();
  if (config.missing) {
    console.log(`No config at ${config.path}`);
    console.log("Copy the example:");
    console.log("  mkdir -p ~/.waytech-agent");
    console.log("  cp config.json.example ~/.waytech-agent/config.json");
    return;
  }
  if (config.invalid) {
    console.log(`Invalid config at ${config.path}: ${config.invalid}`);
    return;
  }
  console.log("auto\tAuto\t(disabled until Phase I)");
  for (const [key, m] of Object.entries(config.models)) {
    console.log(`${key}\t${m.name}\t${m.baseURL}`);
  }
}
