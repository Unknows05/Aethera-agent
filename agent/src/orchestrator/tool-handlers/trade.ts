import { BinanceClient } from "../../exchange/binance.js";
import type { Context } from "../context.js";
import type { ToolResult } from "../tools.js";
import { checkHardRules } from "../tools.js";

interface PositionInfo {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  markPrice: number;
  size: number;
  unrealizedPnl: number;
  leverage: number;
  liquidationPrice: number;
}

export class TradeHandler {
  private binance: BinanceClient | null = null;

  setBinance(client: BinanceClient): void {
    this.binance = client;
  }

  async executeOpenLong(
    toolCallId: string,
    params: { symbol: string; confidence: number; reason: string },
    ctx: Context,
    positionSize: number,
    slPrice: number,
    tpPrice: number,
    leverage: number,
  ): Promise<ToolResult> {
    const ruleCheck = checkHardRules("open_long", params as unknown as Record<string, unknown>, ctx);
    if (!ruleCheck.allowed) {
      return { toolCallId, success: false, error: ruleCheck.reason };
    }

    if (!this.binance) {
      return { toolCallId, success: false, error: "Binance not connected" };
    }

    try {
      await this.binance.setLeverage(params.symbol, leverage);
      await this.binance.placeOrder({
        symbol: params.symbol,
        side: "BUY",
        type: "MARKET",
        quantity: positionSize,
      });

      return {
        toolCallId,
        success: true,
        data: {
          action: "open_long",
          symbol: params.symbol,
          size: positionSize,
          entryPrice: ctx.screening.find((s) => s.symbol === params.symbol)?.sl ?? 0,
          sl: slPrice,
          tp: tpPrice,
          leverage,
          confidence: params.confidence,
          reason: params.reason,
        },
      };
    } catch (e) {
      return {
        toolCallId,
        success: false,
        error: `Binance API error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async executeOpenShort(
    toolCallId: string,
    params: { symbol: string; confidence: number; reason: string },
    ctx: Context,
    positionSize: number,
    slPrice: number,
    tpPrice: number,
    leverage: number,
  ): Promise<ToolResult> {
    const ruleCheck = checkHardRules("open_short", params as unknown as Record<string, unknown>, ctx);
    if (!ruleCheck.allowed) {
      return { toolCallId, success: false, error: ruleCheck.reason };
    }

    if (!this.binance) {
      return { toolCallId, success: false, error: "Binance not connected" };
    }

    try {
      await this.binance.setLeverage(params.symbol, leverage);
      await this.binance.placeOrder({
        symbol: params.symbol,
        side: "SELL",
        type: "MARKET",
        quantity: positionSize,
      });

      return {
        toolCallId,
        success: true,
        data: {
          action: "open_short",
          symbol: params.symbol,
          size: positionSize,
          sl: slPrice,
          tp: tpPrice,
          leverage,
          confidence: params.confidence,
          reason: params.reason,
        },
      };
    } catch (e) {
      return {
        toolCallId,
        success: false,
        error: `Binance API error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async executeClosePosition(
    toolCallId: string,
    params: { symbol: string; reason: string },
  ): Promise<ToolResult> {
    if (!this.binance) {
      return { toolCallId, success: false, error: "Binance not connected" };
    }

    try {
      const pos = await this.getPosition(params.symbol);
      if (!pos || Number(pos.size) === 0) {
        return { toolCallId, success: false, error: `No open position for ${params.symbol}` };
      }

      const closeSide = pos.side === "LONG" ? "SELL" : "BUY";
      await this.binance.placeOrder({
        symbol: params.symbol,
        side: closeSide,
        type: "MARKET",
        quantity: Math.abs(pos.size),
        reduceOnly: true,
      });

      return {
        toolCallId,
        success: true,
        data: {
          action: "close",
          symbol: params.symbol,
          side: pos.side,
          entryPrice: pos.entryPrice,
          pnl: pos.unrealizedPnl,
          size: Math.abs(pos.size),
          leverage: pos.leverage,
          reason: params.reason,
        },
      };
    } catch (e) {
      return {
        toolCallId,
        success: false,
        error: `Close failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async executePartialClose(
    toolCallId: string,
    params: { symbol: string; percent: number; reason: string },
  ): Promise<ToolResult> {
    if (!this.binance) {
      return { toolCallId, success: false, error: "Binance not connected" };
    }

    try {
      const pos = await this.getPosition(params.symbol);
      if (!pos || Number(pos.size) === 0) {
        return { toolCallId, success: false, error: `No open position for ${params.symbol}` };
      }

      const closeSize = Math.abs(pos.size) * (params.percent / 100);
      const closeSide = pos.side === "LONG" ? "SELL" : "BUY";

      await this.binance.placeOrder({
        symbol: params.symbol,
        side: closeSide,
        type: "MARKET",
        quantity: closeSize,
        reduceOnly: true,
      });

      return {
        toolCallId,
        success: true,
        data: {
          action: "partial_close",
          symbol: params.symbol,
          percent: params.percent,
          size: closeSize,
          reason: params.reason,
        },
      };
    } catch (e) {
      return {
        toolCallId,
        success: false,
        error: `Partial close failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async getPosition(symbol: string): Promise<PositionInfo | null> {
    if (!this.binance) return null;

    try {
      const positions = await this.binance.getPositionRisk();
      const pos = positions.find((p) => p.symbol === symbol && Number(p.positionAmt) !== 0);
      if (!pos) return null;

      const amt = Number(pos.positionAmt);
      return {
        symbol: pos.symbol,
        side: amt > 0 ? "LONG" : "SHORT",
        entryPrice: Number(pos.entryPrice),
        markPrice: Number(pos.markPrice),
        size: Math.abs(amt),
        unrealizedPnl: Number(pos.unrealizedProfit),
        leverage: Number(pos.leverage),
        liquidationPrice: Number(pos.liquidationPrice),
      };
    } catch {
      return null;
    }
  }
}
