# syntax=docker/dockerfile:1.7
# --- Étape 1 : Build ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./

# [MODIFICATION] On monte les secrets npm au moment du npm ci
RUN npm config set @mairie360:registry https://npm.pkg.github.com
RUN --mount=type=secret,id=npmrc,target=/app/.npmrc \
    --mount=type=secret,id=node_auth_token,target=/run/secrets/node_auth_token \
    sh -c 'export NODE_AUTH_TOKEN="$(cat /run/secrets/node_auth_token)" && npm ci'

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

COPY . .
RUN npm run build

# [MODIFICATION] On garde le JS généré dans le package Orval puis on retire les devDependencies
RUN npm prune --omit=dev --ignore-scripts

# --- Étape 2 : Runtime ---
FROM node:20-alpine
ENV NODE_ENV=production
RUN apk add --no-cache curl

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

USER node

# OPTIMISATION : On bride la heap à 180Mo pour tenir dans un limit K8s de 256Mo
ENV NODE_OPTIONS="--max-old-space-size=180"

EXPOSE 4003
CMD ["node", "dist/index.js"]
