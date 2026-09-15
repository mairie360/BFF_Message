import { Router } from 'express';
import axios from 'axios';
import { CheckApiResponse, CheckApiResponseSchema } from '../views/check_api_view';
import { registry } from '../openapi-registry';

const router = Router();

const MESSAGE_FULL_URL = `http://${process.env.MESSAGE_API_URL}:${process.env.MESSAGE_API_PORT}`;

registry.registerPath({
  method: 'get',
  path: '/check_apis',
  tags: ['Connectivity'],
  summary: "Vérifie la connexion avec l'API Message (Rust)",
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
  try {
    const messageResponse = await axios.get(`${MESSAGE_FULL_URL}/health`, { timeout: 5000 });
    const message_is_reachable = messageResponse.status === 200;
    const result: CheckApiResponse = {
      status: 'OK',
      message_api: message_is_reachable ? 'Connected' : 'Unreachable'
    };
    res.status(200).json(result);
  } catch (error) {
    res.status(502).json({
      status: 'Error',
      message_api: 'Unreachable',
      message: (error as Error).message
    });
  }
});

export default router;