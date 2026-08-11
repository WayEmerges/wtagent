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
    <Box flexDirection="column" paddingX={1} borderStyle="round" borderColor="gray">
      <Text dimColor>Select model</Text>
      {choices.map((c, i) => {
        const active = i === selected;
        const mark = c.key === current ? "*" : " ";
        const name = `${mark} ${c.key}  ${c.label}`;
        const extra = c.disabled ? "  (disabled)" : c.baseURL ? `  ${c.baseURL}` : "";
        return (
          <Box key={c.key}>
            <Text inverse={active} dimColor={c.disabled && !active}>
              {name}
            </Text>
            <Text dimColor>{extra}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
