export type VisLine = {
    text: string;
    start: number;
};
export type Draft = {
    value: string;
    cursor: number;
    selAnchor: number | null;
};
export declare function clampCursor(n: number, len: number): number;
export declare function sanitizeInsert(text: string): string;
export declare function selRange(draft: Draft): {
    start: number;
    end: number;
};
export declare function hasSelection(draft: Draft): boolean;
export declare function moveGrapheme(text: string, cursor: number, dir: -1 | 1): number;
export declare function wordLeft(text: string, cursor: number): number;
export declare function wordRight(text: string, cursor: number): number;
/** Wrap without dropping spaces so the caret maps 1:1 onto visible text. */
export declare function layoutLines(text: string, width: number): VisLine[];
export declare function lineIndexForCursor(lines: VisLine[], cursor: number, textLen: number): number;
export declare function moveVertical(text: string, cursor: number, width: number, dir: -1 | 1): number | null;
export declare function lineHome(text: string, cursor: number, width: number): number;
export declare function lineEnd(text: string, cursor: number, width: number): number;
export declare function insertText(draft: Draft, chunk: string): Draft;
export declare function deleteSelectionOr(draft: Draft, mode: "backspace" | "delete"): Draft;
export declare function deleteRange(draft: Draft, from: number, to: number): Draft;
export declare function moveCursor(draft: Draft, next: number, extend: boolean): Draft;
export type TextRun = {
    text: string;
    kind: "plain" | "sel" | "caret";
};
export declare function lineRuns(args: {
    text: string;
    lineStart: number;
    cursor: number;
    selStart: number;
    selEnd: number;
    showCaret: boolean;
}): TextRun[];
