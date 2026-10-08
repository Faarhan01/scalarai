import { useState, useCallback } from "react";

export interface AppError {
  id: string;
  message: string;
  timestamp: number;
}

export function useErrorHandler() {
  const [errors, setErrors] = useState<AppError[]>([]);

  const showError = useCallback((message: string) => {
    const id = crypto.randomUUID();
    const error: AppError = { id, message, timestamp: Date.now() };
    setErrors((prev) => [...prev.slice(-4), error]);
    setTimeout(() => {
      setErrors((prev) => prev.filter((e) => e.id !== id));
    }, 5000);
  }, []);

  const clearError = useCallback((id: string) => {
    setErrors((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return { errors, showError, clearError };
}
