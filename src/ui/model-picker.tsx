import { Box, Text } from "ink";
import type { ModelChoice } from "../config/load.js";

export function ModelPicker({
  choices,
  selected,
  current,
}: {
  choices: ModelChoice[];
  selected: number;
  current: string;
}) {
  return (
    <Box flexDirection="column" paddingX={2}>
      <Box paddingLeft={3}>
        <Text dimColor>Select model</Text>
      </Box>
      {choices.map((c, i) => {
        const active = i === selected;
        const mark = c.key === current ? "*" : " ";
        const name = `${mark} ${c.key}  ${c.label}`;
        const extra = c.disabled ? "  (disabled)" : c.baseURL ? `  ${c.baseURL}` : "";
        return (
          <Box key={c.key} width="100%" flexDirection="row" alignItems="center">
            <Box width={1} backgroundColor={active ? "cyan" : undefined}>
              <Text> </Text>
            </Box>
            <Box width={2}>
              <Text color={active ? "cyan" : undefined} dimColor={!active}>
                {active ? "→ " : "  "}
              </Text>
            </Box>
            <Text bold={active} dimColor={c.disabled && !active} wrap="truncate">
              {name}
              {extra}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
