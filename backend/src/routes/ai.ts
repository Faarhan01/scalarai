import { Request, Response } from "express";
import { AiKnowledgeBase, AiSynthesizedStrategy, Tick } from "../types";

export function registerAiRoutes(
  app: any,
  getAiStudyData?: () => {
    status: string;
    message: string;
    count: number;
    aiKnowledgeBase: AiKnowledgeBase;
    aiSynthesizedStrategy: AiSynthesizedStrategy;
    candleStream: Tick[];
    averageVelocity: number;
  }
) {
  app.get("/api/ai-study-feed", (req: Request, res: Response) => {
    if (getAiStudyData) {
      res.json(getAiStudyData());
    } else {
      res.json({
        status: "active",
        message: "Strategy engine running.",
        count: 0,
        aiKnowledgeBase: {},
        aiSynthesizedStrategy: {},
        candleStream: [],
        averageVelocity: 0,
      });
    }
  });
}

