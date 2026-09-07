import { openApiDocument as openApiSpec } from './openapi';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import healthRouter from './routes/health';
import checkApis from './routes/check_apis';
import messagesRouter from './routes/Messages';
import dotenv from 'dotenv';

dotenv.config();

export const app = express();

const PORT = process.env.PORT;

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

if (require.main === module) app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
