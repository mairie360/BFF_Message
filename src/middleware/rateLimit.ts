import { buildErrorResponse, sessionKey } from '@mairie360/bffs-lib';
import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

/**
 * Rate limiting of the routes that fan out to several upstream calls (`GET /business-references`).
 * Same building block as BFF User / the BFF template (`express-rate-limit`, shared error envelope,
 * `Retry-After` and `RateLimit` headers), but every request counts, not only failed ones.
 *
 * The key is the caller's session (`sessionKey`: a hash of its Bearer token), not the IP: without
 * `TRUST_PROXY` every browser reaches the BFF through the front pods and would share one counter. A JWT
 * `sub` decoded without verification is never used: a caller could forge it to use or exhaust another
 * user's counter. A request without a Bearer token falls back to the IP. Counters live in memory, per
 * replica.
 *
 * Environment:
 * - `RATE_LIMIT_ENABLED`    `false` disables the limiter (load tests), default enabled.
 * - `BUSINESS_REFERENCES_RATE_LIMIT_WINDOW_MS`  window length, default 1 minute.
 * - `BUSINESS_REFERENCES_RATE_LIMIT_MAX`        requests per caller and window, default 30.
 */

export const RATE_LIMIT_MESSAGE = 'Too many requests, please try again later';

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export interface RateLimiterOptions {
  windowMs?: number;
  limit?: number;
  enabled?: boolean;
  /** Counter name, so that two limited routes do not share their counters. */
  identifier: string;
}

export function createCallerRateLimiter(options: RateLimiterOptions): RequestHandler {
  const enabled = options.enabled ?? process.env.RATE_LIMIT_ENABLED?.trim().toLowerCase() !== 'false';

  return rateLimit({
    windowMs: options.windowMs ?? positiveInteger(process.env.BUSINESS_REFERENCES_RATE_LIMIT_WINDOW_MS, 60 * 1000),
    limit: options.limit ?? positiveInteger(process.env.BUSINESS_REFERENCES_RATE_LIMIT_MAX, 30),
    identifier: options.identifier,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => !enabled,
    keyGenerator: (req) => {
      const session = sessionKey(req);
      return session ? `session:${session}` : `ip:${ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown')}`;
    },
    message: buildErrorResponse('TOO_MANY_REQUESTS', RATE_LIMIT_MESSAGE),
  });
}
