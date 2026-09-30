import type { McpServerConfig } from "../config/load.js";
export declare function loadMcpTools(servers: Record<string, McpServerConfig>): Promise<Array<{
    server: string;
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}>>;
export declare function mcpToolName(server: string, tool: string): string;
export declare function parseMcpToolName(name: string): {
    server: string;
    tool: string;
} | undefined;
export declare function callMcpTool(servers: Record<string, McpServerConfig>, server: string, tool: string, args: Record<string, unknown>): Promise<string>;
export declare function fetchMcpResource(servers: Record<string, McpServerConfig>, server: string, uri: string): Promise<string>;
