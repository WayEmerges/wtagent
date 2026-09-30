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

export function okResult(
  text: string,
  extra?: Omit<ToolResult, "ok" | "text">,
): ToolResult {
  return { ok: true, text, ...extra };
}

export function errResult(text: string): ToolResult {
  return { ok: false, text };
}
