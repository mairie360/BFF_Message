import 'dotenv/config';
import { assertConfigured } from '@mairie360/bffs-lib';
import app from './app';

/** Every upstream the BFF calls, configured by `<SERVICE>_URL` (+ optional `<SERVICE>_PORT`). */
export const UPSTREAMS = ['MESSAGE_API', 'CORE_API', 'PROJECT_BFF', 'CALENDAR_BFF'] as const;

/** Documented port of BFF Message. */
const DEFAULT_PORT = 4003;

if (require.main === module) {
  // Fail fast: no localhost fallback, a missing or invalid upstream URL stops the server at start-up.
  assertConfigured(UPSTREAMS);
  // The session tokens are verified with it (bffs-lib requireSession): without it every route answers 503.
  if (!process.env.JWT_SECRET?.trim()) throw new Error('Missing configuration: JWT_SECRET');
  const port = Number(process.env.PORT?.trim() || DEFAULT_PORT);
  app.listen(port, () => console.log(`Server listening on port ${port}`));
}
