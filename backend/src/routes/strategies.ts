import { Request, Response } from "express";
import { scalarAiDb } from "../db";
import { StrategyMode } from "../types";
import { STRATEGY_TEMPLATES, getStrategyTemplateById } from "../services/strategy-templates";

export function registerStrategyRoutes(app: any) {
  app.get("/api/strategies", (req: Request, res: Response) => {
    try {
      const templates = STRATEGY_TEMPLATES.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        mode: t.mode,
        category: t.category,
        tags: t.tags,
        defaultConfig: t.defaultConfig,
      }));

      const customStrategies = scalarAiDb.getAllStrategies().map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        mode: s.mode,
        category: "custom",
        tags: ["custom"],
        defaultConfig: {},
        performance: analyzeStrategyPerformance(s.id),
      }));

      res.json([...templates, ...customStrategies]);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to fetch strategies" });
    }
  });

  app.get("/api/strategies/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const template = getStrategyTemplateById(id);
      if (template) {
        return res.json({
          id: template.id,
          name: template.name,
          description: template.description,
          mode: template.mode,
          category: template.category,
          tags: template.tags,
          defaultConfig: template.defaultConfig,
        });
      }

      const custom = scalarAiDb.getStrategyById(id);
      if (custom) {
        return res.json({
          ...custom,
          performance: analyzeStrategyPerformance(id),
        });
      }

      return res.status(404).json({ error: "Strategy not found" });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to fetch strategy" });
    }
  });

  app.post("/api/strategies", (req: Request, res: Response) => {
    try {
      const { name, description, mode, rules, templateId, overrides } = req.body;
      
      if (templateId) {
        const { createStrategyFromTemplate } = require("../services/strategy-templates");
        const strategy = createStrategyFromTemplate(templateId, overrides);
        scalarAiDb.upsertAiStrategy(strategy);
        return res.json({ success: true, strategy });
      }

      if (!name || !mode) {
        return res.status(400).json({ error: "name and mode are required" });
      }

      const strategy = {
        id: `custom_${Date.now()}`,
        name,
        description: description || "",
        mode: mode || "CUSTOM",
        rules: rules || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      scalarAiDb.insertStrategy(strategy);
      res.json({ success: true, strategy });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to create strategy" });
    }
  });
}

function analyzeStrategyPerformance(strategyId: string): { winRate: number; profitFactor: number; totalTrades: number } {
  try {
    const allTrades = scalarAiDb.getTrades().filter((t: any) => t.strategy === strategyId);
    const closedTrades = allTrades.filter((t: any) => t.status === "CLOSED");
    const wins = closedTrades.filter((t: any) => t.profit > 0);
    const losses = closedTrades.filter((t: any) => t.profit <= 0);
    const winRate = closedTrades.length > 0 ? Math.round((wins.length / closedTrades.length) * 100) : 0;
    const avgWin = wins.length > 0 ? wins.reduce((sum: number, t: any) => sum + t.profit, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((sum: number, t: any) => sum + t.profit, 0) / losses.length : 0;
    const profitFactor = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;

    return {
      winRate,
      profitFactor: Number(profitFactor.toFixed(2)),
      totalTrades: closedTrades.length,
    };
  } catch {
    return { winRate: 0, profitFactor: 0, totalTrades: 0 };
  }
}
