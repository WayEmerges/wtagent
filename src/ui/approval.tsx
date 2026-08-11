import { Box, Text } from "ink";
import { useStore } from "../state/store.js";

export function ApprovalCard() {
  const pending = useStore((s) => s.pendingShell);
  if (!pending) {
    return null;
  }
  return (
    <Box flexDirection="column" marginTop={1} paddingX={1} borderStyle="single" borderColor="yellow">
      <Text color="yellow">run_shell</Text>
      <Text>{pending.command}</Text>
      <Text dimColor>[y] allow  [n] deny  [s] allow for this session</Text>
    </Box>
  );
}
