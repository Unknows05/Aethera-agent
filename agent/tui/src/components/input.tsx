import React from "react";
import { Box, Text } from "ink";
import { TextInput } from "@inkjs/ui";

interface CommandInputProps {
  onSubmit: (value: string) => void;
  inputKey: number;
}

const SUGGESTIONS = [
  "/help",
  "/status",
  "/signals",
  "/scan",
  "/positions",
  "/health",
  "/clear",
  "/filter BTC",
];

export default function CommandInput({ onSubmit, inputKey }: CommandInputProps) {
  return (
    <Box marginTop={1}>
      <Text color="green">
        ❯{" "}
      </Text>
      <TextInput
        key={inputKey}
        onSubmit={onSubmit}
        suggestions={SUGGESTIONS}
        placeholder="Type /help for commands..."
      />
    </Box>
  );
}
