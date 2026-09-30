import { openApiDocument as openApiSpec } from './openapi';
import { errorHandler, notFoundHandler } from '@mairie360/bffs-lib';
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

// En-têtes de sécurité (CSP, X-Content-Type-Options, Permissions-Policy, CORP…) et
// suppression de X-Powered-By. upgrade-insecure-requests est retiré car le BFF est
// servi en HTTP derrière le reverse proxy.
app.use(helmet({ contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': null } } }));
app.use(express.json());

function accessTokenFromCookie(cookieHeader?: string): string | undefined {
  const token = cookieHeader
    ?.split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('accessToken='))
    ?.slice('accessToken='.length);

  return token ? decodeURIComponent(token) : undefined;
}

app.use((req, _res, next) => {
  if (!req.headers.authorization) {
    const accessToken = accessTokenFromCookie(req.headers.cookie);

    if (accessToken) {
      req.headers.authorization = `Bearer ${accessToken}`;
    }
  }

  next();
});



// Route pour l'interface visuelle
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

// Route pour l'extraction JSON (utilisée par l'Action Composite)
app.get('/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(openApiSpec);
});

app.get('/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(openApiSpec);
});

if (require.main === module && !PORT) {
  console.error('Error: PORT environment variable is not set.');
  process.exit(1);
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
