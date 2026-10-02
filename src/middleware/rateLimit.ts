import { buildErrorResponse } from '@mairie360/bffs-lib';
import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

/**
 * Rate limiting of the routes that fan out to several upstream calls (`GET /business-references`).
 * Same building block as BFF User / the BFF template (`express-rate-limit`, shared error envelope,
 * `Retry-After` and `RateLimit` headers), but every request counts, not only failed ones.
 *
 * The key is the caller (JWT `sub`), not the IP: without `TRUST_PROXY` every browser reaches the BFF
 * through the front pods and would share one counter. A request without a usable `sub` falls back to
 * the IP. Counters live in memory, per replica.
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

/** JWT `sub` read without verification: only used to spread the counters, never to authorize. */
function callerOf(req: Request): string | undefined {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as { sub?: unknown };
    return typeof payload.sub === 'string' || typeof payload.sub === 'number' ? String(payload.sub) : undefined;
  } catch {
    return undefined;
  }
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
      const caller = callerOf(req);
      return caller ? `user:${caller}` : `ip:${ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown')}`;
    },
    message: buildErrorResponse('TOO_MANY_REQUESTS', RATE_LIMIT_MESSAGE),
  });
}
