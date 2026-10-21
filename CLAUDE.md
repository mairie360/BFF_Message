# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`bff-message` is the Backend-for-Frontend for Mairie360 internal messaging. It adapts the upstream
**Message API** (chats/messages), the **Core API** directory (contacts and current user),
and **Project API** / **Calendar API** (business references; never another BFF, MAIR-525) into the shapes the
[`Messages_Web_Service`](https://github.com/mairie360/Messages_Web_Service) frontend needs. The BFF
owns the data contract; the web service owns the screens. Docs live in `docs/{en,fr}/` and `CONTRACT.md`.

## Commands

```bash
npm ci                          # install (needs NODE_AUTH_TOKEN, see below)
npm run start                   # tsx watch src/index.ts (PORT defaults to 4003)
npm run build                   # tsc -> dist/
npm run lint                    # eslint . --ext .ts    (lint:fix to autofix; only src/**/*.ts is actually linted, see eslint.config.cjs)
npm test                        # jest (all tests/**/*.test.ts)
npx jest tests/contracts.test.ts        # single file
npx jest -t "business references"       # single test by name
npm test -- --runInBand                 # how CI runs it
npm run contracts:generate      # regenerate contracts/ after any route/schema change
npm run contracts:check         # fails if contracts/ is stale (CI gate)

./integration_test.sh           # docker-compose-integration.yml: real Message API + Core API, newman replaying tests/postman/ (MAIR-262)
```

`npm run build` type-checks with `tsc --noEmit` then bundles `dist/index.js` with esbuild
(`scripts/build.mjs`): the `@mairie360/*` clients are published as TypeScript, so they are inlined
while the other dependencies stay external. Node **24** everywhere: the contract job / CI (`.github/workflows/contracts.yml`,
`cicd.yml` → `mairie360/CICD` reusable workflow, `node_version: "24"`) and the Docker images (`node:24-alpine`, pinned by digest). The production image runs `node dist/index.js` (bundle);
the test stacks run the image named by `IMAGE_REF` (in CI, the image published by `release-dev`;
locally, `bff-message:local` built from `development.Dockerfile` by the scripts).

Private `@mairie360/*` dependencies come from GitHub Packages. `.npmrc` reads `NODE_AUTH_TOKEN` from
the environment; set it to a token with read access to those packages before `npm ci`.

Env vars for local runs (`.env.example`, loaded by `import 'dotenv/config'` on the first line of
`src/index.ts` and `src/app.ts`): `PORT` (default 4003), and one `<SERVICE>_URL` (+ optional `<SERVICE>_PORT`) per upstream, read on
every call by the lib's `baseUrl` (MAIR-431): `MESSAGE_API_URL`, `CORE_API_URL`, `PROJECT_API_URL`,
`CALENDAR_API_URL`. There is no localhost default: `assertConfigured(UPSTREAMS)` stops the server at
start-up when one is missing (under `require.main === module`, so tests are not affected), and a route
calling an unconfigured upstream answers 503 (declared in the contract). `TRUST_PROXY` sets Express' `trust proxy` (lib `parseTrustProxy`). `RATE_LIMIT_ENABLED=false` disables the per-session limit of `GET /business-references`
(`BUSINESS_REFERENCES_RATE_LIMIT_MAX` / `_WINDOW_MS`, defaults 30 / 60000, lib `createRateLimiter` keyed on
`sessionKey` in `business_references.ts`); the perf stack sets it.

## Architecture

**Entry point** (structure of `Bff_Template_Repo`). `src/app.ts` builds and exports `app` (imported by the
tests): `trust proxy` from `TRUST_PROXY`, the lib's `securityHeaders` + `apiOnlyHeaders()`, the Swagger UI
at `/docs`, the spec at `/openapi.json` + `/swagger.json`, then `/health`, `/check_apis`, the Messages
router at `/`, `notFoundHandler` and `errorHandler()`. `src/index.ts` loads `.env`, runs
`assertConfigured(UPSTREAMS)` and listens, both under `require.main === module`.

**Auth flow (MAIR-429).** The only credential is `Authorization: Bearer <token>` (the front's proxy turns
the `accessToken` cookie into it; the BFF reads no cookie, no `x-session-token`). `src/routes/Messages/index.ts`
mounts `noStore` + `requireSession` (`@mairie360/bffs-lib` >= 1.2.0, MAIR-474) on every session-bound prefix
(`SESSION_BOUND_PATHS`), so a request without a token signed with `JWT_SECRET` (HS256, numeric `sub`, not
expired) gets 401 before any upstream call. Route handlers hand their request to helpers (`CallContext`), which
forward the caller's token on every upstream call (`asCaller`); there is no default/service token. The current
user's numeric id is the verified `sub` (`sessionUserId`).

**Routing.** `src/routes/Messages/index.ts` composes one router per resource
(`conversation.ts`, `me.ts`, `contacts.ts`, `groups.ts`, `message.ts`, `bootstrap.ts`,
`attachments.ts`, `business_references.ts`). Nearly all business logic lives in
`src/routes/Messages/message_helpers.ts`; route files are thin (`parseRequest(schema, value, location)` →
call a helper with a `CallContext` `{ req, declared }` (`src/clients/context.ts`), `declared` being the
upstream 4xx the route documents).

**Errors.** Every error is `{ error: { code, message, details } }` (`@mairie360/bffs-lib`,
`ErrorResponse` in the contract, declared through `errorResponses({...})` on every operation).
Routes throw `HttpError` or the 400 of the lib's `parseRequest` (`Validation failed`, one detail per
invalid field); Express 5 hands async rejections to `errorHandler()`, mounted last in `src/app.ts` after
`notFoundHandler`. Every upstream call goes through the lib's `callUpstream(service, call, { declared,
retry })` with `asCaller(service, req)` options: it keeps only the upstream 4xx the route declares and turns
any other status, a network failure or an invalid answer into 502 naming the service; never relay upstream
bodies. `retry: true` only on idempotent GETs to Message API and Core API. Register the
envelope with `ErrorResponseSchema.clone()` (zod 4 only adds `.openapi()` to schemas created after
`extendZodWithOpenApi`). When a route starts answering a new status, declare it in its `registerPath`.

**Upstream clients.** `src/clients/messageClient.ts` injects an axios instance (headers only) into the
generated `@mairie360/message-api-openapi` client; the helpers pass `asCaller('MESSAGE_API', req, 5_000)`
(base URL read now + the caller's token) on every call. `/check_apis` uses the lib's `checkApis` with
`withoutSession(...)` probes of Message API and Core API (`message_api`, `core_api`, schema
`CheckApisResponse`); Project API / Calendar API are not probed, business references degrade per source.
`src/clients/coreClient.ts` reads the directory (contacts and current user) through Core API's
`GET /api/v1/user/` — the BFF has no database access.
`business_references.ts` calls Project API and Calendar API through their published clients
(`src/clients/businessApiClients.ts`: `@mairie360/project-api-openapi`, `@mairie360/calendar-api-openapi`), keeps
BFF Project's task visibility (lib `hasRole` + `PROJECT_TASK_MANAGER_ROLES`, role from `sessionRole` or roles from Core
`getMe`) and degrades per-source (`sources: available | unavailable`). `stream.ts` (MAIR-525) relays Message API's
SSE `GET /api/v1/stream` as `GET /stream`: signals translated to `{ type, conversationId }`, pings kept, `id:` /
`Last-Event-ID` relayed, head + `retry:` + `: connected` sent before Message API answers (MAIR-561: its refusal or
failure is then an `event: stream_error` carrying the `ErrorResponse`, not a status), ended after `MESSAGE_STREAM_MAX_MS` (1 s in the test stacks, so ZAP and k6 get a full
answer; k6 covers it in `crud` only).

**ID convention.** Outward IDs are prefixed strings: `conversation-<n>`, `message-<n>`, `user-<n>`.
`parseNumericId` extracts the trailing digits before calling upstream (which uses numeric ids).
When adding fields, keep this mapping in the `map*ToDto` helpers.

**Not available yet** (MAIR-400, no upstream support): `POST /attachments` checks the session (401) then
answers 503; never answer fabricated data. `POST /conversations/:id/read` relays Message API's
`acknowledgeRead` (the body and its `readUntilMessageId` are optional: without it, the latest message is
resolved with one `getChat` `limit=1`; an empty chat is a no-op answering `unreadCount: 0`). A non-empty `attachmentIds` is
refused (400) on send. `POST /direct-messages` calls Message API's find-or-create `POST /api/v1/direct/` (one direct
chat per pair), then posts in it.

**Conversations (MAIR-507).** The BFF never reads a whole list or a whole history. `GET /conversations` is ONE Message
API call per page (`limit` 1-30, default 20; `cursor` = the offset handed back as `nextCursor`; `search` is applied
by Message API on the name of the chat or of a member): the chat already carries its display name (the contact's name
for a direct chat), `kind`, `contactId`, `memberCount` and `unreadCount`, and a group's `department` is "N membres".
Opening a conversation is `loadConversation`: the members with their names (`getChatUsers`, paged by 100) and one page
of messages with the chat itself (`getChat`, `limit` default 30, `before` = the numeric `nextCursor` of the previous
page) in parallel, no Core API call; each message carries `citation` and `quoted` (author, excerpt). It serves
`GET /conversations/{id}` (with `participants`) and `GET /conversations/{id}/messages` (same page, without them).
Sending a message reads the chat through `getChat` with `limit=1`. The bootstrap is the first page of the list plus
`loadConversation` of its first chat. `GET /business-references` bounds its fan-out (constants at the top
of `business_references.ts`) and is rate limited per caller. Never invent profile/author data: missing
directory values are left out.
`GET /me` resolves the caller from its own token through Core API on every request; never keep
module-level user state, it leaks one caller's profile to the next. There is no `PATCH /me`: profile
edits go through BFF_Settings (`PATCH /settings/profile`) → Core_API (`PATCH /api/v1/user/me`).

### Telemetry (MAIR-504)

`src/telemetry.ts` calls the lib's `startTelemetry` and is imported by `src/index.ts` right after `dotenv/config`,
before the app: the Express instrumentation only hooks Express if it is not loaded yet (Express stays external in
the esbuild bundle). Off without `OTEL_EXPORTER_OTLP_ENDPOINT`; the lib exports only an attribute allowlist, so
never add span attributes holding request values (ids, URLs, bodies, headers). Tests export nothing.

## OpenAPI contract (source of truth)

Schemas are **zod** objects in `src/openapi-registry.ts` (via `@asteasolutions/zod-to-openapi`).
Each route file colocates a `registry.registerPath({...})` call describing its endpoint.
`src/openapi.ts` imports the route modules for their side effects, then generates the 3.1 document.

`contracts:generate` runs `scripts/export-swagger.ts` (writes `contracts/openapi.json`)
then `scripts/contracts.mjs` (regenerates `contracts/bff.d.ts` with
`openapi-typescript@7.10.1`, pinned). **After changing any route or schema, run
`npm run contracts:generate` and commit `contracts/` — CI's `contracts:check` fails otherwise.**
There is no `contracts:sync` here: the paired web service pulls the contract on its side
(`contracts:sync` in `Messages_Web_Service`), and related branches ship together.

## Tests with contract-driven upstream mocks

- `tests/message_helpers.test.ts` `jest.mock`s `messageClient` (fast helper unit tests).
- `tests/messages.upstream-mocks.test.ts` keeps the **real** axios client and `fetch`, and serves
  Message API, Core API, Project API and Calendar API from local HTTP servers
  (`tests/support/contract-mock-server.ts`) that validate every request path, query, JSON body and
  every mocked success response against contracts rebuilt at test time from the **installed**
  `@mairie360/message-api-openapi`, `core-api-openapi`, `project-api-openapi` and `calendar-api-openapi`
  packages (`tests/support/orval-contract.ts` parses their
  orval `endpoints/*.ts` + `model/*.ts` with the TypeScript compiler API). Bump a package to test
  against a new upstream contract; `tests/upstream-contracts.test.ts` checks versions, consumed
  operations and fixtures. Orval loses error statuses (success is exposed as `2XX`): every mocked
  error reply needs `outOfContract: true`; known upstream contract bugs go through
  `allowDeviation(pattern, reason)`. BFF responses are validated against `contracts/openapi.json`.
- Every client reads its upstream URL on each call, so tests may change `<SERVICE>_URL` at any time
  (the `upstream configuration (MAIR-431)` tests unset them to check the 503s).
- `openapi-contract.ts`, `contract-mock-server.ts` and `orval-contract.ts` are shared verbatim with
  `BFF_Calendar` and `BFF_Dashboard`; keep the copies identical.

## Integration tests on the real stack (MAIR-262)

Jest tests mock the upstream APIs; `integration_test.sh` is the only test of the BFF on a real stack. It brings up
`docker-compose-integration.yml` (the upstream services of the ZAP / k6 stacks: published Message API and Core API
images, database + liquibase + `init-test.sql`, Redis; Project API and Calendar API stay absent, pointed at a closed
port) and a `newman` service that replays `tests/postman/collection.json` with `tests/postman/environment.json`
against the BFF, `--bail` on the first failing request; the exit code of newman is the exit code of the script. Like
the other stacks it tests the image named by `IMAGE_REF` (`bff-message:local` built from `development.Dockerfile`
when empty), sources `stack_secrets.sh` (random `JWT_SECRET` per run) and drops the volumes before and after. In CI
it is the `integration_tests` staging gate of `promote-staging.yml` (mairie360/CICD `integration/bffs`) on the
published `dev-<sha>` image: a failure blocks the promotion; the junit report (`newman-reports/newman.xml`,
gitignored) is published as job summary and artifact.

The collection is split in two kinds of checks, both on the BFF's own routes:

- **working checks** (folders `Service`, `Session resolution`, `Directory`): the BFF starts, `/health`,
  `/check_apis` (Message API and Core API `Connected`), `/openapi.json`, a JSON 404, the session (401 without a
  Bearer, the seeded administrator `sub=1` and agent `sub=2` through `/me` and `/messaging/bootstrap`), the contacts
  read from the Core directory without the caller;
- **business journeys** the front relies on: the seeded conversation 101 (opened by its numeric id, 404 for a
  conversation the agent is not a member of, acknowledgement of the seeded message), the direct conversation between
  the administrator and the agent (one per pair whoever opens it, listed on both sides with the unread counter, the
  history paged with `nextCursor` / `before`, acknowledged with and without a body, hidden by each side and deleted
  with the last one: 404 afterwards), the group conversation (created by the agent with the administrator and a
  contact, posted in, found by `search`, the list paged with `cursor`, read and acknowledged by the administrator,
  left by both), the business references degrading to `unavailable` without Project API and Calendar API, the
  attachment upload (multipart, 401 then the documented 503 of MAIR-400) and `GET /stream` (an event stream ended by
  the stack after `MESSAGE_STREAM_MAX_MS`, 1 s).

The seeded accounts have no known password: the collection-level pre-request script forges their JWTs
(HS256 `{ sub, role, exp }`, like `mairie360_api_lib`) with the `jwt_secret` the compose file injects
(`jwt_admin`, `jwt_agent`); the committed `environment.json` holds no secret or token. The names of the conversations
created by a run carry its `run_id`, and the run leaves them, so the collection stays replayable. Isolated endpoint
checks (validation errors, token refusals) stay in jest: the collection only holds journeys and the checks that need
a real Message API or Core API.

`tests/integration-collection.test.ts` guards the collection with the unit tests: every operation of
`contracts/openapi.json` has at least one request (a new route needs its request), every request has a
`pm.test`, every request targets a declared route (or `/openapi.json` / the 404 check), and the environment
commits no secret. The collection is generated for now from a session script; edit the JSON directly
(Postman v2.1), keeping one folder per journey and English names. `POST /attachments` sends
`tests/postman/newman-attachment.txt` as a `formdata` body, read by newman from its `--working-dir`
(`/etc/newman`, the mounted `tests/postman/`).

## ZAP / k6 OpenAPI coverage gate

`security_test.sh` / `performance_test.sh` clone `mairie360/CICD` into `cicd-repo/` (gitignored) at
the pinned `cicd_version` (`CICD_VERSION=<branch>` overrides it). ZAP runs its
`tests/zap/zap_hooks.py` with `--hook`: every operation of the served spec must be reached, and
non-public ones with a non-401/403 answer. The spec declares `bearerAuth` only at the top
level (`src/openapi.ts`); public routes (`/health`, `/check_apis`) set `security: []` in
`registerPath`. `load-test.js` builds on `coverage.js` with **one handler per operation** of
`contracts/openapi.json`: a new route without a handler makes k6 abort at init. Two scenarios:
`crud` (2 VUs) runs every handler through `coverage.run()` and carries the gate; `reads` (ramp to
20 VUs) replays the GET handlers only, so GET handlers must read seeded fixtures (conversation 101,
of which user 2 is a member), never `state`. Every operation gets a `p(95)` threshold from its
family (`budgetOf`). In `crud`, handlers run path by path in contract order and, per path,
get → put → post → delete → patch: `DELETE /conversations/{id}` runs before `POST /groups`, so it
creates the group it deletes, and `cleanup()` deletes the group and direct conversation the
iteration kept. `POST /attachments` is sent as a hand-built multipart string body.

MAIR-474: both scripts source `stack_secrets.sh` (a random `JWT_SECRET` per run, `ADMIN_JWT` for the ZAP replacer), drop the volumes before and after a run, exit 1 when a dependency does not start, and `performance_test.sh` pins the stack to `min(PERF_CPUS, nproc)` CPUs (4 by default). The session routes use bffs-lib `requireSession` (the BFF verifies the token with `JWT_SECRET`, required at startup). `.zap/rules.tsv` no longer ignores rule `100000` (server errors) except on `/attachments`, whose documented answer is 503 (MAIR-400), and rule `100001` (unexpected content type) is scoped out of `/stream` only, whose documented answer is `text/event-stream` (MAIR-525). `GET /contacts` refuses control characters in `search` (Core API answers 400 to them), and leaving a conversation the caller is not a member of answers 404. The perf seeder also runs `init-perf.sql`, Message_API's seed copied as is (agents `400001`-`402000`, 16 group chats each); the reads run as random agents and check their own profile, chats and messages; `conversations_rush` sends `GET /conversations` at a fixed rate; each `crud` VU sends its direct message to its own recipient (the BFF reuses the direct conversation that `cleanup()` leaves); thresholds are strict (`checks == 100%`, `http_req_failed == 0`, `dropped_iterations == 0`); `K6_PROFILE` is `ci` (default) or `stress`. `GET /conversations` used to read the members and directory names of every chat (about 33 upstream calls for an agent of 16 chats), which saturated the event loop under the rush (`GET /health` p95 of about 75 ms for a 50 ms budget): since MAIR-507 it is one call, `GET /health` has a p95 of about 7 ms and the rush p95 is about 22 ms. The reads also search by member name and page through the list, and the load handler of `GET /conversations/{conversationId}` checks the 8 members and 25 messages with their names.

## Linting

`eslint.config.cjs` (flat config) is the active one; `.eslintrc.js` is legacy and unused. Only
`src/**/*.ts` is linted. `no-await-in-loop` is an error (MAIR-525; the `has_more` member pages and the bootstrap's
404 fallback stay sequential and say why). `@typescript-eslint/no-explicit-any` is an **error** — use `unknown` +
narrowing. Unused args must be `_`-prefixed.

## Logs (MAIR-531)

Logs are JSON lines on stdout, through `logger` (`src/logger.ts`, `createLogger({ target: 'bff-message' })` of
`@mairie360/bffs-lib` >= 2.1.0); **no `console.*` in `src/`**. `src/app.ts` mounts `requestLogger({ logger })` first
(one `request completed` line per request: `request_id`, `method`, matched route, `status`, `duration_ms`; `X-Request-Id`
answered) and passes the same `logger` to `errorHandler` and `checkApis`. Another line takes `request_id: requestId(req)`
and scalar fields only; an error goes through `describeError(error)`, never as is (MAIR-290). Tests read the lines with
`captureLogs()` (`tests/support/logs.ts`), which also silences them.

## Pull request reviewers

Every PR requests a review from the whole team, minus its author: `CarolinHugo`, `LAURETbenjamin`, `MathTek` and `Quentintnrl` (`gh pr create … --reviewer CarolinHugo,LAURETbenjamin,MathTek`). `.github/CODEOWNERS` makes GitHub request them automatically as well.

## Promotion to staging and prod (MAIR-494)

A push to `main` only releases dev (`cicd.yml` stops at `release-dev`). Staging and prod are manual:
`gh workflow run promote-staging.yml -R mairie360/BFF_Message` (main's newest commit) or `gh workflow run promote-staging.yml -R mairie360/BFF_Message -f sha=SHA` (a given commit), then the same with `promote-prod.yml`
(environments `Staging` / `Prod`). Staging refuses a commit without `dev-<sha>` and a green main run, and runs
the integration (newman, MAIR-262), ZAP and k6 stacks on that image; prod refuses one without `staging-<sha>` and tags the version semantic-release computes
for that commit. `cicd.yml`, `promote-staging.yml` and `promote-prod.yml` pin the same mairie360/CICD release.
