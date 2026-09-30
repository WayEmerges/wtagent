import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { AgentMode } from "../state/session.js";
import type { LoadedConfig } from "../config/load.js";
export declare const WRITE_TOOL_NAMES: Set<string>;
export declare const PARALLEL_SAFE_TOOLS: Set<string>;
export declare function refreshMcpTools(config: LoadedConfig): Promise<void>;
export declare function openaiTools(mode: AgentMode): ChatCompletionTool[];
