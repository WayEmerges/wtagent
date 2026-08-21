import { Box, Text } from "ink";
import type { ReactNode } from "react";

/** Cursor dark fallbacks when terminal theme mixing is unavailable. */
export const PROMPT_BG = "#151515";
export const USER_MSG_BG = "#242428";

const HALF_BLOCK_TERMINALS = new Set([
  "alacritty",
  "ghostty",
  "gnome-terminal",
  "hyper",
  "iterm2",
  "kitty",
  "konsole",
  "mintty",
  "rio",
  "tabby",
  "terminator",
  "tilix",
  "vscode",
  "warp",
  "wezterm",
  "windows-terminal",
]);

function detectTerminalProgram(env: NodeJS.ProcessEnv = process.env): string {
  if (env.GHOSTTY_RESOURCES_DIR) return "ghostty";
  if (env.KITTY_WINDOW_ID) return "kitty";
  if (env.ALACRITTY_LOG || env.ALACRITTY_SOCKET) return "alacritty";
  if (env.WARP_IS_LOCAL_SHELL_SESSION || env.WARP_HONOR_PS1) return "warp";
  if (env.ITERM_SESSION_ID || env.ITERM_PROFILE) return "iterm2";
  if (env.WT_SESSION) return "windows-terminal";
  if (env.KONSOLE_VERSION) return "konsole";
  if (env.GNOME_TERMINAL_SCREEN || env.VTE_VERSION) return "gnome-terminal";
  if (env.TILIX_ID) return "tilix";
  if (env.TERMINATOR_UUID) return "terminator";
  if (env.TERM_PROGRAM) {
    const p = env.TERM_PROGRAM.toLowerCase();
    if (p === "vscode") return "vscode";
    if (p === "hyper") return "hyper";
    if (p === "tabby") return "tabby";
    if (p === "wezterm") return "wezterm";
    if (p === "ghostty") return "ghostty";
    if (p === "kitty") return "kitty";
    if (p === "alacritty") return "alacritty";
    if (p === "iterm.app" || p === "iterm") return "iterm2";
  }
  if (env.TERMINAL_EMULATOR?.includes("JetBrains")) return "jetbrains";
  return "unknown";
}

export function supportsHalfBlockPromptBar(
  env: NodeJS.ProcessEnv = process.env,
  stdout: { isTTY?: boolean } = process.stdout,
): boolean {
  if (env.AGENT_CLI_DISABLE_HALF_BLOCK_PROMPT_BAR) return false;
  if (!stdout.isTTY || env.TERM === "dumb") return false;
  return HALF_BLOCK_TERMINALS.has(detectTerminalProgram(env));
}

function HalfPad({
  backgroundColor,
  side,
  width,
}: {
  backgroundColor: string;
  side: "top" | "bottom";
  width: number;
}) {
  const ch = side === "top" ? "▄" : "▀";
  const line = ch.repeat(Math.max(0, width));
  return <Text color={backgroundColor}>{line.length === 0 ? " " : line}</Text>;
}

/** Cursor-style prompt / message chrome: half-block caps when supported, flat fill otherwise. */
export function PromptChrome({
  backgroundColor,
  width,
  children,
  halfBlocks,
}: {
  backgroundColor: string;
  width: number;
  children: ReactNode;
  halfBlocks?: boolean;
}) {
  const useHalf = halfBlocks ?? supportsHalfBlockPromptBar();
  return (
    <Box
      flexDirection="column"
      marginX={1}
      marginY={useHalf ? 0 : 1}
      width={width}
      flexShrink={0}
    >
      {useHalf ? <HalfPad backgroundColor={backgroundColor} side="top" width={width} /> : null}
      <Box
        flexDirection="column"
        backgroundColor={backgroundColor}
        paddingLeft={1}
        paddingY={useHalf ? 0 : 1}
      >
        {children}
      </Box>
      {useHalf ? <HalfPad backgroundColor={backgroundColor} side="bottom" width={width} /> : null}
    </Box>
  );
}
