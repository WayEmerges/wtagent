import type { ReactNode } from "react";
/** Cursor dark fallbacks when terminal theme mixing is unavailable. */
export declare const PROMPT_BG = "#151515";
export declare const USER_MSG_BG = "#242428";
export declare function supportsHalfBlockPromptBar(env?: NodeJS.ProcessEnv, stdout?: {
    isTTY?: boolean;
}): boolean;
/** Cursor-style prompt / message chrome: half-block caps when supported, flat fill otherwise. */
export declare function PromptChrome({ backgroundColor, width, children, halfBlocks, }: {
    backgroundColor: string;
    width: number;
    children: ReactNode;
    halfBlocks?: boolean;
}): import("react").JSX.Element;
