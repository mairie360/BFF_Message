# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`bff-message` is the Backend-for-Frontend for Mairie360 internal messaging. It adapts the upstream
**Message API** (chats/messages), the **Core API** directory (contacts and current user),
and **BFF Project** / **BFF Calendar** (business references) into the shapes the
[`Messages_Web_Service`](https://github.com/mairie360/Messages_Web_Service) frontend needs. The BFF
owns the data contract; the web service owns the screens. Docs live in `docs/{en,fr}/` and `CONTRACT.md`.

## Commands

```bash
npm ci                          # install (needs NODE_AUTH_TOKEN, see below)
npm run start                   # ts-node src/index.ts (PORT env var is REQUIRED)
npm run build                   # tsc -> dist/
npm run lint                    # eslint . --ext .ts    (lint:fix to autofix; only src/**/*.ts is actually linted, see eslint.config.cjs)
npm test                        # jest (all tests/**/*.test.ts)
npx jest tests/contracts.test.ts        # single file
npx jest -t "business references"       # single test by name
npm test -- --runInBand                 # how CI runs it
npm run contracts:generate      # regenerate contracts/ after any route/schema change
npm run contracts:check         # fails if contracts/ is stale (CI gate)
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
`src/index.ts`): `PORT`, and one `<SERVICE>_URL` (+ optional `<SERVICE>_PORT`) per upstream, read on
every call by the lib's `baseUrl` (MAIR-431): `MESSAGE_API_URL`, `CORE_API_URL`, `PROJECT_BFF_URL`,
`CALENDAR_BFF_URL`. There is no localhost default: `assertConfigured(UPSTREAMS)` stops the server at
start-up when one is missing (under `require.main === module`, so tests are not affected), and a route
calling an unconfigured upstream answers 503 (declared in the contract). `TRUST_PROXY` sets Express' `trust proxy` (lib `parseTrustProxy`). `RATE_LIMIT_ENABLED=false` disables the per-session limit of `GET /business-references`
(`BUSINESS_REFERENCES_RATE_LIMIT_MAX` / `_WINDOW_MS`, `src/middleware/rateLimit.ts`); the perf stack sets it.

## Architecture

**Entry point** `src/index.ts` builds `app` (exported for tests), sets `trust proxy` from `TRUST_PROXY`, the
Swagger UI at `/docs`, the spec at `/openapi.json` + `/swagger.json`, then `/health`, `/check_apis`,
and the Messages router at `/`.

**Auth flow (MAIR-429).** The only credential is `Authorization: Bearer <token>` (the front's proxy turns
the `accessToken` cookie into it; the BFF reads no cookie, no `x-session-token`). `src/routes/Messages/index.ts`
mounts `noStore` + `requireBearer` (`@mairie360/bffs-lib`) on every session-bound prefix
(`SESSION_BOUND_PATHS`), so an anonymous request gets 401 before any upstream call. Route handlers pass
`authorization(req)` (normalised `Bearer <token>`) down to helpers, which forward it on every upstream
call; there is no default/service token. The current user's numeric id is the JWT `sub` read with the
lib's `unverifiedSubject` (**no signature verification**): only to shape requests sent upstream with
the same token and the message direction, never for access decisions or rate-limit keys.

**Routing.** `src/routes/Messages/index.ts` composes one router per resource
(`conversation.ts`, `me.ts`, `contacts.ts`, `groups.ts`, `message.ts`, `bootstrap.ts`,
`attachments.ts`, `business_references.ts`). Nearly all business logic lives in
`src/routes/Messages/message_helpers.ts`; route files are thin (zod `safeParse` → call helper →
`throw upstreamError(error, declared)`).

**Errors.** Every error is `{ error: { code, message, details } }` (`@mairie360/bffs-lib`,
`ErrorResponse` in the contract, declared through `errorResponses({...})` on every operation).
Routes throw `HttpError` or `validationError(location, issues)` (400, one detail per invalid field);
Express 5 hands async rejections to `errorHandler()`, mounted last in `src/index.ts` after
`notFoundHandler`. `upstreamError(error, declared)` keeps only the upstream 4xx the route declares and
turns any other status or a network failure into 502; never relay upstream bodies. Register the
envelope with `ErrorResponseSchema.clone()` (zod 4 only adds `.openapi()` to schemas created after
`extendZodWithOpenApi`). When a route starts answering a new status, declare it in its `registerPath`.

**Upstream clients.** `src/clients/messageClient.ts` injects an axios instance (timeout and headers only)
into the generated `@mairie360/message-api-openapi` client; the helpers pass `baseURL: baseUrl('MESSAGE_API')`
and the caller's token on every call.
`src/clients/coreClient.ts` reads the directory (contacts and current user) through Core API's
`GET /api/v1/user/` — the BFF has no database access.
`business_references.ts` calls BFF Project and BFF Calendar through their published clients
(`@mairie360/bff-project-openapi`, `@mairie360/bff-calendar-openapi`) and degrades per-source
(`sources: available | unavailable`).

**ID convention.** Outward IDs are prefixed strings: `conversation-<n>`, `message-<n>`, `user-<n>`.
`parseNumericId` extracts the trailing digits before calling upstream (which uses numeric ids).
When adding fields, keep this mapping in the `map*ToDto` helpers.

**Not available yet** (MAIR-400, no upstream support): `POST /conversations/:id/read` and `POST /attachments`
check the session (401) then answer 503; never answer fabricated data. A non-empty `attachmentIds` is
refused (400) on send. `POST /direct-messages` reuses the caller's existing direct chat with the recipient
(`findDirectChat`) before creating one. `GET /business-references` bounds its fan-out (constants at the top
of `business_references.ts`) and is rate limited per caller. Never invent profile/author data: missing
directory values are left out.
`GET /me` resolves the caller from its own token through Core API on every request; never keep
module-level user state, it leaks one caller's profile to the next. There is no `PATCH /me`: profile
edits go through BFF_Settings (`PATCH /settings/profile`) → Core_API (`PATCH /api/v1/user/me`).

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
  Message API, BFF Project and BFF Calendar from local HTTP servers
  (`tests/support/contract-mock-server.ts`) that validate every request path, query, JSON body and
  every mocked success response against contracts rebuilt at test time from the **installed**
  `@mairie360/message-api-openapi` and `core-api-openapi` (dependencies), `bff-project-openapi` and
  `bff-calendar-openapi` (devDependencies) packages (`tests/support/orval-contract.ts` parses their
  orval `endpoints/*.ts` + `model/*.ts` with the TypeScript compiler API). Bump a package to test
  against a new upstream contract; `tests/upstream-contracts.test.ts` checks versions, consumed
  operations and fixtures. Orval loses error statuses (success is exposed as `2XX`): every mocked
  error reply needs `outOfContract: true`; known upstream contract bugs go through
  `allowDeviation(pattern, reason)`. BFF responses are validated against `contracts/openapi.json`.
- Every client reads its upstream URL on each call, so tests may change `<SERVICE>_URL` at any time
  (the `upstream configuration (MAIR-431)` tests unset them to check the 503s).
- `openapi-contract.ts`, `contract-mock-server.ts` and `orval-contract.ts` are shared verbatim with
  `BFF_Calendar` and `BFF_Dashboard`; keep the copies identical.

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

## Linting

`eslint.config.cjs` (flat config) is the active one; `.eslintrc.js` is legacy and unused. Only
`src/**/*.ts` is linted. `@typescript-eslint/no-explicit-any` is an **error** — use `unknown` +
narrowing. Unused args must be `_`-prefixed.

## Pull request reviewers

Every PR requests a review from the whole team, minus its author: `CarolinHugo`, `LAURETbenjamin`, `MathTek` and `Quentintnrl` (`gh pr create … --reviewer CarolinHugo,LAURETbenjamin,MathTek`). `.github/CODEOWNERS` makes GitHub request them automatically as well.
