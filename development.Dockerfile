FROM node:24-alpine

# Installation de curl pour le healthcheck Docker
RUN apk add --no-cache curl

WORKDIR /app

# On copie les fichiers de définition en premier pour le cache Docker
COPY package*.json tsconfig.json ./

# Installation complète (avec devDependencies).
# Les identifiants GitHub Packages ne sont disponibles que pendant cette étape.
RUN --mount=type=secret,id=npmrc,target=/app/.npmrc \
    --mount=type=secret,id=node_auth_token,env=NODE_AUTH_TOKEN \
    npm ci

# Le package Orval est publié en .ts; on génère le .js que Node chargera au runtime.
RUN npx tsc node_modules/@mairie360/message-api-openapi/endpoints/messageApi.ts \
    --rootDir node_modules/@mairie360/message-api-openapi \
    --module commonjs \
    --target ES2020 \
    --esModuleInterop \
    --skipLibCheck \
    --moduleResolution node \
    --outDir node_modules/@mairie360/message-api-openapi \
    --declaration false \
    --sourceMap false

# On copie le reste du code source
COPY . .

CMD ["npm", "run", "start"]
