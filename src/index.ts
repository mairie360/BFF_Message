import { openApiDocument as openApiSpec } from './openapi';
import { errorHandler, notFoundHandler, parseTrustProxy } from '@mairie360/bffs-lib';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import healthRouter from './routes/health';
import checkApis from './routes/check_apis';
import messagesRouter from './routes/Messages';
import dotenv from 'dotenv';

dotenv.config();

export const app = express();

const PORT = process.env.PORT;

// Client IP (req.ip) seen behind the ingress, used by the rate limiter: see parseTrustProxy.
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

// Security headers (CSP, X-Content-Type-Options, Permissions-Policy, CORP...) and removal of
// X-Powered-By. upgrade-insecure-requests is dropped because the BFF is served over HTTP behind
// the reverse proxy.
app.use(helmet({ contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': null } } }));
app.use(express.json());

// Interactive documentation
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

// JSON spec (read by the CICD composite action)
app.get('/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(openApiSpec);
});

app.get('/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(openApiSpec);
});

if (require.main === module) {
  // No silent localhost fallback for the main upstream: a missing setting stops the server at start-up.
  for (const name of ['PORT', 'MESSAGE_API_BASE_PATH']) {
    if (!process.env[name]?.trim()) {
      console.error(`Error: ${name} environment variable is not set.`);
      process.exit(1);
    }
  }
}

app.use('/health', healthRouter);
app.use('/check_apis', checkApis);
app.use('/', messagesRouter);

// Unknown routes and every error end in the shared envelope `{ error: { code, message, details } }`:
// the status of the error is kept (400 for an unparsable body, 401, 404, 502, 503...) and anything
// unexpected becomes a 500 without leaking its message.
app.use(notFoundHandler);
app.use(errorHandler({ onError: (error) => console.error('[BFF] Unexpected error', error) }));

if (require.main === module) app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
