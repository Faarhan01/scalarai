import React from "react";
import { AlertCircle, X } from "lucide-react";
import type { AppError } from "../../hooks/useErrorHandler";

export interface ErrorBannerProps {
  errors?: AppError[];
  onDismiss: (id: string) => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ errors = [], onDismiss }) => {
  if (!errors || !Array.isArray(errors) || errors.length === 0) return null;

  return (
    <div className="space-y-2">
      {errors.map((error, idx) => {
        if (!error) return null;
        const key = error.id || `banner_err_${idx}_${Date.now()}`;
        const messageText =
          typeof error.message === "string"
            ? error.message
            : String(error.message || "An unexpected error occurred");

        return (
          <div
            key={key}
            className="bg-red-950/60 border border-red-500/40 text-red-200 px-4 py-3 rounded-xl text-xs flex items-center justify-between gap-3 shadow-lg"
          >
            <span className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="font-medium">{messageText}</span>
            </span>
            <button
              type="button"
              onClick={() => onDismiss(error.id)}
              className="text-red-300 hover:text-white p-1 rounded transition-colors cursor-pointer"
              aria-label="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

