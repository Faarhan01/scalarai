import { scalarAiDb } from "backend/db";
import { AiKnowledgeBase } from "backend/types";

export interface KnowledgeUpdateResult {
  totalObservations: number;
  globalAverageSpeed: number;
  peakVelocityRegistered: number;
  updatedHours: string[];
}

export function updateKnowledgeBaseFromTelemetry(symbol: string, telemetry: Array<{ velocity: number; timestamp: number }>): KnowledgeUpdateResult {
  if (!telemetry || telemetry.length === 0) {
    return { totalObservations: 0, globalAverageSpeed: 0, peakVelocityRegistered: 0, updatedHours: [] };
  }

  const existing = scalarAiDb.getAiKnowledge();
  const knowledge: AiKnowledgeBase = existing || {
    totalObservations: 0,
    globalAverageSpeed: 0,
    peakVelocityRegistered: 0,
    timeOfDayPatterns: {},
    lastUpdated: new Date().toISOString(),
  };

  const newObservations = telemetry.length;
  const velocities = telemetry.map(t => Math.abs(t.velocity));
  const avgSpeed = velocities.reduce((a, b) => a + b, 0) / velocities.length;
  const peakSpeed = Math.max(...velocities);

  // Update global averages with exponential moving average
  const alpha = 0.1;
  knowledge.globalAverageSpeed = Number((alpha * avgSpeed + (1 - alpha) * (knowledge.globalAverageSpeed || 0)).toFixed(4));
  knowledge.peakVelocityRegistered = Number(Math.max(knowledge.peakVelocityRegistered || 0, peakSpeed).toFixed(4));
  knowledge.totalObservations += newObservations;

  // Update time-of-day patterns
  const updatedHours: string[] = [];
  for (const tel of telemetry) {
    const date = new Date(tel.timestamp);
    const hourKey = `${date.getUTCHours().toString().padStart(2, "0")}:00`;
    if (!knowledge.timeOfDayPatterns[hourKey]) {
      knowledge.timeOfDayPatterns[hourKey] = { count: 0, avgSpeed: 0 };
    }
    const pattern = knowledge.timeOfDayPatterns[hourKey];
    pattern.count += 1;
    pattern.avgSpeed = Number(((pattern.count - 1) / pattern.count * pattern.avgSpeed + 1 / pattern.count * Math.abs(tel.velocity)).toFixed(4));
    updatedHours.push(hourKey);
  }

  knowledge.lastUpdated = new Date().toISOString();
  scalarAiDb.upsertAiKnowledge(knowledge);

  return {
    totalObservations: knowledge.totalObservations,
    globalAverageSpeed: knowledge.globalAverageSpeed,
    peakVelocityRegistered: knowledge.peakVelocityRegistered,
    updatedHours: [...new Set(updatedHours)],
  };
}

// ── Pattern-aware knowledge summary ─────────────────────────────────────

export interface KnowledgeSummary {
  totalObservations: number;
  globalAverageSpeed: number;
  peakVelocityRegistered: number;
  timeOfDayPatterns: Record<string, { count: number; avgSpeed: number }>;
  patternEdgeCount: number;
  patternNoEdgeCount: number;
  topPatterns: Array<{ pattern_name: string; verdict: string; net_after_cost: number }>;
  lastUpdated: string;
}

export function getKnowledgeSummary(): KnowledgeSummary {
  const knowledge = scalarAiDb.getAiKnowledge();
  const patterns = scalarAiDb.getPatternResults(undefined, undefined, undefined, 100);
  const edgePatterns = patterns.filter(p => p.verdict === 'EDGE');
  const noEdgePatterns = patterns.filter(p => p.verdict === 'NO EDGE');
  const topPatterns = patterns
    .filter(p => p.verdict === 'EDGE')
    .sort((a, b) => b.net_after_cost - a.net_after_cost)
    .slice(0, 5)
    .map(p => ({ pattern_name: p.pattern_name, verdict: p.verdict, net_after_cost: p.net_after_cost }));

  return {
    totalObservations: knowledge?.totalObservations ?? 0,
    globalAverageSpeed: knowledge?.globalAverageSpeed ?? 0,
    peakVelocityRegistered: knowledge?.peakVelocityRegistered ?? 0,
    timeOfDayPatterns: knowledge?.timeOfDayPatterns ?? {},
    patternEdgeCount: edgePatterns.length,
    patternNoEdgeCount: noEdgePatterns.length,
    topPatterns,
    lastUpdated: knowledge?.lastUpdated ?? new Date().toISOString(),
  };
}

export function formatKnowledgeSummary(knowledge: KnowledgeSummary): string {
  const topHours = Object.entries(knowledge.timeOfDayPatterns)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([hour, data]) => `${hour} UTC: avg ${data.avgSpeed.toFixed(4)} pt/s (${data.count} obs)`)
    .join("\n");

  const patternSection = [
    '',
    'Pattern Edge Summary:',
    `- Patterns with EDGE: ${knowledge.patternEdgeCount}`,
    `- Patterns with NO EDGE: ${knowledge.patternNoEdgeCount}`,
    knowledge.topPatterns.length > 0
      ? `- Top patterns:\n${knowledge.topPatterns.map(p => `  ${p.pattern_name}: ${p.net_after_cost.toFixed(4)} net`).join('\n')}`
      : '- No edge patterns found yet',
  ].join('\n');

  return `Knowledge Base Summary:
- Total Observations: ${knowledge.totalObservations}
- Global Average Speed: ${knowledge.globalAverageSpeed.toFixed(4)} pt/s
- Peak Velocity: ${knowledge.peakVelocityRegistered.toFixed(4)} pt/s
- Last Updated: ${knowledge.lastUpdated}

Top 5 Active Hours:
${topHours || "No data yet"}
${patternSection}`;
}

export function recordPatternResult(result: import("backend/types").PatternResultRow): void {
  scalarAiDb.insertPatternResult(result);
}

export function getPatternStats(symbol: string): { total: number; edge: number; noEdge: number; inconclusive: number } {
  const patterns = scalarAiDb.getPatternResults(symbol);
  return {
    total: patterns.length,
    edge: patterns.filter(p => p.verdict === 'EDGE').length,
    noEdge: patterns.filter(p => p.verdict === 'NO EDGE').length,
    inconclusive: patterns.filter(p => p.verdict === 'INCONCLUSIVE').length,
  };
}

export function formatKnowledgeBase(knowledge: AiKnowledgeBase): string {
  const topHours = Object.entries(knowledge.timeOfDayPatterns)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([hour, data]) => `${hour} UTC: avg ${data.avgSpeed.toFixed(4)} pt/s (${data.count} obs)`)
    .join("\n");

  return `Knowledge Base Summary:
- Total Observations: ${knowledge.totalObservations}
- Global Average Speed: ${knowledge.globalAverageSpeed.toFixed(4)} pt/s
- Peak Velocity: ${knowledge.peakVelocityRegistered.toFixed(4)} pt/s
- Last Updated: ${knowledge.lastUpdated}

Top 5 Active Hours:
${topHours || "No data yet"}`;
}
