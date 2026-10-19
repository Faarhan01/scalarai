/**
 * Request validation and parsing utilities.
 * Preserves user inputs exactly as received without stripping inner spaces or forcing uppercase.
 */

export function parseSymbol(raw: unknown, fallback?: string): string {
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.length > 0) return raw; // Return raw string preserving whitespace and casing
  }
  return fallback || "";
}

export function parseOrderAction(raw: unknown): "BUY" | "SELL" | "CLOSE" | "MODIFY" | string {
  if (!raw) return "BUY";
  const str = String(raw).trim();
  const lower = str.toLowerCase();
  if (lower === "buy") return "BUY";
  if (lower === "sell") return "SELL";
  if (lower === "close") return "CLOSE";
  if (lower === "modify") return "MODIFY";
  return str;
}

export function parseVolume(raw: unknown, defaultVol = 0.1): number {
  const num = Number(raw);
  return isFinite(num) && num > 0 ? num : defaultVol;
}

export function parsePoints(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const num = Number(raw);
  return isFinite(num) && num >= 0 ? num : undefined;
}
