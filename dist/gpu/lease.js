import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync, } from "node:fs";
import { dirname } from "node:path";
import { noopAdapter } from "./adapters/noop.js";
/**
 * Process-local exclusive GPU lease with same-role refcounting.
 * Different-role acquire waits in a FIFO queue (does not fail hard unless aborted/timeout).
 */
export function createGpuLease(opts) {
    let heldRole = null;
    let refcount = 0;
    const queue = [];
    let fileLocked = false;
    async function takeFileLock(signal) {
        const path = opts.lockPath;
        if (!path || fileLocked) {
            return;
        }
        mkdirSync(dirname(path), { recursive: true });
        const deadline = Date.now() + opts.acquireTimeoutMs;
        while (Date.now() < deadline) {
            if (signal?.aborted) {
                throw abortError();
            }
            try {
                const fd = openSync(path, "wx");
                try {
                    writeFileSync(fd, `${process.pid}\n`);
                }
                finally {
                    closeSync(fd);
                }
                fileLocked = true;
                return;
            }
            catch (err) {
                const code = err.code;
                if (code !== "EEXIST") {
                    throw err;
                }
                if (staleLock(path)) {
                    try {
                        unlinkSync(path);
                    }
                    catch {
                        /* race */
                    }
                    continue;
                }
                await sleep(50, signal);
            }
        }
        throw new Error(`GPU lease file lock timed out (${path})`);
    }
    function releaseFileLock() {
        if (!opts.lockPath || !fileLocked) {
            return;
        }
        try {
            unlinkSync(opts.lockPath);
        }
        catch {
            /* ignore */
        }
        fileLocked = false;
    }
    function pump() {
        if (refcount > 0 || queue.length === 0) {
            return;
        }
        const next = queue.shift();
        if (!next) {
            return;
        }
        clearWaiter(next);
        next.resolve();
    }
    async function acquire(role, signal) {
        const deadline = Date.now() + opts.acquireTimeoutMs;
        while (true) {
            if (signal?.aborted) {
                throw abortError();
            }
            if (Date.now() >= deadline) {
                throw new Error(`GPU lease acquire timed out after ${opts.acquireTimeoutMs}ms (wanted ${role})`);
            }
            // Same role: re-entrant refcount.
            if (heldRole === role && refcount > 0) {
                refcount += 1;
                return makeHandle(role);
            }
            if (refcount === 0) {
                heldRole = role;
                refcount = 1;
                try {
                    await takeFileLock(signal);
                    await opts.adapter.ensureActive(role, signal);
                }
                catch (err) {
                    refcount = 0;
                    heldRole = null;
                    releaseFileLock();
                    pump();
                    throw err;
                }
                return makeHandle(role);
            }
            // Different role held — wait, then retry claim.
            await waitForTurn(signal, deadline);
        }
    }
    function makeHandle(role) {
        let released = false;
        return {
            role,
            async release() {
                if (released) {
                    return;
                }
                released = true;
                if (heldRole !== role || refcount <= 0) {
                    return;
                }
                refcount -= 1;
                if (refcount === 0) {
                    heldRole = null;
                    releaseFileLock();
                    pump();
                }
            },
        };
    }
    function waitForTurn(signal, deadline) {
        return new Promise((resolve, reject) => {
            const remaining = Math.max(0, deadline - Date.now());
            const waiter = { role: "", signal, resolve, reject };
            waiter.timer = setTimeout(() => {
                removeWaiter(waiter);
                reject(new Error(`GPU lease acquire timed out after ${opts.acquireTimeoutMs}ms`));
            }, remaining);
            if (signal) {
                waiter.onAbort = () => {
                    removeWaiter(waiter);
                    reject(abortError());
                };
                if (signal.aborted) {
                    waiter.onAbort();
                    return;
                }
                signal.addEventListener("abort", waiter.onAbort, { once: true });
            }
            queue.push(waiter);
        });
    }
    function removeWaiter(waiter) {
        const i = queue.indexOf(waiter);
        if (i >= 0) {
            queue.splice(i, 1);
        }
        clearWaiter(waiter);
    }
    function clearWaiter(waiter) {
        if (waiter.timer) {
            clearTimeout(waiter.timer);
            waiter.timer = undefined;
        }
        if (waiter.signal && waiter.onAbort) {
            waiter.signal.removeEventListener("abort", waiter.onAbort);
            waiter.onAbort = undefined;
        }
    }
    return { acquire };
}
function staleLock(path) {
    try {
        if (!existsSync(path)) {
            return false;
        }
        const pid = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
        if (!Number.isFinite(pid) || pid <= 0) {
            return true;
        }
        try {
            process.kill(pid, 0);
            return false;
        }
        catch {
            return true;
        }
    }
    catch {
        return true;
    }
}
function abortError() {
    const err = new Error("GPU lease acquire aborted");
    err.name = "AbortError";
    return err;
}
function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(abortError());
            return;
        }
        const t = setTimeout(resolve, ms);
        const onAbort = () => {
            clearTimeout(t);
            reject(abortError());
        };
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}
let cached = null;
/** Shared process lease for the active config (noop ensure-active in Phase I). */
export function getGpuLease(config) {
    const { adapter, lockPath, acquireTimeoutMs } = config.lease;
    const key = `${adapter}:${lockPath}:${acquireTimeoutMs}`;
    if (cached?.key === key) {
        return cached.lease;
    }
    const lease = createGpuLease({
        adapter: noopAdapter,
        lockPath,
        acquireTimeoutMs,
    });
    cached = { key, lease };
    return lease;
}
//# sourceMappingURL=lease.js.map