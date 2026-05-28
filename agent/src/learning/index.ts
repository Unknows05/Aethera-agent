export {
  recordPerformance,
  addManualLesson,
  getLessonsForPrompt,
  getPerformanceSummary,
  listLessons,
} from "./lessons.js";
export type { Lesson } from "./lessons.js";

export {
  recordDeploy,
  getPoolMemory,
  isOnCooldown,
  addPoolNote,
  recallForSymbol,
} from "./pool-memory.js";

export {
  recalculateWeights,
  getWeightsSummary,
  getWeights,
} from "./signal-weights.js";

export {
  recordSkillUse,
  curatorCycle,
  getSkillSummary,
} from "./curator.js";

export { analyzeTurn } from "./post-turn-review.js";
export type { TurnReview } from "./post-turn-review.js";

export {
  evolveThresholds,
  getThresholdState,
  applyThresholdsToConfig,
} from "./threshold-evolution.js";
