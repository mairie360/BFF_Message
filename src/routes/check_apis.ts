import { Router } from 'express';
import axios from 'axios';
import { checkCoreApi } from '../clients/coreClient';
import { CheckApiResponse, CheckApiResponseSchema } from '../views/check_api_view';
import { registry } from '../openapi-registry';

const router = Router();

const MESSAGE_FULL_URL = `http://${process.env.MESSAGE_API_URL}:${process.env.MESSAGE_API_PORT}`;

registry.registerPath({
  method: 'get',
  path: '/check_apis',
  tags: ['Connectivity'],
  summary: "Vérifie la connexion avec l'API Message et Core API (annuaire)",
  responses: {
    200: {
      description: 'Connexion réussie',
      content: {
        'application/json': {
          schema: CheckApiResponseSchema,
        },
      },
    },
    502: {
      description: 'API Message injoignable',
    },
  },
});

router.get('/', async (_, res) => {
  const [message, core] = await Promise.allSettled([
    axios.get(`${MESSAGE_FULL_URL}/health`, { timeout: 5000 }),
    checkCoreApi(),
  ]);
  const result: CheckApiResponse = {
    status: message.status === 'fulfilled' && core.status === 'fulfilled' ? 'OK' : 'Error',
    message_api: message.status === 'fulfilled' ? 'Connected' : 'Unreachable',
    core_api: core.status === 'fulfilled' ? 'Connected' : 'Unreachable',
  };

  res.status(result.status === 'OK' ? 200 : 502).json(result);
});

export default router;