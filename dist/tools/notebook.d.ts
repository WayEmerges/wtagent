export declare function editNotebookTool(opts: {
    targetNotebook: string;
    cellIdx: number;
    isNewCell: boolean;
    cellLanguage: string;
    oldString: string;
    newString: string;
}): Promise<string>;
