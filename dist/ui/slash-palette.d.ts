export type SlashCommand = {
    name: string;
    summary: string;
    implemented: boolean;
};
export declare const SLASH_COMMANDS: SlashCommand[];
export declare function allSlashCommands(): SlashCommand[];
export declare function filterSlash(draft: string): SlashCommand[];
export declare function slashTokenAt(text: string, cursor: number): {
    start: number;
    end: number;
    token: string;
} | null;
/** Commands that open a picker or exit — keep leftover text, do not auto-send. */
export declare const SLASH_HOLD_REST: Set<string>;
/** Pull a /command out of a line that also has normal prompt text. */
export declare function splitInlineSlash(text: string): {
    command: string;
    rest: string;
} | null;
export declare function SlashPalette({ matches, selected, }: {
    matches: SlashCommand[];
    selected: number;
}): import("react").JSX.Element;
