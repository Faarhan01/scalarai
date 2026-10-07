import { useState, useCallback, useRef, useEffect } from "react";

export interface AppError {
  id: string;
  message: string;
  timestamp: number;
}

function generateSafeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback if randomUUID throws
    }
  }
  return `err_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function useErrorHandler() {
  const [errors, setErrors] = useState<AppError[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    return () => {
      // Clean up all timeouts on unmount
      timeoutsRef.current.forEach((timer) => clearTimeout(timer));
      timeoutsRef.current.clear();
    };
  }, []);

  const clearError = useCallback((id: string) => {
    const existing = timeoutsRef.current.get(id);
    if (existing) {
      clearTimeout(existing);
      timeoutsRef.current.delete(id);
    }
    setErrors((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const showError = useCallback((message: string | Error | unknown) => {
    const text =
      typeof message === "string"
        ? message
        : message instanceof Error
        ? message.message
        : "An unexpected error occurred";

    const id = generateSafeId();
    const error: AppError = { id, message: text, timestamp: Date.now() };

    setErrors((prev) => {
      // Avoid duplicate error messages within 3 seconds
      const recent = prev.find(
        (e) => e.message === text && Date.now() - e.timestamp < 3000
      );
      if (recent) return prev;
      return [...prev.slice(-3), error];
    });

    const timer = setTimeout(() => {
      timeoutsRef.current.delete(id);
      setErrors((prev) => prev.filter((e) => e.id !== id));
    }, 5000);

    timeoutsRef.current.set(id, timer);
  }, []);

  return { errors, showError, clearError };
}
