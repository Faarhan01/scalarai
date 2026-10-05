import { useEffect, useCallback, useState } from "react";

export interface AiStudyFeedState {
  status: "waiting" | "calibrating" | "optimized" | "active";
  message: string;
  averageVelocity: number | null;
  knowledgeBase: any | null;
  strategy: any | null;
}

export function useAiStudyFeed(sendWsMessage: (msg: any) => boolean) {
  const [state, setState] = useState<AiStudyFeedState>({
    status: "calibrating",
    message: "AI is calibrating long-term behavioral profile... Execution locked.",
    averageVelocity: null,
    knowledgeBase: null,
    strategy: null,
  });

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-study-feed");
      if (res.ok) {
        const data = await res.json();
        if (data.status) setState((prev) => ({ ...prev, status: data.status }));
        if (data.message) setState((prev) => ({ ...prev, message: data.message }));
        if (data.aiKnowledgeBase) setState((prev) => ({ ...prev, knowledgeBase: data.aiKnowledgeBase }));
        if (data.averageVelocity !== undefined) setState((prev) => ({ ...prev, averageVelocity: data.averageVelocity }));
        if (data.aiSynthesizedStrategy) setState((prev) => ({ ...prev, strategy: data.aiSynthesizedStrategy }));
      }
    } catch {
      // Quiet
    }
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [poll]);

  return state;
}
