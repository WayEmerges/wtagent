import type { LoadedConfig } from "../config/load.js";
import type { AgentMode } from "../state/session.js";
import { type TodoItem } from "./todo.js";
import { type ToolResult } from "./types.js";
export type ToolContext = {
    config: LoadedConfig;
    modelKey: string;
    signal?: AbortSignal;
    setMode?: (mode: AgentMode) => void;
    onTodos?: (items: TodoItem[]) => void;
    onTaskNotice?: (text: string) => void;
};
export declare function executeTool(name: string, rawArgs: string, mode: AgentMode, ctx?: ToolContext): Promise<ToolResult>;
