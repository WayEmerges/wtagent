export type TranscriptRow = {
    id: string;
    kind: "user";
    text: string;
} | {
    id: string;
    kind: "assistant";
    text: string;
} | {
    id: string;
    kind: "tool";
    name: string;
    args: string;
    status: "running" | "done" | "error";
    detail?: string;
    output?: string;
    path?: string;
} | {
    id: string;
    kind: "notice";
    text: string;
} | {
    id: string;
    kind: "error";
    text: string;
};
export declare function SpinnerGlyph(): import("react").JSX.Element;
export declare function RowView({ row }: {
    row: TranscriptRow;
}): import("react").JSX.Element;
