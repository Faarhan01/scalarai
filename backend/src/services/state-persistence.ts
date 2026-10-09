import {
  TradeConfig,
  TradeRecord,
  SystemLog,
  AiKnowledgeBase,
  AiSynthesizedStrategy,
  EAConnectionDetails,
} from "../types";
import { scalarAiDb } from "../db";
import { getDefaultTradeConfig, getDefaultAiKnowledgeBase, getDefaultAiSynthesizedStrategy } from "./defaults";

export function loadStateFromDb() {
  const savedConfig = scalarAiDb.getSettings();
  const savedKnowledge = scalarAiDb.getAiKnowledge();
  const savedStrategy = scalarAiDb.getAiStrategy();
  const trades = scalarAiDb.getTrades();
  const logs = scalarAiDb.getLogs(80);

  return {
    tradeConfig: savedConfig || getDefaultTradeConfig(),
    aiKnowledgeBase: savedKnowledge || getDefaultAiKnowledgeBase(),
    aiSynthesizedStrategy: savedStrategy || getDefaultAiSynthesizedStrategy(),
    trades,
    logs,
  };
}

export function persistTrade(trade: TradeRecord) {
  scalarAiDb.insertTrade(trade);
}

export function persistLog(log: SystemLog) {
  scalarAiDb.insertLog(log);
}

export function persistAiKnowledge(knowledge: AiKnowledgeBase) {
  scalarAiDb.upsertAiKnowledge(knowledge);
}

export function persistAiStrategy(strategy: AiSynthesizedStrategy) {
  scalarAiDb.upsertAiStrategy(strategy);
}

export function persistSettings(config: TradeConfig) {
  scalarAiDb.upsertSettings(config);
}

export function persistEaConnection(conn: EAConnectionDetails) {
  scalarAiDb.upsertEaConnection(conn);
}
