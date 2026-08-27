import { useStdout, useWindowSize } from "ink";
import { useEffect, useRef, useState } from "react";
const RESIZE_DEBOUNCE_MS = 200;
/** Clear scrollback + viewport so Static transcript can be rewritten at the new size. */
export function clearTerminalScreen(stdout) {
    stdout.write("\x1b[H\x1b[2J\x1b[3J");
}
/**
 * Terminal size that re-renders on SIGWINCH / tmux split, plus a layoutKey that
 * remounts <Static> after a hard clear so settled rows reflow instead of tearing.
 */
export function useTerminalLayout() {
    const { columns, rows } = useWindowSize();
    const { stdout } = useStdout();
    const [layoutKey, setLayoutKey] = useState(0);
    const [suspended, setSuspended] = useState(false);
    const prev = useRef({ columns, rows });
    const timer = useRef(null);
    useEffect(() => {
        const prevCols = prev.current.columns;
        const prevRows = prev.current.rows;
        if (columns === prevCols && rows === prevRows) {
            return;
        }
        prev.current = { columns, rows };
        if (timer.current) {
            clearTimeout(timer.current);
        }
        // Debounce: tmux can fire several resizes while the pane is still moving.
        timer.current = setTimeout(() => {
            timer.current = null;
            setSuspended(true);
            clearTerminalScreen(stdout);
            setLayoutKey((k) => k + 1);
            setImmediate(() => {
                setSuspended(false);
            });
        }, RESIZE_DEBOUNCE_MS);
        return () => {
            if (timer.current) {
                clearTimeout(timer.current);
                timer.current = null;
            }
        };
    }, [columns, rows, stdout]);
    return { columns, rows, layoutKey, suspended };
}
//# sourceMappingURL=use-terminal-layout.js.map