import type { EnsureActiveAdapter } from "./types.js";

/** Mutex only — operator already loaded the right model. */
export const noopAdapter: EnsureActiveAdapter = {
  name: "noop",
  async ensureActive() {
    /* no backend calls */
  },
};
