interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  windowMs: number;    // Time window in ms
  maxRequests: number; // Max requests per window
}

export function rateLimitMiddleware(config: RateLimitConfig) {
  const { windowMs, maxRequests } = config;

  return (req: { ip?: string; headers: Record<string, unknown>; connection?: { remoteAddress?: string } }, res: { header: (name: string, value: string) => void; status: (code: number) => { json: (body: object) => void }; setHeader: (name: string, value: string) => void }, next: () => void) => {
    const key = req.ip || req.connection?.remoteAddress || "unknown";
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    const remaining = Math.max(0, maxRequests - entry.count);
    const resetAt = new Date(entry.resetAt).toISOString();

    res.setHeader("X-RateLimit-Limit", maxRequests.toString());
    res.setHeader("X-RateLimit-Remaining", remaining.toString());
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000).toString());

    if (entry.count > maxRequests) {
      res.status(429).json({
        error: "Too many requests",
        retry_after: Math.ceil((entry.resetAt - now) / 1000),
      });
      return;
    }

    next();
  };
}

export function clearRateLimitStore(): void {
  store.clear();
}
