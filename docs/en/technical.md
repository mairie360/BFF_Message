# BFF_Message — Technical documentation

[Module overview](module.md) · [Français](../fr/technical.md) · [README](../../README.md)

## Architecture and request handling

Express 5.2.1 server written in TypeScript. Zod schemas and their OpenAPI registry describe exchanged objects; routers adapt upstream services to interface needs.

`src/app.ts` builds the Express app (shared security headers of `@mairie360/bffs-lib`, documentation, `/health`, `/check_apis`, the Messages router at the root, error handlers); `src/index.ts` loads `.env`, checks the upstream configuration and listens. Helpers convert identifiers and generated-client objects; `coreClient.ts` reads the Core API directory. `business_references.ts` calls business BFFs with the session. Bootstrap loads up to 20 conversations and then 30 messages from the first conversation.

## Data and persistence

Conversations and messages use Message API. `GET /conversations` is one page of conversations (`limit` 1 to 30, default 20; `nextCursor` goes back as `cursor`; `search` matches the name of the conversation or of one of its members) read with ONE Message API call: each conversation carries its display name (the other participant's name for a direct one), `kind`, `contactId` for a direct conversation, `memberCount`, `unreadCount`, and a group shows `department: "N membres"`. `GET /conversations/{id}` opens a conversation with two parallel Message API calls: the conversation, its `participants` (id and name) and the latest `limit` messages (1 to 100, default 30) with their sender id and, for an answer, the quoted message (author and excerpt); `nextCursor` goes in `before` of `GET /conversations/{id}/messages` for older messages, so the history is never read whole. `POST /direct-messages` asks Message API to find or create the one direct conversation of the pair, then posts in it. Message `authorName` is the author's name when they are a current member of the conversation, left out otherwise; `GET /me` only returns what the directory knows (name, email, roles), no placeholder role, service, position or last connection. Contacts come from the Core API directory, excluding the current user (identified by the token `sub` claim). Business references are read from Project API and Calendar API (MAIR-525). Local profile edits and attachment metadata do not provide complete persistence.

Attachments are not supported yet: `POST /attachments` answers 503 to an authenticated caller (401 otherwise) instead of made-up ids, and a non-empty `attachmentIds` is refused with 400 on `POST /conversations/{id}/messages`. `POST /conversations/{id}/read` relays the read acknowledgement to Message API ≥ 1.0 (`POST /api/v1/{chat_id}/read/`): every message up to and including the optional `readUntilMessageId` is acknowledged, or up to the latest message (one `limit=1` read) when the body or the id is absent; an empty conversation answers `unreadCount: 0` without acknowledging anything. The answer carries the `unreadCount` Message API returns; its 401/403/404 are relayed, any other failure is a 502. Listing `limit`s are between 1 and 100 (30 for conversations); the BFF reads one page of Message API per request (members by pages of 100). A message whose author account is deleted has no `authorId`; message bodies are limited to 5000 characters, group names to 100 and descriptions to 500.

`GET /business-references` reads the APIs, never another BFF (MAIR-525): one Project API listing of 50 projects, the task list of the listed projects that have active tasks only (at most 20, 4 at a time, until Project API lists the caller's tasks in one call), filtered like BFF Project (Admin, Maire and Responsable see every task, other roles their own; roles from the token, or Core API for an older token, the narrowest view when they cannot be read), and one Calendar API list over 182 days on each side of today (the events the caller is a member of; no detail per event).

Conversation groups use the API, while some profile data remains local to the process.

The real-time channel is the WebSocket `GET /ws` (epic MAIR-655, relay added by MAIR-658 in `src/routes/Messages/realtime.ts`); the former SSE `GET /stream` is removed and answers `404`. The contract shared with Message API and Messages_Web_Service is frozen in Message_API's `docs/en/realtime-websocket.md` (decision: `docs/en/adr/0001-messaging-websocket.md`). The BFF's side: the front's Node server opens `/ws` with `Authorization: Bearer` (the BFF stays private and reads no cookie); the BFF checks the session before any upstream call (`401`, `503` when Message API is not configured; like its other routes but `/business-references`, the BFF has no per-caller limit on `/ws`), then opens Message API's `GET /api/v1/ws` with the same token and only completes its own upgrade once Message API accepted (`401` relayed, `502` otherwise). Each upstream `ChatSignal` frame becomes a `MessageRealtimeEvent` `{ type, conversationId, messageId, unreadCount }` (`conversation-<id>`, `message-<id>`); only `NEW_MSG`, `MSG_EDITED`, `MSG_DELETED` and `CHAT_READ` are relayed, anything else is dropped, and client data frames are never forwarded. Closes are propagated both ways (`4001` session ended and `4008` eviction relayed as is, an abnormal upstream end becomes `1013`), the BFF pings every 15 s and closes with `1001` a client silent for 45 s, and after `MESSAGE_WS_MAX_MS` (30 minutes by default, ± 10 %). Express cannot upgrade: `attachRealtime(server)` handles the `upgrade` event of the HTTP server (`serve()` in `src/index.ts`, which also closes the sockets with `1001` on SIGTERM), and the Express route only answers the plain `GET /ws` (`400`).

## Installation and local startup

Use Node.js 24.22.1 (CI and Docker images) to reproduce the contract job and npm with the committed lockfile. Other job and Docker versions are detailed below.

Private `@mairie360/*` dependencies require GitHub Packages access. Set `NODE_AUTH_TOKEN` in the environment to a token allowed to read these packages, as configured in `.npmrc`. Do not commit its value.

```bash
npm ci
```

Copy `.env.example` to `.env` in the repository root and adapt it to the running services:

```dotenv
PORT=4003
MESSAGE_API_URL=http://localhost:3003
CORE_API_URL=http://localhost:3000
PROJECT_API_URL=http://localhost:3001
CALENDAR_API_URL=http://localhost:3002
# Core's Ed25519 public key (MAIR-680), required: paste the public key of the Core you run against.
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n<base64 of Core's public key>\n-----END PUBLIC KEY-----"
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
| `PROJECT_API_URL` / `PROJECT_API_PORT` | http://localhost:3001 / — | Source of project and task references. **Required**. |
| `CALENDAR_API_URL` / `CALENDAR_API_PORT` | http://localhost:3002 / — | Source of event references. **Required**. |
| `PROJECT_FRONT_URL` / `CALENDAR_FRONT_URL` | unset | Optional base URLs of the Projects and Calendar fronts (the variables the fronts already use): the `url` of message links and `#` suggestions (MAIR-1154), absent when unset or not http(s). |
| `RATE_LIMIT_ENABLED` | true | `false` disables the per-caller limit of `GET /business-references` (load tests). |
| `BUSINESS_REFERENCES_RATE_LIMIT_MAX` / `_WINDOW_MS` | 30 / 60000 | Requests per session (hash of the Bearer token, never the unverified JWT `sub`) and window on `GET /business-references`, answered 429 beyond. |
| `TRUST_PROXY` | unset (no proxy trusted) | Express `trust proxy` (`true`, a hop count or trusted addresses), so that `req.ip` is the real client behind the ingress. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset (telemetry off) | OpenTelemetry collector of the instance, e.g. `http://otel-collector:4318`: traces and HTTP metrics are exported over OTLP (MAIR-504). Only the method, status, parameterised route and upstream host leave the BFF, never a URL, query string, header, id or IP. |
| `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES` | `bff-message`; unset | Override the service name; extra resource attributes such as `service.version=<image tag>,deployment.environment.name=prod`. `OTEL_SDK_DISABLED=true` turns telemetry off. |

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
| GET | `/conversations/{conversationId}` | — | 200, 400, 401, 404, 502, 503 |
| GET | `/conversations/{conversationId}/messages` | — | 200, 400, 401, 404, 502, 503 |
| POST | `/conversations/{conversationId}/messages` | application/json | 201, 400, 401, 403, 404, 429, 502, 503 |
| PATCH | `/conversations/{conversationId}/messages/{messageId}` | application/json | 200, 400, 401, 403, 404, 429, 502, 503 |
| DELETE | `/conversations/{conversationId}/messages/{messageId}` | — | 200, 400, 401, 403, 404, 429, 502, 503 |
| POST | `/conversations/{conversationId}/messages/{messageId}/reactions` | application/json | 200, 400, 401, 403, 404, 429, 502, 503 |
| DELETE | `/conversations/{conversationId}/messages/{messageId}/reactions` | `?emoji=` | 200, 400, 401, 403, 404, 429, 502, 503 |
| GET | `/conversations/{conversationId}/members` | — | 200, 400, 401, 404, 429, 502, 503 |
| POST | `/conversations/{conversationId}/members` | application/json | 200, 400, 401, 403, 404, 409, 429, 502, 503 |
| DELETE | `/conversations/{conversationId}/members/{userId}` | — | 200, 400, 401, 403, 404, 429, 502, 503 |
| POST | `/conversations/{conversationId}/leave` | — | 204, 400, 401, 403, 404, 429, 502, 503 |
| GET | `/conversations/{conversationId}/search` | `?q=&type=&limit=&offset=` | 200, 400, 401, 404, 429, 502, 503 |
| GET | `/conversations/{conversationId}/mention-suggestions` | `?q=` | 200, 400, 401, 404, 429, 502, 503 |
| GET | `/link-suggestions` | `?q=` | 200, 400, 401, 429 |
| POST | `/direct-messages` | application/json | 201, 400, 401, 502, 503 |

### Messaging V2 (MAIR-1154)

- **Messages** carry `kind` (`user` / `system`), `systemEvent` (system notes: `members_added`, `member_removed`,
  `member_left`, with the actor and the agents concerned and their names), `editedAt`, `deleted`, real `mentions`
  (`{ id, name }`), `mentionsEveryone`, `groupMentions` (`{ id: 'group-<n>', name }`), `links`
  (`{ id: 'project-<n>' | 'task-<n>' | 'event-<n>', kind, url? }`) and `reactions` (`{ emoji, count, reactedByMe, userNames }`).
  Names come from the members of the conversation; the agents a page names without being members any more (former
  members) are read in ONE Core API directory call, and the mentioned groups in ONE Message API call, only when needed:
  a failure there only leaves the names out.
- **Writes**: `POST …/messages` takes `replyTo`, `mentionIds`, `mentionEveryone`, `groupMentionIds` and `links`
  (`[{ id }]`, at most 50 each); `PATCH …/messages/{messageId}` edits the content (author only) and replaces each tag
  field present; `DELETE …/messages/{messageId}` answers the tombstone; `POST` / `DELETE …/reactions` answer every
  reaction of the message.
- **Members**: `GET …/members` (`isAdmin` = creator still a member, `canManage` = a group administered by the caller or
  a platform administrator), `POST …/members` and `DELETE …/members/{userId}` answer the members and the
  `systemMessage` the change wrote, `POST …/leave` answers 204 (the caller leaves through it, not through `DELETE
  …/members/{own id}`, which answers 400).
- **Search**: `GET …/search?q=&type=messages|people|files` (`files` is always empty: no attachments yet) answers
  `{ type, items, hasMore, total }`; a message item carries an excerpt cut around the first match and the
  `highlights` (`start`, `length` in UTF-16 units).
- **Suggestions**: `GET …/mention-suggestions?q=` (other members, groups of the members, `everyone` when `q` is empty
  or starts « tout le monde » / « everyone ») and `GET /link-suggestions?q=` (the business references filtered by
  title, case- and accent-insensitive, at most 50, rate limited like `/business-references`). The `url` of a link is
  the page of the object in its front (MAIR-1166: each front has one page addressed by its query):
  `<PROJECT_FRONT_URL>/?project=<id>`, `<PROJECT_FRONT_URL>/?project=<project>&task=<id>` or
  `<CALENDAR_FRONT_URL>/?date=<YYYY-MM-DD>&event=<id>` (the day of its start, Paris time). It is absent when the variable
  is unset, or when Message API gave no project for a task or no start for an event.
- **Stream**: the events carry `messageId` when Message API gives one, and the new signals are named
  `message_reacted`, `members_changed` and `mentioned` (the earlier ones keep `NEW_MSG`, `MSG_EDITED`...).

## Session, permissions and errors

The only credential the BFF accepts is `Authorization: Bearer <token>` (MAIR-429): the web service's proxy turns the `accessToken` cookie into that header. Cookies, `x-session-token` and other schemes are ignored. Every route except `/health`, `/check_apis` and the documentation is session-bound: without a Bearer token it answers 401 before any upstream call, and its answers carry `Cache-Control: no-store`. The caller's token, normalised to `Bearer <token>`, is forwarded on each upstream call (Message API, Core API, Project API, Calendar API); there is no default token. The JWT `sub` is read without verifying the signature, only to shape the requests sent upstream with that same token and the message direction, never to grant access or as a rate-limit key. Local profiles and read responses must not be interpreted as remote API validation of storage or permissions.

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
answer, 502 otherwise. Project API and Calendar API are not probed: `GET /business-references` reports them
per source. Upstream messages and bodies are never relayed; an unexpected error is a generic 500.

## Synchronization and verification

```bash
npm run contracts:generate
npm run contracts:check
npm test -- --runInBand
npm run lint
npm run build
```

The tests in `tests/messages.upstream-mocks.test.ts` run the real Message API client and the real `fetch` against local HTTP mocks driven by the Message API, Core API, Project API and Calendar API contracts (`tests/stream.upstream-mocks.test.ts` covers `GET /stream`), rebuilt from the installed `@mairie360/*-openapi` packages (orval types, versions pinned in `package.json`): every request (path, parameters, JSON body) and every mocked success response is validated against those contracts, and BFF responses against `contracts/openapi.json`. Bumping a package version is enough to test the new contract; error statuses are not typed by orval and are mocked explicitly. The `users` table (contacts) stays mocked with `jest.mock`.

`contracts:generate` exports the runtime registry to `contracts/openapi.json` and regenerates `contracts/bff.d.ts`. `contracts:check` fails when the contract or types are stale. Then run `npm run contracts:sync` in each associated web service and deliver contract changes together.

The type generator is pinned to `openapi-typescript@7.10.1` in `scripts/contracts.mjs` and runs through npm. For documentation-only changes, check links, accuracy in both languages and `git diff --check`; do not regenerate contracts without changing their source.

## CI/CD and Docker execution

The `contracts.yml` job uses Node.js 24.22.1, `actions/checkout@v7` and `actions/setup-node@v7`. It runs on pushes, pull requests and manual dispatch; it installs with `npm ci`, checks contracts and runs the associated tests.

`cicd.yml` calls `mairie360/CICD/.github/workflows/BFFs-cicd.yml@v5.2.2`, with `cicd_version: v5.2.2` and `node_version: "24.22.1"`. Reusable steps and GitHub environments determine actual checks, publications and deployments. A push to `main` stops after `release-dev`; staging and prod go through the manual `promote-staging.yml` / `promote-prod.yml` workflows (MAIR-494).

The Dockerfile uses `node:24.22.1-alpine`, pinned by digest (as in `development.Dockerfile`), for build and runtime; the image command is `["node", "dist/index.js"]` (the code only imports types from the `@mairie360/*` packages). CI, the contract job and the images all use Node.js 24.

`integration_test.sh` (MAIR-262) runs the stack of `docker-compose-integration.yml`: the published Message API and Core API images, the database with its migrations and `init-test.sql`, Redis, the BFF image under test and a `newman` service that replays `tests/postman/collection.json` (environment `tests/postman/environment.json`) against the BFF with `--bail`; Project API and Calendar API are not part of the stack. Its exit code is the exit code of newman. The collection holds working checks (the BFF starts, `/health`, `/check_apis`, `/openapi.json`, the session of the seeded administrator and agent through `/me` and `/messaging/bootstrap`, the contacts of the Core directory) and the messaging journeys (the seeded conversation 101, the direct conversation between the administrator and the agent: one per pair, listed on both sides with its unread counter, paged history, acknowledgement, hidden by each side and deleted with the last one; the group conversation created by the agent, posted in, searched, paged, read and acknowledged by the administrator, left by both; the business references degrading without Project API and Calendar API; the attachment upload answering its documented 503; `GET /stream` answering `404` since the SSE is removed). The seeded accounts are impersonated with EdDSA JWTs that `integration_test.sh` signs with the run's Ed25519 key, like Core (fresh key pair, `stack_secrets.sh`, MAIR-680), plus a forgery under Core's `kid` and an HS256 token, both refused; the committed environment holds no secret. In CI this stack is the `integration_tests` gate of the staging promotion: it blocks the promotion on failure and publishes the junit report (`newman-reports/newman.xml`) as job summary and artifact. The jest test `tests/integration-collection.test.ts` checks that every operation of `contracts/openapi.json` has a request in the collection and that every request asserts something.

newman cannot open a WebSocket: once the collection passed, `integration_test.sh` runs `tests/websocket/journey.mjs` (plain Node) on the same stack. The administrator, the agent and user 3 connect to `GET /ws`; the administrator posts in a new group with the agent: only the agent receives `NEW_MSG` with the BFF's ids, once, the author and the outsider nothing; the agent's 6th socket evicts the oldest (`4008` relayed from Message API) and the 5 others keep receiving. Under load, the k6 `websocket` scenario holds one socket per VU while a user posts in each VU's group: every post must come back as a frame, with a 1 s `p(95)` from the start of the `POST`. ZAP scans `/ws` (plain `GET`, `400` or `401`).

Split of the tests: jest covers the routes with mocked upstream APIs (unit tests, upstream-mock tests against the installed contracts, token refusals); the newman collection covers the journeys on a real Message API and Core API; ZAP and k6 cover security and performance. A bug fix adds its non-regression test at the lowest layer that observes it (jest first, the collection when only a real upstream shows it).

`security_test.sh` and `performance_test.sh` test the image named by `IMAGE_REF`: in CI, `release-dev` publishes the `dev-<sha>` image, and `promote-staging.yml` runs both tests against it before that same artifact is promoted to staging and prod (MAIR-494); promote it to prod with the same `sha` given to `promote-prod.yml`. When `IMAGE_REF` is empty (local use), they first build `bff-message:local` from `development.Dockerfile`, which needs `NODE_AUTH_TOKEN` and `./.npmrc`.

`security_test.sh` runs the OWASP ZAP stack of `docker-compose-security.yml`: ZAP replays every operation of `/openapi.json` with an admin JWT (`sub=1`, EdDSA) signed by `stack_secrets.sh` like Core, with the Ed25519 key pair it generates for each run (Core holds it, every other service of the stack only its public key, MAIR-680) and fills bodies and parameters from the contract examples. `init-test.sql` seeds the rows those examples name (users 1, 2, 3 and 10, conversation 101 with message 1001, conversation 102 for the DELETE route and conversation 201 for the posted messages); keep examples and seed in sync when adding a route. Ids received from the client must be a positive integer or a public id (`user-3`, `conversation-101`), and `<` / `>` are refused in message contents, group names and descriptions.

`security_test.sh` also runs the OpenAPI coverage gate of `mairie360/CICD` (`tests/zap/zap_hooks.py`, passed to ZAP with `--hook`), checked out as `cicd-repo/` by the CI jobs and cloned there by both scripts at the pinned `cicd_version` (`CICD_VERSION` overrides it). After the scan, the hook fails when an operation of the contract was never reached, or when an operation that requires `bearerAuth` only got 401/403. The contract requires this scheme at the top level; public operations (`/health`, `/check_apis`) declare `security: []` in their `registerPath`, so a new public route must do the same. On the k6 side, `load-test.js` holds one handler per operation of `contracts/openapi.json` through `coverage.js`: k6 aborts at init when one is missing and fails its `operations_uncovered` threshold when a handler does not send its request. **Adding a route means adding its handler in `load-test.js`.**

`load-test.js` runs two scenarios. `crud` (2 VUs) calls every handler once per iteration, writes included (attachment and read marker, both expected to answer 503 and excluded from `http_req_failed`, group, message, direct message), and deletes the conversations it creates. `reads` (ramp to 20 VUs) replays only the GET handlers against the fixtures of `init-test.sql` (conversation 101 with message 1001, of which user 2 is a member). Every operation has a `p(95)` threshold set by its family: 50 ms for `/health`, 150 ms for `/check_apis`, 400 ms for reads, 800 ms for writes; `http_req_failed` must stay below 1 %.

Before running Docker, check service variables, build secrets and networks in the repository files. Green CI validates its jobs; it does not prove business-service availability in a remote environment.

## Logs

Every log is one JSON object per line on stdout (MAIR-531, `@mairie360/bffs-lib` `createLogger`, `src/logger.ts`), the shape of the APIs' `LOG_FORMAT=json`: `timestamp`, `level`, `target` (`bff-message`), `message`, then the fields.

- One `request completed` line per request (`requestLogger`, first middleware of `src/app.ts`): `request_id`, `method`, `path` (the matched route, e.g. `/users/:userId`; never the query string), `status`, `duration_ms`. 5xx are written at `ERROR`; `/health` is not logged.
- `request_id` comes from the `X-Request-Id` header when the caller sends a well-formed one, otherwise it is generated; it is answered in `X-Request-Id` and repeated on every line of the request (`request failed`, `upstream unreachable`...), so one search finds them all.
- `request failed` (5xx) and `upstream unreachable` (`/check_apis`) carry `error` = `describeError(error)`: type, status, upstream method and path, masked message. Never a header, a token, a body or a personal value (MAIR-290).
- `LOG_LEVEL` (`debug`, `info`, `warn`, `error`; default `info`) filters the lines.
- `LOG_FORMAT` (`json` or `text`): unset, the lines are coloured text when stdout is a terminal (`npm run start`), JSON otherwise (containers, tests). `NO_COLOR` / `FORCE_COLOR` control the colours (MAIR-555).

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
