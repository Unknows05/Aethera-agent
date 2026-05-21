import type { Context } from "./context.js";

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "wait",
      description: "Skip trading this cycle. Use when market conditions are unfavorable, no clear setup, or when you want to observe.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Brief reason for waiting (max 200 chars)",
          },
        },
        required: ["reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_long",
      description: "Open a LONG position. Use when you have high conviction that price will increase.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Trading pair symbol (e.g. BTCUSDT)",
          },
          confidence: {
            type: "number",
            description: "Your confidence in this trade (0-85)",
            minimum: 0,
            maximum: 85,
          },
          reason: {
            type: "string",
            description: "Brief reasoning for this trade (max 200 chars)",
          },
        },
        required: ["symbol", "confidence", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_short",
      description: "Open a SHORT position. Use when you have high conviction that price will decrease.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Trading pair symbol (e.g. BTCUSDT)",
          },
          confidence: {
            type: "number",
            description: "Your confidence in this trade (0-85)",
            minimum: 0,
            maximum: 85,
          },
          reason: {
            type: "string",
            description: "Brief reasoning for this trade (max 200 chars)",
          },
        },
        required: ["symbol", "confidence", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "close_position",
      description: "Close an existing position immediately.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Symbol to close (e.g. BTCUSDT)",
          },
          reason: {
            type: "string",
            description: "Reason for closing (max 200 chars)",
          },
        },
        required: ["symbol", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "partial_close",
      description: "Partially close a position to take profit or reduce risk.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Symbol to partially close",
          },
          percent: {
            type: "number",
            description: "Percentage to close (25, 50, or 75)",
            enum: [25, 50, 75],
          },
          reason: {
            type: "string",
            description: "Reason for partial close (max 200 chars)",
          },
        },
        required: ["symbol", "percent", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trail_sl",
      description: "Move stop loss to trail price for locking profits.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Symbol to trail",
          },
          trail_percent: {
            type: "number",
            description: "Trail distance from current price in percent (e.g. 2.0 = 2%)",
            minimum: 0.1,
            maximum: 10,
          },
        },
        required: ["symbol", "trail_percent"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scan_market",
      description: "Trigger an immediate market scan for new signals.",
      parameters: {
        type: "object",
        properties: {
          symbols: {
            type: "array",
            items: { type: "string" },
            description: "Optional specific symbols to scan. Empty = scan all.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_lesson",
      description: "Add a manual lesson based on observation (e.g. a pattern you noticed).",
      parameters: {
        type: "object",
        properties: {
          rule: {
            type: "string",
            description: "The lesson rule (max 400 chars)",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags for categorization (e.g. risk, entry, exit, pattern)",
          },
        },
        required: ["rule", "tags"],
      },
    },
  },
];

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  toolCallId: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface HardRuleCheck {
  allowed: boolean;
  reason?: string;
}

export function checkHardRules(
  action: string,
  params: Record<string, unknown>,
  ctx: Context,
): HardRuleCheck {
  // Circuit breaker
  if (ctx.risk.circuitBreakerActive && ["open_long", "open_short"].includes(action)) {
    return {
      allowed: false,
      reason: `Circuit breaker active: ${ctx.risk.circuitBreakerReason}`,
    };
  }

  // Max trades per day
  if (["open_long", "open_short"].includes(action)) {
    if (ctx.account.dailyTrades >= ctx.goal.riskTier.maxTrades) {
      return {
        allowed: false,
        reason: `Max daily trades (${ctx.goal.riskTier.maxTrades}) reached`,
      };
    }
  }

  // Max drawdown — emergency stop (> recovery STOP level)
  if (["open_long", "open_short"].includes(action)) {
    if (ctx.risk.drawdown > 0.25) {
      return {
        allowed: false,
        reason: `Drawdown ${(ctx.risk.drawdown * 100).toFixed(1)}% exceeds 25% emergency limit`,
      };
    }
  }

  // Daily loss limit (tier-based)
  if (["open_long", "open_short"].includes(action)) {
    const maxLoss = 0.25;
    if (ctx.risk.dailyLossPct >= maxLoss) {
      return {
        allowed: false,
        reason: `Daily loss ${(ctx.risk.dailyLossPct * 100).toFixed(1)}% exceeds ${(maxLoss * 100).toFixed(0)}% limit`,
      };
    }
  }

  return { allowed: true };
}
