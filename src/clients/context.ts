import type { Request } from 'express';

/**
 * What an upstream call needs from the route that triggers it: the caller's request (its Bearer
 * session is forwarded with `asCaller`) and the upstream 4xx the route declares in its contract, which
 * `callUpstream` relays as is (anything else becomes a 502).
 */
export interface CallContext {
  req: Pick<Request, 'headers'>;
  declared: readonly number[];
}
