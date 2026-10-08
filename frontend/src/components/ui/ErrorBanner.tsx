import { AlertCircle } from "lucide-react";
import type { AppError } from "../../hooks/useErrorHandler";

export interface ErrorBannerProps {
  errors: AppError[];
  onDismiss: (id: string) => void;
}

export function ErrorBanner({ errors, onDismiss }: ErrorBannerProps) {
  if (errors.length === 0) return null;

  return (
    <div className="space-y-2">
      {errors.map((error) => (
        <div
          key={error.id}
          className="bg-red-900/40 border border-red-500/40 text-red-200 px-4 py-3 rounded-xl text-xs flex items-center justify-between gap-3"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            {error.message}
          </span>
          <button
            onClick={() => onDismiss(error.id)}
            className="text-red-300 hover:text-white transition-colors cursor-pointer"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
