// Knowledgebase barrel export.
// Single import point for all knowledgebase modules.
// Usage: import { BacktestEngine, scanCandlePatterns, ... } from "../knowledgebase";

export * from "./knowledge";
export * from "./observations";
export * from "./patterns";
export * from "./indicators";
export * from "./strategies";
// Explicit re-exports for knowledge summary (avoids barrel ambiguity)
export { getKnowledgeSummary, formatKnowledgeSummary, recordPatternResult, getPatternStats } from "./knowledge";