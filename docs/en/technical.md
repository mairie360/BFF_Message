# BFF_Message — Technical documentation

[Module overview](module.md) · [Français](../fr/technical.md) · [README](../../README.md)

## Architecture and request handling

Express 5.2.1 server written in TypeScript. Zod schemas and their OpenAPI registry describe exchanged objects; routers adapt upstream services to interface needs.

`src/app.ts` builds the Express app (shared security headers of `@mairie360/bffs-lib`, documentation, `/health`, `/check_apis`, the Messages router at the root, error handlers); `src/index.ts` loads `.env`, checks the upstream configuration and listens. Helpers convert identifiers and generated-client objects; `coreClient.ts` reads the Core API directory. `business_references.ts` calls business BFFs with the session. Bootstrap loads up to 20 conversations and then 30 messages from the first conversation.

## Data and persistence

Conversations and messages use Message API. A conversation created by `POST /direct-messages` (Message API chat named `Direct <recipientId>`) that holds exactly the caller and one contact is returned with `kind: 'direct'`, `contactId` (the contact's id) and the contact's name; every other conversation is `kind: 'group'`. The front posts a new message to a contact in that conversation (`POST /conversations/{id}/messages`); `POST /direct-messages` itself also reuses the caller's existing direct conversation with the recipient (chat named `Direct <id>` after either side, holding exactly both of them) and only creates a chat when there is none. Message `authorName` is the author's Core directory name, left out when the author is not a member found in the directory; `GET /me` only returns what the directory knows (name, email, roles), no placeholder role, service, position or last connection. Contacts are read directly from the SQL `users` table, including the current user (token `sub` claim). Business references are aggregated from BFF Project and BFF Calendar. Local profile edits and attachment metadata do not provide complete persistence.

Attachments are not supported yet: `POST /attachments` answers 503 to an authenticated caller (401 otherwise) instead of made-up ids, and a non-empty `attachmentIds` is refused with 400 on `POST /conversations/{id}/messages`. `POST /conversations/{id}/read` relays the read acknowledgement to Message API ≥ 1.0 (`POST /api/v1/{chat_id}/read/`): every message up to and including the optional `readUntilMessageId` is acknowledged, or up to the latest message (one `limit=1` read) when the body or the id is absent; an empty conversation answers `unreadCount: 0` without acknowledging anything. The answer carries the `unreadCount` Message API returns; its 401/403/404 are relayed, any other failure is a 502. Listing `limit`s are between 1 and 100; Message API listings are paginated since 1.0, so the BFF reads every page of chats and members (at most 20 pages of 100) and asks for the `limit` latest messages, or every page through the `before` cursor without `limit`. A message whose author account is deleted has no `authorId`; message bodies are limited to 5000 characters, group names to 100 and descriptions to 500.

`GET /business-references` bounds its upstream fan-out: one BFF Project listing of 50 projects, task details only for listed projects that report tasks (at most 20, 4 at a time), and a BFF Calendar window of 182 days on each side of today (under one year). It is rate limited per caller (see `BUSINESS_REFERENCES_RATE_LIMIT_*`). Conversation groups use the API, while some profile data remains local to the process.

## Installation and local startup

Use Node.js 24 (CI and Docker images) to reproduce the contract job and npm with the committed lockfile. Other job and Docker versions are detailed below.

Private `@mairie360/*` dependencies require GitHub Packages access. Set `NODE_AUTH_TOKEN` in the environment to a token allowed to read these packages, as configured in `.npmrc`. Do not commit its value.

```bash
npm ci
```

Copy `.env.example` to `.env` in the repository root and adapt it to the running services:

```dotenv
PORT=4003
MESSAGE_API_URL=http://localhost:3003
CORE_API_URL=http://localhost:3000
PROJECT_BFF_URL=http://localhost:4001
CALENDAR_BFF_URL=http://localhost:4002
```

`.env` is loaded by `import 'dotenv/config'`, the first line of `src/index.ts`. Every upstream is configured by `<SERVICE>_URL` (scheme optional, `http` by default) and an optional `<SERVICE>_PORT` used when the URL has no port, read on every call (MAIR-431). There is no `localhost` default: the server refuses to start when one of the four URLs is missing or invalid, and a route that would call an unconfigured upstream answers 503. The HTTP example prepares no data.

```bash
npm run start
```

`PORT` defaults to `4003`.

Check the process, then open the interactive documentation:

```bash
curl --fail --silent --show-error http://localhost:4003/health
```

Swagger UI: `http://localhost:4003/docs`. JSON specification: `/openapi.json`, with `/swagger.json` as an alias. `/health` checks the process; `/check_apis` is a separate dependency diagnostic.

## Configuration

Values below are local examples or explicitly described behavior, not production credentials.

| Variable or precedence | Example / stated fallback | Purpose |
| --- | --- | --- |
| `PORT` | 4003 (default) | Listening port. |
| `MESSAGE_API_URL` / `MESSAGE_API_PORT` | http://localhost:3003 / — | Message API root (its routes are published under `/api/v1`), also probed by `/check_apis`. **Required**. Replaces `MESSAGE_API_BASE_PATH` (removed). |
| `CORE_API_URL` / `CORE_API_PORT` | http://localhost:3000 / — | Core API directory (contacts, current user), also probed by `/check_apis`. **Required**. |
| `PROJECT_BFF_URL` / `PROJECT_BFF_PORT` | http://localhost:4001 / — | Source of project and task references. **Required**. |
| `CALENDAR_BFF_URL` / `CALENDAR_BFF_PORT` | http://localhost:4002 / — | Source of event references. **Required**. |
| `RATE_LIMIT_ENABLED` | true | `false` disables the per-caller limit of `GET /business-references` (load tests). |
| `BUSINESS_REFERENCES_RATE_LIMIT_MAX` / `_WINDOW_MS` | 30 / 60000 | Requests per session (hash of the Bearer token, never the unverified JWT `sub`) and window on `GET /business-references`, answered 429 beyond. |
| `TRUST_PROXY` | unset (no proxy trusted) | Express `trust proxy` (`true`, a hop count or trusted addresses), so that `req.ip` is the real client behind the ingress. |

## Routes and data contract

Inventory extracted from `contracts/openapi.json`. Replace brace parameters with real identifiers. Detailed types, required fields, responses and any examples are defined in that contract; table statuses are the declared statuses, not an exhaustive list of transport or validation errors.

| Method | Path | Declared body | Declared statuses |
| --- | --- | --- | --- |
| GET | `/health` | — | 200 |
| GET | `/check_apis` | — | 200, 502 |
| GET | `/business-references` | — | 200, 401, 429 |
| POST | `/attachments` | multipart/form-data | 401, 502, 503 |
| GET | `/messaging/bootstrap` | — | 200, 401, 502, 503 |
| GET | `/contacts` | — | 200, 400, 401, 502, 503 |
| GET | `/conversations` | — | 200, 400, 401, 502, 503 |
| DELETE | `/conversations/{conversationId}` | — | 200, 400, 401, 403, 404, 502, 503 |
| POST | `/conversations/{conversationId}/read` | application/json (optional) | 200, 400, 401, 403, 404, 502, 503 |
| POST | `/groups` | application/json | 201, 400, 401, 502, 503 |
| GET | `/me` | — | 200, 401, 502, 503 |
| GET | `/conversations/{conversationId}/messages` | — | 200, 400, 401, 404, 502, 503 |
| POST | `/conversations/{conversationId}/messages` | application/json | 201, 400, 401, 404, 502, 503 |
| POST | `/direct-messages` | application/json | 201, 400, 401, 502, 503 |

## Session, permissions and errors

The only credential the BFF accepts is `Authorization: Bearer <token>` (MAIR-429): the web service's proxy turns the `accessToken` cookie into that header. Cookies, `x-session-token` and other schemes are ignored. Every route except `/health`, `/check_apis` and the documentation is session-bound: without a Bearer token it answers 401 before any upstream call, and its answers carry `Cache-Control: no-store`. The caller's token, normalised to `Bearer <token>`, is forwarded on each upstream call (Message API, Core API, BFF Project, BFF Calendar); there is no default token. The JWT `sub` is read without verifying the signature, only to shape the requests sent upstream with that same token and the message direction, never to grant access or as a rate-limit key. Local profiles and read responses must not be interpreted as remote API validation of storage or permissions.

Every error is answered in the envelope shared by all the BFFs (`@mairie360/bffs-lib`, schema
`ErrorResponse` of the contract): `{ "error": { "code": "NOT_FOUND", "message": "Resource not found", "details": [] } }`.
`code` follows the status (`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_GATEWAY`,
`SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`, ...). A validation failure is a 400 whose `details` lists the
invalid fields (`{ "path": "body.content", "message": "..." }`). An upstream 4xx is kept only when the
route declares it (Message API 401/404, and 403 on `DELETE /conversations/{conversationId}`, 400 on the
message and chat creations), with a generic message; any other upstream status, a network failure or an
invalid answer is a 502 naming the service (`The MESSAGE_API service is unavailable.`), and an
unconfigured upstream a 503. Idempotent reads of Message API and Core API are retried once on a transient
failure. Every upstream call and the mapping go through `callUpstream` / `asCaller` of `@mairie360/bffs-lib`.

`/check_apis` probes the `/health` operation of Message API and Core API with the same variables as the
real calls and answers `{ status, message_api, core_api }` (`Connected` / `Unreachable`), 200 when both
answer, 502 otherwise. BFF Project and BFF Calendar are not probed: `GET /business-references` reports them
per source. Upstream messages and bodies are never relayed; an unexpected error is a generic 500.

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

The `contracts.yml` job uses Node.js 24, `actions/checkout@v7` and `actions/setup-node@v7`. It runs on pushes, pull requests and manual dispatch; it installs with `npm ci`, checks contracts and runs the associated tests.

`cicd.yml` calls `mairie360/CICD/.github/workflows/BFFs-cicd.yml@v3.2.0`, with `cicd_version: v3.2.0` and `node_version: "24"`. Reusable steps and GitHub environments determine actual checks, publications and deployments.

The Dockerfile uses `node:24-alpine`, pinned by digest (as in `development.Dockerfile`), for build and runtime; the image command is `["node", "dist/index.js"]` (the code only imports types from the `@mairie360/*` packages). CI, the contract job and the images all use Node.js 24.

`security_test.sh` and `performance_test.sh` test the image named by `IMAGE_REF`: in CI, the image `release-dev` has just published, the same artifact that is then promoted to staging and prod. When `IMAGE_REF` is empty (local use), they first build `bff-message:local` from `development.Dockerfile`, which needs `NODE_AUTH_TOKEN` and `./.npmrc`.

`security_test.sh` runs the OWASP ZAP stack of `docker-compose-security.yml`: ZAP replays every operation of `/openapi.json` with an admin JWT (`sub=1`, HS256) signed by `stack_secrets.sh` with the random `JWT_SECRET` it generates for each run and shares with every service of the stack and fills bodies and parameters from the contract examples. `init-test.sql` seeds the rows those examples name (users 1, 2, 3 and 10, conversation 101 with message 1001, conversation 102 for the DELETE route and conversation 201 for the posted messages); keep examples and seed in sync when adding a route. Ids received from the client must be a positive integer or a public id (`user-3`, `conversation-101`), and `<` / `>` are refused in message contents, group names and descriptions.

`security_test.sh` also runs the OpenAPI coverage gate of `mairie360/CICD` (`tests/zap/zap_hooks.py`, passed to ZAP with `--hook`), checked out as `cicd-repo/` by the CI jobs and cloned there by both scripts at the pinned `cicd_version` (`CICD_VERSION` overrides it). After the scan, the hook fails when an operation of the contract was never reached, or when an operation that requires `bearerAuth` only got 401/403. The contract requires this scheme at the top level; public operations (`/health`, `/check_apis`) declare `security: []` in their `registerPath`, so a new public route must do the same. On the k6 side, `load-test.js` holds one handler per operation of `contracts/openapi.json` through `coverage.js`: k6 aborts at init when one is missing and fails its `operations_uncovered` threshold when a handler does not send its request. **Adding a route means adding its handler in `load-test.js`.**

`load-test.js` runs two scenarios. `crud` (2 VUs) calls every handler once per iteration, writes included (attachment and read marker, both expected to answer 503 and excluded from `http_req_failed`, group, message, direct message), and deletes the conversations it creates. `reads` (ramp to 20 VUs) replays only the GET handlers against the fixtures of `init-test.sql` (conversation 101 with message 1001, of which user 2 is a member). Every operation has a `p(95)` threshold set by its family: 50 ms for `/health`, 150 ms for `/check_apis`, 400 ms for reads, 800 ms for writes; `http_req_failed` must stay below 1 %.

Before running Docker, check service variables, build secrets and networks in the repository files. Green CI validates its jobs; it does not prove business-service availability in a remote environment.

## Troubleshooting

If conversations work but contacts do not, check Core API. If only business references are missing, check the two associated BFFs and session permissions. `/me` here is read-only and describes the messaging profile; the web `/api/auth/*` adapters use BFF User, and profile edits go through BFF_Settings (`PATCH /settings/profile`) → Core_API (`PATCH /api/v1/user/me`).

## Repository reference

- [src/index.ts](../../src/index.ts)
- [src/app.ts](../../src/app.ts)
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
