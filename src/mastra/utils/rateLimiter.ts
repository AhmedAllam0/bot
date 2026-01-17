interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMITS = {
  message: { maxRequests: 30, windowMs: 60000 },
  bookSearch: { maxRequests: 10, windowMs: 60000 },
  quiz: { maxRequests: 20, windowMs: 60000 },
  groupPoints: { maxRequests: 60, windowMs: 60000 },
};

export function checkRateLimit(
  userId: string,
  action: keyof typeof RATE_LIMITS = "message"
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const limit = RATE_LIMITS[action];
  const key = `${userId}:${action}`;
  
  let entry = rateLimitStore.get(key);
  
  if (!entry || now >= entry.resetTime) {
    entry = {
      count: 1,
      resetTime: now + limit.windowMs,
    };
    rateLimitStore.set(key, entry);
    return {
      allowed: true,
      remaining: limit.maxRequests - 1,
      resetIn: limit.windowMs,
    };
  }
  
  if (entry.count >= limit.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: entry.resetTime - now,
    };
  }
  
  entry.count++;
  return {
    allowed: true,
    remaining: limit.maxRequests - entry.count,
    resetIn: entry.resetTime - now,
  };
}

export function getRateLimitMessage(resetIn: number): string {
  const seconds = Math.ceil(resetIn / 1000);
  if (seconds < 60) {
    return `⏳ الرجاء الانتظار ${seconds} ثانية قبل المحاولة مرة أخرى.`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `⏳ الرجاء الانتظار ${minutes} دقيقة قبل المحاولة مرة أخرى.`;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

export default { checkRateLimit, getRateLimitMessage };
