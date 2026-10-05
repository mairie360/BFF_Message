import { checkApis, checkApisResponseSchema, withoutSession } from '@mairie360/bffs-lib';
import { Router } from 'express';
import { checkCoreApi } from '../clients/coreClient';
import messageClient from '../clients/messageClient';
import { registry } from '../openapi-registry';

const router = Router();

/** Probe timeout, in ms. */
const PROBE_TIMEOUT_MS = 5_000;

export const CheckApisResponse = registry.register('CheckApisResponse', checkApisResponseSchema(['message_api', 'core_api']));

registry.registerPath({
  method: 'get',
  path: '/check_apis',
  security: [],
  tags: ['Connectivity'],
  summary: 'Checks that Message API and Core API (directory) are reachable',
  description: 'BFF Project and BFF Calendar are not probed: `GET /business-references` degrades per source '
    + '(`sources.projects` / `sources.calendar`) when they are unavailable.',
  responses: {
    200: {
      description: 'Every upstream answered its /health operation',
      content: { 'application/json': { schema: CheckApisResponse } },
    },
    502: {
      description: 'At least one upstream is unreachable or not configured',
      content: { 'application/json': { schema: CheckApisResponse } },
    },
  },
});

// Each probe reads the same <SERVICE>_URL as the real calls; a missing one counts as unreachable.
router.get('/', checkApis({
  message_api: () => messageClient.health(withoutSession('MESSAGE_API', PROBE_TIMEOUT_MS)),
  core_api: () => checkCoreApi(),
}));

export default router;
