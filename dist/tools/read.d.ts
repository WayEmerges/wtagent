export declare function resolvePath(p: string): string;
export declare function readFileTool(path: string, opts?: {
    offset?: number;
    limit?: number;
}): Promise<string>;
export declare function listDirTool(path: string): Promise<string>;
export declare function pathExists(path: string): Promise<boolean>;
