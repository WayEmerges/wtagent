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

export type AutoConfig = {
  orchestrator?: string;
  fallback?: string;
  /** Routing confidence / future use; default 0.75 */
  threshold: number;
};

export type LeaseConfig = {
  adapter: "noop" | "http";
  lockPath: string;
  acquireTimeoutMs: number;
  /** Optional HTTP adapter hooks (unused by noop). */
  http?: {
    statusUrl?: string;
    unloadUrl?: string;
    loadUrl?: string;
    setActiveUrl?: string;
  };
};

export type MemoryConfig = {
  enabled: boolean;
  dir: string;
  threshold: number;
  keepRecentMessages: number;
  summarizer?: string;
  injectChars: number;
};

export type WebSearchConfig = {
  provider: "none" | "brave" | "tavily";
  apiKey?: string;
};

export type McpServerConfig = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
};

export type LoadedConfig = {
  path: string;
  missing: boolean;
  invalid?: string;
  defaultModel: string;
  auto?: AutoConfig;
  lease: LeaseConfig;
  memory: MemoryConfig;
  webSearch: WebSearchConfig;
  mcpServers: Record<string, McpServerConfig>;
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

function expandHome(p: string): string {
  if (p === "~") {
    return homedir();
  }
  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2));
  }
  return p;
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

function clampUnit(n: number, fallback: number): number {
  if (!Number.isFinite(n) || n <= 0 || n > 1) {
    return fallback;
  }
  return n;
}

function defaultLease(): LeaseConfig {
  return {
    adapter: "noop",
    lockPath: join(configDir(), "gpu.lock"),
    acquireTimeoutMs: 600_000,
  };
}

function defaultMemory(models: Record<string, ModelEntry>, auto?: AutoConfig): MemoryConfig {
  const summarizerKey =
    models.summarizer !== undefined
      ? "summarizer"
      : auto?.fallback && models[auto.fallback]
        ? auto.fallback
        : undefined;
  return {
    enabled: summarizerKey !== undefined,
    dir: join(configDir(), "memory"),
    threshold: 0.75,
    keepRecentMessages: 0,
    summarizer: summarizerKey,
    injectChars: 12_000,
  };
}

function parseLease(raw: unknown): LeaseConfig {
  const base = defaultLease();
  const o = asRecord(raw);
  if (!o) {
    return base;
  }
  const adapter = o.adapter === "http" ? "http" : "noop";
  const lockPath =
    typeof o.lockPath === "string" && o.lockPath.length > 0
      ? expandHome(o.lockPath)
      : base.lockPath;
  const acquireTimeoutMs =
    typeof o.acquireTimeoutMs === "number" && o.acquireTimeoutMs > 0
      ? o.acquireTimeoutMs
      : base.acquireTimeoutMs;
  const httpRaw = asRecord(o.http);
  const http = httpRaw
    ? {
        statusUrl: typeof httpRaw.statusUrl === "string" ? httpRaw.statusUrl : undefined,
        unloadUrl: typeof httpRaw.unloadUrl === "string" ? httpRaw.unloadUrl : undefined,
        loadUrl: typeof httpRaw.loadUrl === "string" ? httpRaw.loadUrl : undefined,
        setActiveUrl: typeof httpRaw.setActiveUrl === "string" ? httpRaw.setActiveUrl : undefined,
      }
    : undefined;
  return { adapter, lockPath, acquireTimeoutMs, http };
}

function parseMemory(
  raw: unknown,
  models: Record<string, ModelEntry>,
  auto?: AutoConfig,
): MemoryConfig {
  const base = defaultMemory(models, auto);
  const o = asRecord(raw);
  if (!o) {
    return base;
  }
  const summarizer =
    typeof o.summarizer === "string" && o.summarizer.length > 0
      ? o.summarizer
      : base.summarizer;
  // Prefer explicit enabled; otherwise enable when summarizer or auto.fallback exists.
  const enabled =
    typeof o.enabled === "boolean"
      ? o.enabled
      : Boolean(
          (summarizer && models[summarizer]) ||
            (auto?.fallback && models[auto.fallback]),
        );

  return {
    enabled,
    dir: typeof o.dir === "string" && o.dir.length > 0 ? expandHome(o.dir) : base.dir,
    threshold:
      typeof o.threshold === "number" ? clampUnit(o.threshold, base.threshold) : base.threshold,
    keepRecentMessages:
      typeof o.keepRecentMessages === "number" &&
      Number.isFinite(o.keepRecentMessages) &&
      o.keepRecentMessages >= 0
        ? Math.floor(o.keepRecentMessages)
        : base.keepRecentMessages,
    summarizer,
    injectChars:
      typeof o.injectChars === "number" && o.injectChars > 0
        ? Math.floor(o.injectChars)
        : base.injectChars,
  };
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

function defaultWebSearch(): WebSearchConfig {
  return { provider: "none" };
}

function parseWebSearch(raw: unknown): WebSearchConfig {
  const o = asRecord(raw);
  if (!o) {
    return defaultWebSearch();
  }
  const provider =
    o.provider === "brave" || o.provider === "tavily" || o.provider === "none"
      ? o.provider
      : "none";
  const apiKey = typeof o.apiKey === "string" ? o.apiKey : undefined;
  return { provider, apiKey };
}

function parseMcpServers(raw: unknown): Record<string, McpServerConfig> {
  const o = asRecord(raw);
  if (!o) {
    return {};
  }
  const out: Record<string, McpServerConfig> = {};
  for (const [name, value] of Object.entries(o)) {
    const s = asRecord(value);
    if (!s) {
      continue;
    }
    const envRaw = asRecord(s.env);
    const env = envRaw
      ? Object.fromEntries(
          Object.entries(envRaw).filter((e): e is [string, string] => typeof e[1] === "string"),
        )
      : undefined;
    out[name] = {
      command: typeof s.command === "string" ? s.command : undefined,
      args: Array.isArray(s.args) ? s.args.filter((a): a is string => typeof a === "string") : undefined,
      env,
      url: typeof s.url === "string" ? s.url : undefined,
    };
  }
  return out;
}

function emptyConfig(path: string, lastModel?: string, invalid?: string): LoadedConfig {
  return {
    path,
    missing: !invalid,
    invalid,
    defaultModel: "auto",
    lease: defaultLease(),
    memory: defaultMemory({}),
    webSearch: defaultWebSearch(),
    mcpServers: {},
    models: {},
    lastModel,
  };
}

export function loadConfig(): LoadedConfig {
  const path = defaultConfigPath();
  const lastModel = readLastModel();

  if (!existsSync(path)) {
    return {
      ...emptyConfig(path, lastModel),
      missing: true,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return emptyConfig(path, lastModel, err instanceof Error ? err.message : "invalid JSON");
  }

  const root = asRecord(parsed);
  if (!root) {
    return emptyConfig(path, lastModel, "config root must be an object");
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
        threshold:
          typeof autoRaw.threshold === "number"
            ? clampUnit(autoRaw.threshold, 0.75)
            : 0.75,
      }
    : undefined;

  const defaultModel = typeof root.defaultModel === "string" ? root.defaultModel : "auto";
  const lease = parseLease(root.lease);
  const memory = parseMemory(root.memory, models, auto);

  const envBase = process.env.WTAGENT_BASE_URL?.trim();
  const envKey = process.env.WTAGENT_API_KEY?.trim();
  const envModel = process.env.WTAGENT_MODEL?.trim();

  if (envBase || envKey || envModel) {
    const targetKey =
      envModel && models[envModel] ? envModel : Object.keys(models)[0];
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
    lease,
    memory,
    webSearch: parseWebSearch(root.webSearch),
    mcpServers: parseMcpServers(root.mcpServers),
    models,
    lastModel,
  };
}

export function autoEnabled(config: LoadedConfig): boolean {
  return Boolean(config.auto?.fallback && config.models[config.auto.fallback]);
}

export function modelChoices(config: LoadedConfig): ModelChoice[] {
  const auto: ModelChoice = {
    key: "auto",
    label: "Auto",
    disabled: !autoEnabled(config),
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
    if (!c) {
      continue;
    }
    if (c === "auto") {
      if (autoEnabled(config)) {
        return "auto";
      }
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
  if (autoEnabled(config)) {
    console.log(`auto\tAuto\t(fallback: ${config.auto?.fallback})`);
  } else {
    console.log("auto\tAuto\t(disabled — set auto.fallback to a configured model)");
  }
  for (const [key, m] of Object.entries(config.models)) {
    console.log(`${key}\t${m.name}\t${m.baseURL}`);
  }
}
