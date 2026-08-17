import type { LoadedConfig } from "../config/load.js";
import type { EnsureActiveAdapter } from "./adapters/types.js";
export type LeaseRole = string;
export type LeaseHandle = {
    role: LeaseRole;
    release(): Promise<void>;
};
export type GpuLease = {
    acquire(role: LeaseRole, signal?: AbortSignal): Promise<LeaseHandle>;
};
export type CreateGpuLeaseOptions = {
    adapter: EnsureActiveAdapter;
    /** When set, take a cross-process lockfile while the process holds the lease (refcount > 0). */
    lockPath?: string;
    acquireTimeoutMs: number;
};
/**
 * Process-local exclusive GPU lease with same-role refcounting.
 * Different-role acquire waits in a FIFO queue (does not fail hard unless aborted/timeout).
 */
export declare function createGpuLease(opts: CreateGpuLeaseOptions): GpuLease;
/** Shared process lease for the active config (noop ensure-active in Phase I). */
export declare function getGpuLease(config: LoadedConfig): GpuLease;
