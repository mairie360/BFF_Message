import 'dotenv/config';
import type { Server } from 'node:http';
// Before the app: OpenTelemetry must hook Express before it is loaded (MAIR-504).
import './telemetry';
import { assertConfigured, gracefulShutdown, type GracefulShutdown, sessionKeysFromEnv } from '@mairie360/bffs-lib';
import app from './app';
import { attachRealtime, type Realtime } from './routes/Messages/realtime';
import { logger } from './logger';

/** Every upstream the BFF calls, configured by `<SERVICE>_URL` (+ optional `<SERVICE>_PORT`). */
export const UPSTREAMS = ['MESSAGE_API', 'CORE_API', 'PROJECT_API', 'CALENDAR_API'] as const;

/** Documented port of BFF Message. */
const DEFAULT_PORT = 4003;

/**
 * Fail-fast startup check: no localhost fallback, a missing or invalid upstream URL, or no session key, stops the
 * server at start-up instead of answering 503 later. The session tokens are verified with Core's public key
 * `JWT_PUBLIC_KEY` (MAIR-680, bffs-lib requireSession). Since bffs-lib 3, HS256 tokens are refused and `JWT_SECRET`
 * is ignored.
 */
export function assertStartupConfiguration(): void {
  assertConfigured(UPSTREAMS);
  let keys: ReturnType<typeof sessionKeysFromEnv>;
  try {
    keys = sessionKeysFromEnv();
  } catch {
    // The parsing detail is not needed to fix it, and the key is not logged.
    throw new Error('Invalid configuration: JWT_PUBLIC_KEY must hold Ed25519 PUBLIC KEY PEM blocks');
  }
  if (keys === undefined) {
    throw new Error('Missing configuration: JWT_PUBLIC_KEY');
  }
}

/**
 * Listens, relays the WebSocket handshakes of `GET /ws` (MAIR-658) and drains on SIGTERM instead of dropping the
 * requests in flight (bffs-lib gracefulShutdown). An upgraded socket is no longer an HTTP request the drain can end:
 * the drain starts with `server.close()`, which closes the WebSockets with `1001` first, so it does not wait for them.
 */
export function serve(port: number): { server: Server; shutdown: GracefulShutdown; realtime: Realtime } {
  const server = app.listen(port, () => logger.info('server listening', { port }));
  const realtime = attachRealtime(server);
  const close = server.close.bind(server);
  server.close = (callback?: (error?: Error) => void) => {
    realtime.closeAll();
    return close(callback);
  };
  return { server, realtime, shutdown: gracefulShutdown(server) };
}

if (require.main === module) {
  assertStartupConfiguration();
  const port = Number(process.env.PORT?.trim() || DEFAULT_PORT);
  serve(port);
}
