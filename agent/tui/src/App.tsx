import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import Header from "./components/header.js";
import ChatPanel from "./components/chat-panel.js";
import StatusPanel from "./components/status-panel.js";
import CommandInput from "./components/input.js";
import type { SystemStatus, Signal, AgentMessage, WsMessage } from "./types.js";

interface AppProps {
  baseUrl: string;
}

function getWsUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const proto = url.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${url.host}/ws`;
}

export default function App({ baseUrl }: AppProps) {
  const { exit } = useApp();
  const [status, setStatus] = useState<SystemStatus>({
    ok: false,
    mode: "INIT",
    balance: null,
    equity: null,
    openPositions: 0,
    positions: [],
    cycleCount: 0,
    lastCycle: "-",
  });
  const [signals, setSignals] = useState<Signal[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([
    { id: "0", agent: "system", content: "Aethera v2 — Autonomous AI Trading Agent", timestamp: Date.now() },
    { id: "1", agent: "system", content: "Type /help for commands", timestamp: Date.now() },
  ]);
  const [wsConnected, setWsConnected] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval>>();
  const symbolFilter = useRef<string>("");

  const addMessage = useCallback((agent: AgentMessage["agent"], content: string, color?: string) => {
    setMessages((prev) => [
      ...prev.slice(-100),
      { id: String(Date.now()) + Math.random(), agent, content, timestamp: Date.now(), color },
    ]);
  }, []);

  // Fetch initial data
  useEffect(() => {
    fetch(`${baseUrl}/api/status`)
      .then((r) => r.json())
      .then((d) => {
        setStatus((s) => ({ ...s, ok: true, mode: "LIVE", balance: d.balance, equity: d.equity, openPositions: d.openPositions, positions: d.positions }));
      })
      .catch(() => addMessage("system", "API not reachable — waiting for connection"));

    fetch(`${baseUrl}/api/signals`)
      .then((r) => r.json())
      .then((d) => {
        if (d.signals) setSignals(d.signals);
      })
      .catch(() => { /* ignore */ });
  }, [baseUrl]);

  // WebSocket
  useEffect(() => {
    let ws: WebSocket;
    const connect = () => {
      ws = new WebSocket(getWsUrl(baseUrl));

      ws.onopen = () => {
        setWsConnected(true);
        addMessage("system", "WebSocket connected");
        pingTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
        }, 30_000);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as WsMessage;
          const d = msg as Record<string, unknown>;

          switch (msg.type) {
            case "update":
              if (d.status) setStatus(d.status as SystemStatus);
              if (d.signals) setSignals(d.signals as Signal[]);
              break;
            case "trade": {
              const s = d.symbol as string;
              const act = d.action as string;
              addMessage("system", `Trade: ${s} ${act}${d.pnl ? " PnL: $" + Number(d.pnl).toFixed(2) : ""}`);
              break;
            }
            case "alert": {
              const level = d.level as string;
              addMessage("system", `[${level?.toUpperCase()}] ${d.message as string}`, level === "critical" ? "red" : "yellow");
              break;
            }
            case "cycle":
              addMessage("hunter", d.summary as string, "cyan");
              setStatus((s) => ({ ...s, cycleCount: s.cycleCount + 1, lastCycle: new Date().toISOString() }));
              break;
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (pingTimer.current) clearInterval(pingTimer.current);
        setTimeout(connect, 3000);
      };

      ws.onerror = () => { /* onclose fires automatically */ };
    };

    connect();
    return () => {
      ws?.close();
      if (pingTimer.current) clearInterval(pingTimer.current);
    };
  }, [baseUrl]);

  useInput((input, key) => {
    if (input === "q" && !key.ctrl) exit();
  });

  const handleCommand = useCallback(
    async (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed || trimmed.startsWith("q")) return;

      addMessage("system", `> ${trimmed}`, "cyan");

      switch (trimmed) {
        case "/help": {
          addMessage("system", "Commands: /status /signals /scan /positions /health /clear /filter <symbol> /q");
          break;
        }
        case "/status": {
          try {
            const r = await fetch(`${baseUrl}/api/status`);
            const d = await r.json();
            addMessage("system", `Equity: $${d.equity?.toFixed(2)} | Positions: ${d.openPositions} | Mode: ${d.mode || "LIVE"}`);
          } catch { addMessage("system", "Failed to fetch status"); }
          break;
        }
        case "/signals": {
          try {
            const r = await fetch(`${baseUrl}/api/signals`);
            const d = await r.json() as { signals: Signal[] };
            const filtered = symbolFilter.current
              ? d.signals.filter((s) => s.symbol.includes(symbolFilter.current))
              : d.signals;
            addMessage("system", `Signals (${filtered.length}):`);
            filtered.slice(0, 15).forEach((s) => {
              addMessage("system", `  ${s.symbol} → ${s.direction} (${s.confidence}%) score=${s.score.toFixed(1)} ${s.regime}`);
            });
          } catch { addMessage("system", "Failed to fetch signals"); }
          break;
        }
        case "/scan": {
          addMessage("system", "Triggering market scan...");
          try {
            const r = await fetch(`${baseUrl}/api/signals?top=5`);
            const d = await r.json() as { signals: Signal[]; scanDuration: number };
            addMessage("system", `Scan complete in ${d.scanDuration}ms — ${d.signals.length} signals`);
            if (d.signals.length > 0) setSignals(d.signals);
          } catch { addMessage("system", "Scan failed"); }
          break;
        }
        case "/positions": {
          try {
            const r = await fetch(`${baseUrl}/api/status`);
            const d = await r.json();
            if (d.positions?.length > 0) {
              d.positions.forEach((p: { symbol: string; side: string; size: number; entryPrice: number; pnl: number }) => {
                addMessage("system", `${p.symbol} ${p.side} ${p.size} @ $${p.entryPrice} PnL: $${p.pnl.toFixed(2)}`);
              });
            } else {
              addMessage("system", "No open positions");
            }
          } catch { addMessage("system", "Failed to fetch positions"); }
          break;
        }
        case "/health": {
          try {
            const r = await fetch(`${baseUrl}/api/health`);
            const d = await r.json();
            addMessage("system", `Health: ${d.status} | Uptime: ${Math.floor(d.uptime / 1000)}s`);
          } catch { addMessage("system", "API unreachable"); }
          break;
        }
        case "/clear":
          setMessages([]);
          break;
        default: {
          if (trimmed.startsWith("/filter ")) {
            symbolFilter.current = trimmed.slice(8).trim();
            addMessage("system", `Filter set to: ${symbolFilter.current || "none"}`);
          } else {
            addMessage("system", `Unknown: ${trimmed} — try /help`);
          }
        }
      }
    },
    [baseUrl],
  );

  const onInputSubmit = (value: string) => {
    handleCommand(value);
    setInputKey((k) => k + 1);
  };

  const width = process.stdout.columns || 120;

  return (
    <Box flexDirection="column" width={width}>
      <Header
        status={status}
        wsConnected={wsConnected}
        baseUrl={baseUrl}
      />

      <Box marginTop={1} flexGrow={1}>
        <Box width={Math.floor(width * 0.62)}>
          <ChatPanel messages={messages} />
        </Box>
        <Box width={Math.floor(width * 0.38)} paddingLeft={1}>
          <StatusPanel status={status} signals={signals} />
        </Box>
      </Box>

      <CommandInput onSubmit={onInputSubmit} inputKey={inputKey} />

      <Box marginTop={1}>
        <Text color="gray">
          q=quit  /status  /signals  /scan  /positions  /health  /clear  /filter &lt;symbol&gt;
        </Text>
      </Box>
    </Box>
  );
}
