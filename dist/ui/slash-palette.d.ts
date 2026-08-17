export type SlashCommand = {
    name: string;
    summary: string;
    implemented: boolean;
};
export declare const SLASH_COMMANDS: SlashCommand[];
export declare function filterSlash(draft: string): SlashCommand[];
export declare function SlashPalette({ matches, selected, }: {
    matches: SlashCommand[];
    selected: number;
}): import("react").JSX.Element;
