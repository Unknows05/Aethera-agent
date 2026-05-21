import { addManualLesson } from "./lessons.js";
import { recordSkillUse } from "./curator.js";

export interface TurnReview {
  observations: string[];
  lessonsExtracted: number;
  skillsUsed: string[];
}

export function analyzeTurn(
  context: {
    action: string;
    symbol?: string;
    success: boolean;
    error?: string;
    reasoning?: string;
  },
): TurnReview {
  const observations: string[] = [];
  let lessonsExtracted = 0;
  const skillsUsed: string[] = [];

  if (context.success && context.action === "wait") {
    observations.push("Agent memilih wait — kondisi belum sesuai");
  }

  if (!context.success && context.error) {
    const lesson = `[REVIEW] Action ${context.action} gagal: ${context.error}`;
    addManualLesson(lesson, ["review", "failure"], { role: "general" });
    lessonsExtracted++;
    observations.push(`Lesson extracted from failure: ${lesson}`);
  }

  if (context.action === "open_long" || context.action === "open_short") {
    skillsUsed.push(context.action);
    recordSkillUse(context.action);

    if (context.success) {
      observations.push(`${context.action.toUpperCase()} executed on ${context.symbol}`);
    }
  }

  if (context.action === "close_position" || context.action === "partial_close") {
    skillsUsed.push(context.action);
    recordSkillUse(context.action);
  }

  return { observations, lessonsExtracted, skillsUsed };
}
