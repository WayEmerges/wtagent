export type ModelEntry = {
    name: string;
    baseURL: string;
    apiKey: string;
    model: string;
    contextLength?: number;
    roles?: string[];
    /**
     * Qwen3 / vLLM "thinking" mode. When true, the model may stream into
     * `reasoning` and leave `content` blank. Default false for reliable replies.
     */
    enableThinking?: boolean;
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
    /** Estimated prompt tokens at which to auto-compact (preferred over threshold ratio). */
    compactAtTokens: number;
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
export declare function configDir(): string;
export declare function defaultConfigPath(): string;
export declare function statePath(): string;
export declare function writeLastModel(key: string): void;
export declare function loadConfig(): LoadedConfig;
export declare function autoEnabled(config: LoadedConfig): boolean;
export declare function modelChoices(config: LoadedConfig): ModelChoice[];
export declare function resolveModelKey(config: LoadedConfig, flag?: string): string;
export declare function printListModels(): void;
