import type { LoadedConfig } from "../config/load.js";
import type { AgentMode } from "../state/session.js";
import type { TodoItem } from "../tools/todo.js";
import type { TranscriptRow } from "../ui/rows.js";
export type TurnHooks = {
    getRows: () => TranscriptRow[];
    patchRows: (fn: (rows: TranscriptRow[]) => TranscriptRow[]) => void;
    setUsage: (usage: {
        prompt: number;
        completion: number;
        total: number;
    }, approx: boolean) => void;
    waitShell: (command: string) => Promise<"allow" | "deny" | "yolo">;
    yolo: () => boolean;
    setYolo: () => void;
    setMode: (mode: AgentMode) => void;
    onTodos: (items: TodoItem[]) => void;
};
export declare function runAgentTurn(args: {
    config: LoadedConfig;
    modelKey: string;
    mode: AgentMode;
    asstId: string;
    sessionId: string;
    signal: AbortSignal;
    hooks: TurnHooks;
}): Promise<void>;
