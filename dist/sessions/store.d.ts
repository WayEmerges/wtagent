import type { AgentMode } from "../state/session.js";
import type { TranscriptRow } from "../ui/rows.js";
export type SavedSession = {
    id: string;
    workspace: string;
    createdAt: string;
    updatedAt: string;
    modelKey: string;
    mode: AgentMode;
    rows: TranscriptRow[];
};
export declare function sessionsDir(): string;
export declare function workspaceKey(cwd?: string): string;
export declare function newSessionId(): string;
export declare function sessionTitle(session: SavedSession): string;
export declare function writeSession(session: SavedSession): void;
export declare function readSession(id: string): SavedSession | undefined;
export declare function listSessions(workspace?: string): SavedSession[];
export declare function latestSession(workspace?: string): SavedSession | undefined;
export declare function persistTurn(args: {
    id: string;
    createdAt: string;
    modelKey: string;
    mode: AgentMode;
    rows: TranscriptRow[];
}): void;
export declare function printSessionList(): void;
