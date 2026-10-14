import "server-only";

/**
 * Fixed-window, in-memory rate limiter. Good enough for a single instance;
 * on multi-instance hosting swap the Map for Redis/Upstash with the same API.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 10_000) sweep(now);
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

function sweep(now: number) {
  for (const [key, entry] of windows) if (entry.resetAt <= now) windows.delete(key);
}
