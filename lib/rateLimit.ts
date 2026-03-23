type RateLimitBucket = {
   count: number;
   expiresAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

function getNow() {
   return Date.now();
}

function pruneExpiredBuckets(now: number) {
   for (const [key, bucket] of buckets.entries()) {
      if (bucket.expiresAt <= now) {
         buckets.delete(key);
      }
   }
}

export function checkRateLimit(
   key: string,
   limit: number,
   windowMs: number,
): boolean {
   const now = getNow();
   pruneExpiredBuckets(now);

   const existing = buckets.get(key);
   if (!existing || existing.expiresAt <= now) {
      buckets.set(key, {
         count: 1,
         expiresAt: now + windowMs,
      });
      return true;
   }

   if (existing.count >= limit) {
      return false;
   }

   existing.count += 1;
   buckets.set(key, existing);
   return true;
}
