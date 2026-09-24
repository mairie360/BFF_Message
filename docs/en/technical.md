# BFF_Message — Technical documentation

[Module overview](module.md) · [Français](../fr/technical.md) · [README](../../README.md)

## Architecture and request handling

Express 5.2.1 server written in TypeScript. Zod schemas and their OpenAPI registry describe exchanged objects; routers adapt upstream services to interface needs.

`src/index.ts` mounts the Messages router at the root. Helpers convert identifiers and generated-client objects; `coreClient.ts` reads the Core API directory. `business_references.ts` calls business BFFs with the session. Bootstrap loads up to 20 conversations and then 30 messages from the first conversation.

## Data and persistence

Conversations and messages use Message API. Contacts are read directly from the SQL `users` table, including the current user (token `sub` claim). Business references are aggregated from BFF Project and BFF Calendar. Local profile edits, attachment metadata and the read acknowledgement do not provide complete persistence.

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
MESSAGE_API_BASE_PATH=http://localhost:3003
MESSAGE_API_URL=localhost
MESSAGE_API_PORT=3003
PROJECT_BFF_URL=http://localhost:4001
CALENDAR_BFF_URL=http://localhost:4002
```

Also set `CORE_API_URL` and `CORE_API_PORT` to reach the Core API directory. These variables and any secrets listed below still need to be supplied; the HTTP example prepares no data.

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
| `MESSAGE_API_BASE_PATH` | http://localhost:3003 | Message API root (its routes are published under `/api/v1`); the code fallback is `http://localhost:3003`. |
| `MESSAGE_API_URL` / `MESSAGE_API_PORT` | localhost / 3003 | Diagnostic host and port. |
| `PROJECT_BFF_URL` | http://localhost:4001 | Source of project and task references. |
| `CALENDAR_BFF_URL` | http://localhost:4002 | Source of event references. |
| `CORE_API_URL` / `CORE_API_PORT` | localhost / — | Core API directory (contacts, current user). |

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

The tests in `tests/messages.upstream-mocks.test.ts` run the real Message API client and the real `fetch` against local HTTP mocks driven by the Message API, BFF Project and BFF Calendar contracts, rebuilt from the installed `@mairie360/*-openapi` packages (orval types, versions pinned in `package.json`): every request (path, parameters, JSON body) and every mocked success response is validated against those contracts, and BFF responses against `contracts/openapi.json`. Bumping a package version is enough to test the new contract; error statuses are not typed by orval and are mocked explicitly. The `users` table (contacts) stays mocked with `jest.mock`.

`contracts:generate` exports the runtime registry to `contracts/openapi.json` and regenerates `contracts/bff.d.ts`. `contracts:check` fails when the contract or types are stale. Then run `npm run contracts:sync` in each associated web service and deliver contract changes together.

The type generator is pinned to `openapi-typescript@7.10.1` in `scripts/contracts.mjs` and runs through npm. For documentation-only changes, check links, accuracy in both languages and `git diff --check`; do not regenerate contracts without changing their source.

## CI/CD and Docker execution

The `contracts.yml` job uses Node.js 22, `actions/checkout@v7` and `actions/setup-node@v7`. It runs on pushes, pull requests and manual dispatch; it installs with `npm ci`, checks contracts and runs the associated tests.

`cicd.yml` calls `mairie360/CICD/.github/workflows/BFFs-cicd.yml@v3.0.0`, with `cicd_version: v3.0.0` and `node_version: "22"`. Reusable steps and GitHub environments determine actual checks, publications and deployments.

The Dockerfile uses `node:24-alpine` for build and runtime; the image command is `["node", "dist/index.js"]` (the code only imports types from the `@mairie360/*` packages). That version is separate from the Node.js 22 contract job.

`security_test.sh` and `performance_test.sh` test the image named by `IMAGE_REF`: in CI, the image `release-dev` has just published, the same artifact that is then promoted to staging and prod. When `IMAGE_REF` is empty (local use), they first build `bff-message:local` from `development.Dockerfile`, which needs `NODE_AUTH_TOKEN` and `./.npmrc`.

`security_test.sh` runs the OWASP ZAP stack of `docker-compose-security.yml`: ZAP replays every operation of `/openapi.json` with a static admin JWT (`sub=1`, HS256, `JWT_SECRET=b"secret"` in every service of the security and performance stacks) and fills bodies and parameters from the contract examples. `init-test.sql` seeds the rows those examples name (users 1, 2, 3 and 10, conversation 101 with message 1001, conversation 102 for the DELETE route and conversation 201 for the posted messages); keep examples and seed in sync when adding a route. Ids received from the client must be a positive integer or a public id (`user-3`, `conversation-101`), and `<` / `>` are refused in message contents, group names and descriptions.

`security_test.sh` also runs the OpenAPI coverage gate of `mairie360/CICD` (`tests/zap/zap_hooks.py`, passed to ZAP with `--hook`), checked out as `cicd-repo/` by the CI jobs and cloned there by both scripts at the pinned `cicd_version` (`CICD_VERSION` overrides it). After the scan, the hook fails when an operation of the contract was never reached, or when an operation that requires `bearerAuth`/`cookieAuth` only got 401/403. The contract requires one of these schemes at the top level; public operations (`/health`, `/check_apis`) declare `security: []` in their `registerPath`, so a new public route must do the same. On the k6 side, `load-test.js` holds one handler per operation of `contracts/openapi.json` through `coverage.js`: k6 aborts at init when one is missing and fails its `operations_uncovered` threshold when a handler does not send its request. **Adding a route means adding its handler in `load-test.js`.**

`load-test.js` runs two scenarios. `crud` (2 VUs) calls every handler once per iteration, writes included (attachment, group, message, direct message, read marker, profile), and deletes the conversations it creates. `reads` (ramp to 20 VUs) replays only the GET handlers against the fixtures of `init-test.sql` (conversation 101 with message 1001, of which user 2 is a member). Every operation has a `p(95)` threshold set by its family: 50 ms for `/health`, 150 ms for `/check_apis`, 400 ms for reads, 800 ms for writes; `http_req_failed` must stay below 1 %.

Before running Docker, check service variables, build secrets and networks in the repository files. Green CI validates its jobs; it does not prove business-service availability in a remote environment.

## Troubleshooting

If conversations work but contacts do not, check Core API. If only business references are missing, check the two associated BFFs and session permissions. `/me` here describes the messaging profile; the web `/api/auth/*` adapters use BFF User.

## Repository reference

- [src/index.ts](../../src/index.ts)
- [src/routes/Messages/index.ts](../../src/routes/Messages/index.ts)
- [src/routes/Messages/message_helpers.ts](../../src/routes/Messages/message_helpers.ts)
- [src/routes/Messages/business_references.ts](../../src/routes/Messages/business_references.ts)
- [src/clients/coreClient.ts](../../src/clients/coreClient.ts)
- [src/clients/messageClient.ts](../../src/clients/messageClient.ts)
- [contracts/openapi.json](../../contracts/openapi.json)
- [contracts/bff.d.ts](../../contracts/bff.d.ts)
- [scripts/contracts.mjs](../../scripts/contracts.mjs)
- [package.json](../../package.json)
- [.github/workflows/contracts.yml](../../.github/workflows/contracts.yml)
- [.github/workflows/cicd.yml](../../.github/workflows/cicd.yml)
- [Dockerfile](../../Dockerfile)
- [docker-compose.yml](../../docker-compose.yml)

Historical supplements: [CONTRACT.md](../../CONTRACT.md). Proposed requirements must remain distinct from implemented behavior.
