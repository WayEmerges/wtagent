export type ToolResult = {
    ok: boolean;
    text: string;
    detail?: string;
    summary?: string;
    path?: string;
    output?: string;
    added?: number;
    removed?: number;
    shellId?: string;
    collapsedHint?: string;
};
export declare function okResult(text: string, extra?: Omit<ToolResult, "ok" | "text">): ToolResult;
export declare function errResult(text: string): ToolResult;
