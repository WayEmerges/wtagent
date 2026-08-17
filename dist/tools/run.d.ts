import type { AgentMode } from "../state/session.js";
export declare function executeTool(name: string, rawArgs: string, mode: AgentMode): Promise<{
    ok: boolean;
    text: string;
    detail?: string;
}>;
