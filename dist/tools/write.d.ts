export type DiffStats = {
    detail: string;
    added: number;
    removed: number;
};
export declare function diffStats(path: string, before: string, after: string): DiffStats;
export declare function writeFileTool(path: string, content: string): Promise<DiffStats>;
export declare function editFileTool(path: string, search: string, replace: string, replaceAll?: boolean): Promise<DiffStats>;
export declare function deleteFileTool(path: string): Promise<string>;
