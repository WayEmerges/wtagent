import { type ChildProcess } from "node:child_process";
export type ShellJob = {
    id: string;
    command: string;
    outputPath: string;
    startedAt: number;
    pid?: number;
    exitCode?: number | null;
    done: boolean;
    buffer: string;
    child?: ChildProcess;
};
export declare function runShellTool(command: string, blockUntilMs?: number): Promise<{
    text: string;
    shellId: string;
    backgrounded: boolean;
}>;
export declare function awaitShellTool(opts: {
    shellId?: string;
    blockUntilMs?: number;
    pattern?: string;
}): Promise<string>;
export declare function getShellJob(id: string): ShellJob | undefined;
