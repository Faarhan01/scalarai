import { scalarAiDb } from "../db";
import { ObservationRow } from "../types";

export interface Observation {
  id: string;
  symbol: string;
  timestamp: number;
  direction: "up" | "down" | "flat";
  velocity: number;
  price: number;
  candleId?: number;
  tags: string[];
  metadata: Record<string, any>;
  createdAt: string;
}

export interface ObservationFilters {
  symbol?: string;
  from?: number;
  to?: number;
  direction?: "up" | "down" | "flat";
  minVelocity?: number;
  maxVelocity?: number;
  tags?: string[];
  limit?: number;
}

export interface ObservationInsights {
  symbol: string;
  totalObservations: number;
  avgVelocity: number;
  peakVelocity: number;
  directionDistribution: { up: number; down: number; flat: number };
  topActiveHours: { hour: number; count: number }[];
  velocityClusters: { min: number; max: number; count: number }[];
  suggestedStrategies: string[];
}

export class ObservationsService {
  constructor(private db: typeof scalarAiDb) {}

  private mapRow(row: ObservationRow): Observation {
    let tags: string[] = [];
    try { tags = JSON.parse(row.tags || "[]"); } catch { tags = []; }
    let metadata: Record<string, any> = {};
    try { metadata = JSON.parse(row.metadata || "{}"); } catch { metadata = {}; }
    return {
      id: row.id,
      symbol: row.symbol,
      timestamp: row.timestamp,
      direction: row.direction,
      velocity: row.velocity,
      price: row.price,
      candleId: row.candle_id ?? undefined,
      tags,
      metadata,
      createdAt: row.created_at,
    };
  }

  storeObservation(obs: Omit<Observation, "id" | "createdAt">): string {
    const id = `obs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const row: ObservationRow = {
      id,
      symbol: obs.symbol,
      timestamp: obs.timestamp,
      direction: obs.direction,
      velocity: obs.velocity,
      price: obs.price,
      candle_id: obs.candleId ?? null,
      tags: JSON.stringify(obs.tags),
      metadata: JSON.stringify(obs.metadata),
      created_at: new Date().toISOString(),
    };
    this.db.insertObservation(row);
    return id;
  }

  getObservations(filters: ObservationFilters = {}): Observation[] {
    const rows = this.db.getObservations(filters.symbol, filters.from, filters.to, filters.limit || 500);
    return rows.map(row => this.mapRow(row));
  }

  getObservationsByCandle(candleId: number): Observation[] {
    const rows = this.db.rawQuery(`SELECT * FROM observations WHERE candle_id = ? ORDER BY timestamp DESC`, [candleId]) as ObservationRow[];
    return rows.map(row => this.mapRow(row));
  }

  generateInsights(symbol: string, timeRange: { from?: number; to?: number }): ObservationInsights {
    const observations = this.getObservations({ symbol, from: timeRange.from, to: timeRange.to, limit: 5000 });

    if (observations.length === 0) {
      return {
        symbol,
        totalObservations: 0,
        avgVelocity: 0,
        peakVelocity: 0,
        directionDistribution: { up: 0, down: 0, flat: 0 },
        topActiveHours: [],
        velocityClusters: [],
        suggestedStrategies: [],
      };
    }

    const directionDistribution = { up: 0, down: 0, flat: 0 };
    const hourCounts: Record<number, number> = {};
    let totalVelocity = 0;
    let peakVelocity = 0;

    for (const obs of observations) {
      directionDistribution[obs.direction]++;
      totalVelocity += obs.velocity;
      peakVelocity = Math.max(peakVelocity, obs.velocity);

      const hour = new Date(obs.timestamp).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }

    const topActiveHours = Object.entries(hourCounts)
      .map(([hour, count]) => ({ hour: Number(hour), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const velocityClusters = [
      { min: 0, max: 0.1, count: 0 },
      { min: 0.1, max: 0.2, count: 0 },
      { min: 0.2, max: 0.3, count: 0 },
      { min: 0.3, max: Infinity, count: 0 },
    ];
    for (const obs of observations) {
      for (const cluster of velocityClusters) {
        if (obs.velocity >= cluster.min && obs.velocity < cluster.max) {
          cluster.count++;
          break;
        }
      }
    }

    const suggestedStrategies: string[] = [];
    if (directionDistribution.up > directionDistribution.down * 1.5) {
      suggestedStrategies.push("trend_following");
    }
    if (directionDistribution.down > directionDistribution.up * 1.5) {
      suggestedStrategies.push("mean_reversion");
    }
    if (peakVelocity > 0.3) {
      suggestedStrategies.push("velocity_scalping");
    }
    if (topActiveHours.length > 0 && topActiveHours[0].count > observations.length * 0.2) {
      suggestedStrategies.push("time_based_trading");
    }

    return {
      symbol,
      totalObservations: observations.length,
      avgVelocity: totalVelocity / observations.length,
      peakVelocity,
      directionDistribution,
      topActiveHours,
      velocityClusters: velocityClusters.filter(c => c.count > 0),
      suggestedStrategies,
    };
  }

  linkObservationToStrategy(observationId: string, strategyId: string): void {
    const rows = this.db.rawQuery(`SELECT * FROM observations WHERE id = ?`, [observationId]) as ObservationRow[];
    if (rows.length === 0) return;
    const row = rows[0];
    let metadata: Record<string, any> = {};
    try { metadata = JSON.parse(row.metadata || "{}"); } catch { metadata = {}; }
    metadata.linkedStrategyId = strategyId;
    this.db.rawQuery(`UPDATE observations SET metadata = ? WHERE id = ?`, [JSON.stringify(metadata), observationId]);
  }

  getObservationsForStrategy(strategyId: string): Observation[] {
    const rows = this.db.rawQuery(
      `SELECT * FROM observations WHERE json_extract(metadata, '$.linkedStrategyId') = ? ORDER BY timestamp DESC`,
      [strategyId]
    ) as ObservationRow[];
    return rows.map(row => this.mapRow(row));
  }
}
