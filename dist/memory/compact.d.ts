import type { LoadedConfig } from "../config/load.js";
import type { TranscriptRow } from "../ui/rows.js";
export declare function summarizerModelKey(config: LoadedConfig): string | undefined;
export declare function shouldCompact(args: {
    promptTokens: number;
    contextLength?: number;
    /** When set (>0), compact at this estimated prompt token count. */
    compactAtTokens?: number;
    threshold: number;
}): boolean;
export declare function isContextOomError(err: unknown): boolean;
/** After summary: clear live history. keepRecentMessages<=0 clears all (keeps in-flight turn only). */
export declare function trimRowsForCompaction(rows: TranscriptRow[], keepRecentMessages: number, asstId?: string): TranscriptRow[];
export type CompactResult = {
    memoryPath: string;
    summary: string;
    trimmedRows: TranscriptRow[];
};
/**
 * Summarize session under GPU lease, append MEMORY.md, return trimmed rows.
 * Caller must not hold a conflicting lease (release first if role differs).
 */
export declare function compactSession(args: {
    config: LoadedConfig;
    sessionId: string;
    rows: TranscriptRow[];
    asstId?: string;
    signal?: AbortSignal;
    /** When true, skip the over-threshold check (e.g. /compact or OOM retry). */
    force?: boolean;
}): Promise<CompactResult | null>;
export declare function memoryInjectBlock(config: LoadedConfig): string;
