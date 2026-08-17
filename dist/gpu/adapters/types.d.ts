/** Pluggable backend hook: ensure role R's upstream model is the active one. */
export type EnsureActiveAdapter = {
    name: string;
    ensureActive(role: string, signal?: AbortSignal): Promise<void>;
};
