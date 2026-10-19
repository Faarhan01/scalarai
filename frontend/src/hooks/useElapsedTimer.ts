import { useState, useEffect, useRef } from "react";

export function useElapsedTimer() {
  const [elapsedTime, setElapsedTime] = useState<string>("00:00:00");
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const hours = String(Math.floor(diff / 3600)).padStart(2, "0");
      const mins = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
      const secs = String(diff % 60).padStart(2, "0");
      setElapsedTime(`${hours}:${mins}:${secs}`);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return { elapsedTime, resetTimer: () => { startTimeRef.current = Date.now(); } };
}
