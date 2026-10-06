export function normalizeIp(raw: string | undefined | null): string | null {
  if (!raw) return null;
  return raw.replace(/^::ffff:/, "");
}
