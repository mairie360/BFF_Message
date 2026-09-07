# BFF_Message — Technical documentation

[Module overview](module.md) · [Français](../fr/technical.md) · [README](../../README.md)

## Architecture and request handling

Express 5.2.1 server written in TypeScript. Zod schemas and their OpenAPI registry describe exchanged objects; routers adapt upstream services to interface needs.

`src/index.ts` mounts the Messages router at the root. Helpers convert identifiers and generated-client objects; `contactsRepository.ts` reads the directory. `business_references.ts` calls business BFFs with the session. Bootstrap loads up to 20 conversations and then 30 messages from the first conversation.

## Data and persistence

Conversations and messages use Message API. Contacts are read directly from the SQL `users` table; the user context is adapted from Core. Business references are aggregated from BFF Project and BFF Calendar. Local profile edits, attachment metadata and the read acknowledgement do not provide complete persistence.

Attachment upload currently creates metadata and does not provide durable binary storage. Mark-as-read returns a zero counter without writing to Message API. Conversation groups use the API, while some profile data remains local to the process.

## Installation and local startup

Use Node.js 22 to reproduce the contract job and npm with the committed lockfile. Other job and Docker versions are detailed below.

Private `@mairie360/*` dependencies require GitHub Packages access. Set `NODE_AUTH_TOKEN` in the environment to a token allowed to read these packages, as configured in `.npmrc`. Do not commit its value.

```bash
npm ci
```

Create `.env` in the repository root. Local HTTP configuration example to adapt to the running services:

```dotenv
PORT=4003
MESSAGE_API_BASE_PATH=http://localhost:3003/api
CORE_API_BASE_URL=http://localhost:3000
CORE_API_URL=localhost
CORE_API_PORT=3000
MESSAGE_API_URL=localhost
MESSAGE_API_PORT=3003
PROJECT_BFF_URL=http://localhost:4001
CALENDAR_BFF_URL=http://localhost:4002
```

Also set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and `DB_PASSWORD` for an existing database containing the tables expected by the SQL repositories. These variables and any secrets listed below still need to be supplied; the HTTP example prepares neither schema nor data.

```bash
npm run start
```

`PORT` is required by this BFF; this example uses `4003`.

Check the process, then open the interactive documentation:

```bash
curl --fail --silent --show-error http://localhost:4003/health
```

Swagger UI: `http://localhost:4003/docs`. JSON specification: `/openapi.json`, with `/swagger.json` as an alias. `/health` checks the process; `/check_apis` is a separate dependency diagnostic.

## Configuration

Values below are local examples or explicitly described behavior, not production credentials.

| Variable or precedence | Example / stated fallback | Purpose |
| --- | --- | --- |
| `PORT` | 4003 | Port used by this local example. |
| `MESSAGE_API_BASE_PATH` | http://localhost:3003/api | Explicit business address; the code fallback is `http://localhost:8080/api`. |
| `CORE_API_BASE_URL` | http://localhost:3000 | Takes precedence over `CORE_API_URL` for the Core client. |
| `CORE_API_URL` / `CORE_API_PORT` | localhost / 3000 | Alternative Core configuration and diagnostics. |
| `MESSAGE_API_URL` / `MESSAGE_API_PORT` | localhost / 3003 | Diagnostic host and port. |
| `PROJECT_BFF_URL` | http://localhost:4001 | Source of project and task references. |
| `CALENDAR_BFF_URL` | http://localhost:4002 | Source of event references. |
| `DB_HOST` / `DB_PORT` | localhost / 5432 | SQL repository PostgreSQL connection. |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | — | Database, account and secret to supply for the expected shared schema. |

## Routes and data contract

Inventory extracted from `contracts/openapi.json`. Replace brace parameters with real identifiers. Detailed types, required fields, responses and any examples are defined in that contract; table statuses are the declared statuses, not an exhaustive list of transport or validation errors.

| Method | Path | Declared body | Declared statuses |
| --- | --- | --- | --- |
| GET | `/health` | — | 200 |
| GET | `/check_apis` | — | 200, 502 |
| GET | `/business-references` | — | 200, 401 |
| POST | `/attachments` | multipart/form-data | 201, 401 |
| GET | `/messaging/bootstrap` | — | 200, 401 |
| GET | `/contacts` | — | 200, 401 |
| GET | `/conversations` | — | 200, 401 |
| DELETE | `/conversations/{conversationId}` | — | 200 |
| POST | `/conversations/{conversationId}/read` | application/json | 200 |
| POST | `/groups` | application/json | 201, 401 |
| GET | `/me` | — | 200, 401 |
| PATCH | `/me` | application/json | 200, 400 |
| GET | `/conversations/{conversationId}/messages` | — | 200, 401 |
| POST | `/conversations/{conversationId}/messages` | application/json | 201, 401 |
| POST | `/direct-messages` | application/json | 201, 401 |

## Session, permissions and errors

The BFF uses the Authorization header; when absent, middleware can use the `accessToken` cookie. Business clients forward that authorization. Local profiles and read responses must not be interpreted as remote API validation of storage or permissions.

## Synchronization and verification

```bash
npm run contracts:generate
npm run contracts:check
npm test -- --runInBand
npm run lint
npm run build
```

`contracts:generate` exports the runtime registry to `contracts/openapi.json` and regenerates `contracts/bff.d.ts`. `contracts:check` fails when the contract or types are stale. Then run `npm run contracts:sync` in each associated web service and deliver contract changes together.

The type generator is pinned to `openapi-typescript@7.10.1` in `scripts/contracts.mjs` and runs through npm. For documentation-only changes, check links, accuracy in both languages and `git diff --check`; do not regenerate contracts without changing their source.

## CI/CD and Docker execution

The `contracts.yml` job uses Node.js 22, `actions/checkout@v7` and `actions/setup-node@v7`. It runs on pushes, pull requests and manual dispatch; it installs with `npm ci`, checks contracts and runs the associated tests.

`cicd.yml` calls `mairie360/CICD/.github/workflows/BFFs-cicd.yml@v1.13.2`, with `cicd_version: v1.13.2` and `node_version: "22"`. Reusable steps and GitHub environments determine actual checks, publications and deployments.

The Dockerfile currently uses `node:20-alpine` for build and runtime; the image command is `["npx", "tsx", "dist/index.js"]`. That version is separate from the Node.js 22 contract job.

Before running Docker, check service variables, build secrets and networks in the repository files. Green CI validates its jobs; it does not prove business-service availability in a remote environment.

## Troubleshooting

If conversations work but contacts do not, check PostgreSQL. If only business references are missing, check the two associated BFFs and session permissions. `/me` here describes the messaging profile; the web `/api/auth/*` adapters use BFF User.

## Repository reference

- [src/index.ts](../../src/index.ts)
- [src/routes/Messages/index.ts](../../src/routes/Messages/index.ts)
- [src/routes/Messages/message_helpers.ts](../../src/routes/Messages/message_helpers.ts)
- [src/routes/Messages/business_references.ts](../../src/routes/Messages/business_references.ts)
- [src/repositories/contactsRepository.ts](../../src/repositories/contactsRepository.ts)
- [src/clients/messageClient.ts](../../src/clients/messageClient.ts)
- [src/clients/coreClient.ts](../../src/clients/coreClient.ts)
- [contracts/openapi.json](../../contracts/openapi.json)
- [contracts/bff.d.ts](../../contracts/bff.d.ts)
- [scripts/contracts.mjs](../../scripts/contracts.mjs)
- [package.json](../../package.json)
- [.github/workflows/contracts.yml](../../.github/workflows/contracts.yml)
- [.github/workflows/cicd.yml](../../.github/workflows/cicd.yml)
- [Dockerfile](../../Dockerfile)
- [docker-compose.yml](../../docker-compose.yml)

Historical supplements: [CONTRACT.md](../../CONTRACT.md). Proposed requirements must remain distinct from implemented behavior.
