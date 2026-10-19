export function validateBearerToken(authHeader: string | undefined, expectedApiKey: string): boolean {
  if (!authHeader) return false;
  return authHeader.startsWith(`Bearer ${expectedApiKey}`);
}
