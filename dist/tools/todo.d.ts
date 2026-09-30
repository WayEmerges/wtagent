export type TodoItem = {
    id: string;
    content: string;
    status: "pending" | "in_progress" | "completed" | "cancelled";
};
export declare function getTodos(): TodoItem[];
export declare function todoWriteTool(items: Array<{
    id: string;
    content?: string;
    status: TodoItem["status"];
}>, merge: boolean): string;
export declare function clearTodos(): void;
