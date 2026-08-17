import type { LoadedConfig } from "../config/load.js";
import type { AgentMode } from "../state/session.js";
export type RouteResult = {
    modelKey: string;
    reason: string;
};
/** Prefer chat/plan model (brain / main). */
export declare function preferChatModel(config: LoadedConfig): string | undefined;
/** Prefer code/agent model (coder). */
export declare function preferCoderModel(config: LoadedConfig): string | undefined;
/**
 * Resolve Auto → concrete model key.
 * Priority: mode hint → text heuristics → optional orchestrator → fallback.
 * Summarizer is never chosen for ordinary turns.
 */
export declare function routeTurn(args: {
    config: LoadedConfig;
    mode: AgentMode;
    userText: string;
    signal?: AbortSignal;
}): Promise<RouteResult>;
