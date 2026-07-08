import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { registry } from './openapi-registry';
import healthRouter from './routes/health';
import checkApis from './routes/check_apis';
import messagesRouter from './routes/Messages';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

const PORT = process.env.PORT;

app.use(express.json());

const generator = new OpenApiGeneratorV31(registry.definitions);

const openApiSpec = generator.generateDocument({
  openapi: '3.1.0',
  info: {
    title: 'BFF Message API',
    version: '1.0.0',
    description: 'API du Backend for Frontend (BFF) pour la messagerie interne.',
  },
  servers: [
    {
      url: `http://localhost:${PORT}`,
      description: 'Serveur local',
    },
  ],
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

if (!PORT) {
  console.error('Error: PORT environment variable is not set.');
  process.exit(1);
}

app.use('/health', healthRouter);
app.use('/check_apis', checkApis);
app.use('/', messagesRouter);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
