import 'dotenv/config';
import { apiOnlyHeaders, errorHandler, notFoundHandler, parseTrustProxy, securityHeaders } from '@mairie360/bffs-lib';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from './openapi';
import checkApis from './routes/check_apis';
import healthRouter from './routes/health';
import messagesRouter from './routes/Messages';

export const app = express();

// Client IP (req.ip) seen behind the ingress, used by the rate limiter: see parseTrustProxy.
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
// Security headers shared by every BFF (and no X-Powered-By), then the stricter API-only headers
// everywhere but /docs; mounted before body parsing so they also cover body-parse errors.
app.use(securityHeaders);
app.use(apiOnlyHeaders());
app.use(express.json());

// Interactive documentation, and the JSON spec: /openapi.json is the target of the ZAP scan
// (docker-compose-security.yml), /swagger.json is read by the CI composite action.
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.get(['/openapi.json', '/swagger.json'], (_req, res) => res.json(openApiDocument));

app.use('/health', healthRouter);
app.use('/check_apis', checkApis);
// Session-bound routes: noStore + requireSession (verified token, MAIR-474) are mounted in routes/Messages/index.ts.
app.use('/', messagesRouter);

// Unknown routes and every error end in the shared envelope `{ error: { code, message, details } }`:
// the status of the error is kept (400 for an unparsable body, 401, 404, 502, 503...) and anything
// unexpected becomes a 500 without leaking its message.
app.use(notFoundHandler);
app.use(errorHandler({ onError: (error) => console.error('[BFF] Unexpected error', error) }));

export default app;
