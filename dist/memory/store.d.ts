export declare function workspaceHash(cwd?: string): string;
export declare function memoryWorkspaceDir(memoryRoot: string, cwd?: string): string;
export declare function memoryFilePath(memoryRoot: string, cwd?: string): string;
export declare function sessionMemoryPath(memoryRoot: string, sessionId: string, cwd?: string): string;
export declare function ensureMemoryDirs(memoryRoot: string, cwd?: string): void;
/** Append a dated compaction section to MEMORY.md (and optional per-session file). */
export declare function appendMemorySection(args: {
    memoryRoot: string;
    sessionId: string;
    body: string;
    cwd?: string;
}): {
    memoryPath: string;
};
/** Last `injectChars` characters of MEMORY.md for prompt injection. */
export declare function readMemoryInject(memoryRoot: string, injectChars: number, cwd?: string): string;
