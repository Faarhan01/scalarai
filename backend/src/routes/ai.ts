import { Request, Response, Application } from "express";
import { AiKnowledgeBase, AiSynthesizedStrategy, Tick, AiStudyFeedPayload } from "../types";

export function registerAiRoutes(
  app: Application,
  getAiStudyData?: () => AiStudyFeedPayload
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

