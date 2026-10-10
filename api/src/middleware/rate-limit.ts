import { createMiddleware } from "hono/factory";
import { env } from "@/config/env";

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const key in store) {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  }
}, 60000); // Clean every minute

/**
 * Rate Limiting Middleware
 * Limits the number of requests per IP address within a time window.
 */
export const rateLimitMiddleware = (
  maxRequests?: number,
  windowMs?: number,
) => {
  const max = maxRequests || env.RATE_LIMIT_MAX;
  const window = windowMs || env.RATE_LIMIT_WINDOW_MS;

  return createMiddleware(async (c, next) => {
    // Get client identifier (IP or fallback)
    const clientIp =
      c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";

    const now = Date.now();
    const key = `${clientIp}`;

    // Initialize or reset if window expired
    if (!store[key] || store[key].resetTime < now) {
      store[key] = {
        count: 0,
        resetTime: now + window,
      };
    }

    store[key].count++;

    // Set rate limit headers
    const remaining = Math.max(0, max - store[key].count);
    const resetTime = Math.ceil((store[key].resetTime - now) / 1000);

    c.res.headers.set("X-RateLimit-Limit", max.toString());
    c.res.headers.set("X-RateLimit-Remaining", remaining.toString());
    c.res.headers.set("X-RateLimit-Reset", resetTime.toString());

    // Check if rate limit exceeded
    if (store[key].count > max) {
      c.res.headers.set("Retry-After", resetTime.toString());
      return c.json(
        {
          success: false,
          error: "Too many requests. Please try again later.",
        },
        429,
      );
    }

    await next();
  });
};