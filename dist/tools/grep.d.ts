export declare function grepTool(pattern: string, path?: string, opts?: {
    context?: number;
    headLimit?: number;
}): Promise<string>;
export declare function globTool(pattern: string): Promise<string>;
