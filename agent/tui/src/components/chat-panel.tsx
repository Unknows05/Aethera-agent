import React from "react";
import { Box, Text } from "ink";
import type { AgentMessage } from "../types.js";

interface ChatPanelProps {
  messages: AgentMessage[];
}

function agentPrefix(agent: AgentMessage["agent"]): string {
  switch (agent) {
    case "hunter": return "[HUNTER]";
    case "healer": return "[HEALER]";
    case "system": return "";
  }
}

function agentColor(agent: AgentMessage["agent"]): string {
  switch (agent) {
    case "hunter": return "cyan";
    case "healer": return "magenta";
    case "system": return "white";
  }
}

export default function ChatPanel({ messages }: ChatPanelProps) {
  const visible = messages.slice(-20);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color="cyan">
        Agent Log
      </Text>
      <Box
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        flexGrow={1}
        minHeight={10}
      >
        <Box flexDirection="column" width="100%">
          {visible.length === 0 && <Text color="gray">No messages yet...</Text>}
          {visible.map((m) => {
            const prefix = agentPrefix(m.agent);
            const color = m.color || agentColor(m.agent);
            const ts = new Date(m.timestamp).toLocaleTimeString();
            return (
              <Text key={m.id} color={color}>
                {prefix ? `${prefix} ` : ""}{m.content}
              </Text>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
