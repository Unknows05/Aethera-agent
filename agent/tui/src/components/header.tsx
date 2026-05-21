import React from "react";
import { Box, Text } from "ink";
import type { SystemStatus } from "../types.js";

interface HeaderProps {
  status: SystemStatus;
  wsConnected: boolean;
  baseUrl: string;
}

export default function Header({ status, wsConnected, baseUrl }: HeaderProps) {
  const modeColor = status.ok ? "green" : "red";
  const connSymbol = wsConnected ? "●" : "○";
  const connColor = wsConnected ? "green" : "red";
  const balanceStr = status.equity != null ? `$${status.equity.toFixed(2)}` : "---";

  return (
    <Box>
      <Text bold color="cyan">
        Aethera v2
      </Text>
      <Text>  </Text>
      <Text color={modeColor} bold>
        [{status.mode}]
      </Text>
      <Text>  </Text>
      <Text color={connColor}>{connSymbol}</Text>
      <Text>  </Text>
      <Text color="green" bold>
        {balanceStr}
      </Text>
      <Text>  </Text>
      <Text color="gray">
        Cycles: {status.cycleCount} | Positions: {status.openPositions}
      </Text>
    </Box>
  );
}
