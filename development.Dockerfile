# syntax=docker/dockerfile:1.27
FROM node:20-alpine

# Installation de curl pour le healthcheck Docker
RUN apk add --no-cache curl

WORKDIR /app

# On copie les fichiers de définition en premier pour le cache Docker
COPY package*.json tsconfig.json ./

# Installation complète (avec devDependencies pour ts-node-dev)
RUN --mount=type=secret,id=npmrc,target=/app/.npmrc \
    --mount=type=secret,id=node_auth_token,target=/run/secrets/node_auth_token \
    sh -c 'export NODE_AUTH_TOKEN="$(cat /run/secrets/node_auth_token)" && npm install'

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

# --respawn: redémarre même si le script plante
# --transpile-only: skip le check de types pour aller plus vite en dev
CMD ["npx", "ts-node-dev", "--respawn", "--transpile-only", "src/index.ts"]
