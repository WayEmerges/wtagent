import { Box, Text } from "ink";
import { useStore } from "../state/store.js";

export function ApprovalCard() {
  const pending = useStore((s) => s.pendingShell);
  if (!pending) {
    return null;
  }
  return (
    <Box flexDirection="column" marginTop={1} marginX={1} borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1}>
      <Text color="yellow">run_shell</Text>
      <Text>{pending.command}</Text>
      <Text dimColor>[y] allow  [n] deny  [s] allow for this session</Text>
    </Box>
  );
}
