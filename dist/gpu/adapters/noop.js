/** Mutex only — operator already loaded the right model. */
export const noopAdapter = {
    name: "noop",
    async ensureActive() {
        /* no backend calls */
    },
};
//# sourceMappingURL=noop.js.map