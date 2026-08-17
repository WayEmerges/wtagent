import type { AgentMode } from "../state/session.js";
import type { ToolCall } from "./stream.js";
export declare function xmlToolSystem(mode: AgentMode): string;
export declare function parseXmlToolCalls(text: string): ToolCall[];
export declare function stripXmlToolCalls(text: string): string;
export declare function allowTool(name: string, mode: AgentMode): boolean;
