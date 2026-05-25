import React from "react";
import { Box, Text } from "ink";
import React from "react";
import { Box, Text } from "ink";
import type { SystemStatus, Signal } from "../types.js";

interface StatusPanelProps {
  status: SystemStatus;
  signals: Signal[];
}

export default function StatusPanel({ status, signals }: StatusPanelProps) {
  const longs = signals.filter((s) => s.direction === "LONG").length;
  const shorts = signals.filter((s) => s.direction === "SHORT").length;
  const waits = signals.filter((s) => s.direction === "WAIT").length;

  const pnlColor = (pnl: number): string => (pnl >= 0 ? "green" : "red");

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        Status
      </Text>
      <Box flexDirection="column">
        <Text>
          Balance:{" "}
          <Text color="green">{status.equity != null ? `$${status.equity.toFixed(2)}` : "---"}</Text>
        </Text>
        <Text>Positions: {status.openPositions}</Text>
        <Text>Signals: {longs}L / {shorts}S / {waits}W</Text>
        <Text>Cycles: {status.cycleCount}</Text>
        <Text>Last: {status.lastCycle !== "-" ? new Date(status.lastCycle).toLocaleTimeString() : "-"}</Text>
      </Box>

      {status.openPositions > 0 && (
        <>
          <Box marginTop={1}>
            <Text bold color="cyan">
              Positions
            </Text>
          </Box>
          {status.positions.map((p, i) => (
            <Box key={i} flexDirection="column">
              <Text>
                {p.symbol} <Text color={p.side === "LONG" ? "green" : "red"}>{p.side}</Text>
              </Text>
              <Text>
                Size: {p.size.toFixed(4)} | Lev: {p.leverage}x
              </Text>
              <Text>
                Entry: ${p.entryPrice.toFixed(2)}
              </Text>
              <Text color={pnlColor(p.pnl)}>
                PnL: ${p.pnl.toFixed(2)}
              </Text>
              <Text color="gray">
                Liq: ${p.liquidationPrice.toFixed(2)}
              </Text>
            </Box>
          ))}
        </>
      )}

      {signals.length > 0 && (
        <>
          <Box marginTop={1}>
            <Text bold color="cyan">
              Top Signals
            </Text>
          </Box>
          {signals.slice(0, 5).map((s, i) => {
            const enrich = s.fundingRate ? ` | F:${(s.fundingRate * 100).toFixed(3)}% OI:${s.openInterest ? `$${(s.openInterest / 1e6).toFixed(0)}M` : "-"} Taker:${(s.takerBuyRatio ?? 0).toFixed(2)}` : "";
            return (
              <Text key={i} color={s.direction === "LONG" ? "green" : s.direction === "SHORT" ? "red" : "gray"}>
                {s.symbol} {s.direction} {s.confidence}% {s.score.toFixed(0)}{enrich}
              </Text>
            );
          })}
        </>
      )}
    </Box>
  );
}
