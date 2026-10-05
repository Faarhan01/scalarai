import { useState, useCallback } from "react";

export interface SymbolState {
  symbol: string;
  connection: Record<string, any>;
  currentPrice: number;
  tickCount: number;
}

export function useSymbolState(initialSymbols: SymbolState[] = []) {
  const [symbolStates, setSymbolStates] = useState<SymbolState[]>(initialSymbols);

  const updateSymbolStates = useCallback((states: SymbolState[] | undefined) => {
    if (states) {
      setSymbolStates(states);
    }
  }, []);

  return { symbolStates, setSymbolStates, updateSymbolStates };
}
