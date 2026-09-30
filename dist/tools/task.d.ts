import type { LoadedConfig } from "../config/load.js";
export type TaskResult = {
    text: string;
    agentId: string;
};
export declare function taskTool(opts: {
    config: LoadedConfig;
    modelKey: string;
    description: string;
    prompt: string;
    subagentType?: string;
    resume?: string;
    signal?: AbortSignal;
}): Promise<TaskResult>;
