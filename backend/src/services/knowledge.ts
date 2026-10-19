import { scalarAiDb } from "../db";
import { AiKnowledgeBase } from "../types";

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
