export function toIso8601(date: Date): string {
  return date.toISOString();
}

export function toEpochMs(date: Date): number {
  return date.getTime();
}

export function fromEpochMs(epochMs: number): Date {
  return new Date(epochMs);
}

export function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleTimeString();
}

export function formatDateTime(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleString();
}

export function getMinuteBucket(epochMs: number): number {
  return Math.floor(epochMs / 60000);
}

export function getHourBucket(epochMs: number): number {
  return new Date(epochMs).getHours();
}

export function isSameMinute(a: number, b: number): boolean {
  return getMinuteBucket(a) === getMinuteBucket(b);
}

export function timeAgo(epochMs: number): string {
  const seconds = Math.floor((Date.now() - epochMs) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function nowEpochMs(): number {
  return Date.now();
}

export function nowIso8601(): string {
  return toIso8601(new Date());
}

export function parseTimestamp(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseLimit(value: number | unknown, fallback: number, max: number): number {
  const n = typeof value === "number" ? value : fallback;
  return Math.min(n, max);
}
