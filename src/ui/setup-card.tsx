import { Box, Text } from "ink";
import { useStore } from "../state/store.js";

export function SetupCard() {
  const config = useStore((s) => s.config);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} justifyContent="center">
      <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} paddingY={0}>
        <Text color="yellow">Setup</Text>
        <Text> </Text>
        {config.invalid ? (
          <Text color="red">Invalid config: {config.invalid}</Text>
        ) : (
          <Text>No config file yet. Copy the example, then edit URLs for your server.</Text>
        )}
        <Text> </Text>
        <Text dimColor>{config.path}</Text>
        <Text> </Text>
        <Text>mkdir -p ~/.waytech-agent</Text>
        <Text>cp ~/Projects/local_cli/config.json.example ~/.waytech-agent/config.json</Text>
        <Text> </Text>
        <Text dimColor>/quit to exit · /help for commands</Text>
      </Box>
    </Box>
  );
}
