/** Clear scrollback + viewport so Static transcript can be rewritten at the new size. */
export declare function clearTerminalScreen(stdout: NodeJS.WriteStream): void;
/**
 * Terminal size that re-renders on SIGWINCH / tmux split, plus a layoutKey that
 * remounts <Static> after a hard clear so settled rows reflow instead of tearing.
 */
export declare function useTerminalLayout(): {
    columns: number;
    rows: number;
    layoutKey: number;
    suspended: boolean;
};
