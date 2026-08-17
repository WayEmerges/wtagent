import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { AgentMode } from "../state/session.js";
export declare function openaiTools(mode: AgentMode): ChatCompletionTool[];
export declare const WRITE_TOOL_NAMES: Set<string>;
