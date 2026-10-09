import React from "react";

export interface TradeFiltersProps {
  filterLogLevel: string;
  onFilterChange: (level: string) => void;
}

export const TradeFilters: React.FC<TradeFiltersProps> = ({
  filterLogLevel,
  onFilterChange,
}) => {
  return (
    <div className="flex bg-slate-900/90 p-1 rounded-lg border border-slate-700/80 gap-1 text-[10px] overflow-x-auto">
      {["ALL", "INFO", "SUCCESS", "WARNING", "ERROR"].map((level) => (
        <button
          key={level}
          onClick={() => onFilterChange(level)}
          className={`py-1 px-2.5 rounded font-mono font-bold uppercase transition-all whitespace-nowrap cursor-pointer ${
            filterLogLevel === level
              ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {level}
        </button>
      ))}
    </div>
  );
};
