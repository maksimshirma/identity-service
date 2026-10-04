import type { MiddlewareHandler } from "hono";

interface Bucket {
  count: number;
  windowStart: number;
}

export function createRateLimiter(options: { windowMs: number; max: number; keyPrefix: string }): MiddlewareHandler {
  const buckets = new Map<string, Bucket>();

  return async (c, next) => {
    const ip = c.req.header("x-forwarded-for") ?? "local";
    const key = `${options.keyPrefix}:${ip}`;
    const now = Date.now();

    const bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStart >= options.windowMs) {
      buckets.set(key, { count: 1, windowStart: now });
      return next();
    }

    if (bucket.count >= options.max) {
      const retryAfter = Math.ceil((bucket.windowStart + options.windowMs - now) / 1000);
      return c.json({ error: "too_many_requests" }, 429, { "Retry-After": String(retryAfter) });
    }

    bucket.count += 1;
    return next();
  };
}
