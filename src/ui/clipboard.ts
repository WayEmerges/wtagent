import { spawnSync } from "node:child_process";

const COPY_CMDS: Array<[string, string[]]> = [
  ["wl-copy", []],
  ["xclip", ["-selection", "clipboard"]],
  ["xsel", ["--clipboard", "--input"]],
  ["pbcopy", []],
];

const PASTE_CMDS: Array<[string, string[]]> = [
  ["wl-paste", ["-n"]],
  ["xclip", ["-selection", "clipboard", "-o"]],
  ["xsel", ["--clipboard", "--output"]],
  ["pbpaste", []],
];

export function copyText(text: string): boolean {
  for (const [cmd, args] of COPY_CMDS) {
    const result = spawnSync(cmd, args, {
      input: text,
      encoding: "utf8",
      timeout: 1500,
      stdio: ["pipe", "pipe", "ignore"],
    });
    if (!result.error && result.status === 0) {
      return true;
    }
  }
  return false;
}

export function pasteText(): string | undefined {
  for (const [cmd, args] of PASTE_CMDS) {
    const result = spawnSync(cmd, args, {
      encoding: "utf8",
      timeout: 1500,
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (!result.error && result.status === 0 && typeof result.stdout === "string") {
      return result.stdout;
    }
  }
  return undefined;
}
