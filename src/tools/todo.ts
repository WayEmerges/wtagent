export type TodoItem = {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
};

let todos: TodoItem[] = [];

export function getTodos(): TodoItem[] {
  return todos.map((t) => ({ ...t }));
}

export function todoWriteTool(
  items: Array<{ id: string; content?: string; status: TodoItem["status"] }>,
  merge: boolean,
): string {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("todos array is required");
  }
  if (!merge) {
    todos = items.map((t) => ({
      id: t.id,
      content: t.content ?? "",
      status: t.status,
    }));
  } else {
    const byId = new Map(todos.map((t) => [t.id, t]));
    for (const t of items) {
      const prev = byId.get(t.id);
      byId.set(t.id, {
        id: t.id,
        content: t.content ?? prev?.content ?? "",
        status: t.status,
      });
    }
    todos = [...byId.values()];
  }
  const lines = todos.map((t) => `- [${t.status}] ${t.id}: ${t.content}`);
  return lines.join("\n") || "(empty todo list)";
}

export function clearTodos(): void {
  todos = [];
}
