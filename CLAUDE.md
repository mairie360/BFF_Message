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
while the other dependencies stay external. Node **22** is required to reproduce the contract job / CI (`.github/workflows/contracts.yml`,
`cicd.yml` → `mairie360/CICD` reusable workflow). The Docker images use `node:24-alpine`. The production image runs `node dist/index.js` (bundle);
the test stacks run `npx tsx src/index.ts` from `development.Dockerfile`.

Private `@mairie360/*` dependencies come from GitHub Packages. `.npmrc` reads `NODE_AUTH_TOKEN` from
the environment; set it to a token with read access to those packages before `npm ci`.

Env vars for local runs (all optional, each client falls back to a `localhost` default):
`PORT` (required), `DEFAULT_JWT_TOKEN`, `MESSAGE_API_BASE_PATH`, `MESSAGE_API_URL` + `MESSAGE_API_PORT`
(`/check_apis` only), `CORE_API_URL` + `CORE_API_PORT` (directory), `PROJECT_BFF_URL`,
`CALENDAR_BFF_URL`.

## Architecture

**Entry point** `src/index.ts` builds `app` (exported for tests), mounts an auth middleware, the
Swagger UI at `/docs`, the spec at `/openapi.json` + `/swagger.json`, then `/health`, `/check_apis`,
and the Messages router at `/`.

**Auth flow.** The middleware promotes an `accessToken` cookie to an `Authorization: Bearer` header
when none is present. Route handlers pass `req.headers.authorization` down to helpers, which forward
it to upstream services. When no caller token exists, the axios client interceptors
(`src/clients/*.ts`) fall back to `DEFAULT_JWT_TOKEN` (`src/config/token.ts`). The current user's
numeric id is taken from the JWT `sub` claim by base64url-decoding the payload **without signature
verification** (`numericUserIdFromToken` in `message_helpers.ts`).

**Routing.** `src/routes/Messages/index.ts` composes one router per resource
(`conversation.ts`, `me.ts`, `contacts.ts`, `groups.ts`, `message.ts`, `bootstrap.ts`,
`attachments.ts`, `business_references.ts`). Nearly all business logic lives in
`src/routes/Messages/message_helpers.ts`; route files are thin (zod `safeParse` → call helper →
`handleUnknownError`).

**Upstream clients.** `src/clients/messageClient.ts` injects an axios instance (base URL from `MESSAGE_API_BASE_PATH` with
`http://` normalization) into the generated `@mairie360/message-api-openapi` client.
`src/clients/coreClient.ts` reads the directory (contacts and current user) through Core API's
`GET /api/v1/user/` — the BFF has no database access.
`business_references.ts` calls BFF Project and BFF Calendar through their published clients
(`@mairie360/bff-project-openapi`, `@mairie360/bff-calendar-openapi`) and degrades per-source
(`sources: available | unavailable`).

**ID convention.** Outward IDs are prefixed strings: `conversation-<n>`, `message-<n>`, `user-<n>`.
`parseNumericId` extracts the trailing digits before calling upstream (which uses numeric ids).
When adding fields, keep this mapping in the `map*ToDto` helpers.

**Deliberately non-persistent** (do not "fix" without checking intent): `POST /conversations/:id/read`
returns `unreadCount: 0` without calling upstream; `PATCH /me` mutates a module-level `currentUser`
variable in-process; `POST /attachments` returns fabricated metadata with no binary storage.

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
- `messageClient` and `check_apis` read their upstream URL at module load, so the app is imported
  after the env vars are set; the other clients read theirs on each call.
- `openapi-contract.ts`, `contract-mock-server.ts` and `orval-contract.ts` are shared verbatim with
  `BFF_Calendar` and `BFF_Dashboard`; keep the copies identical.

## Linting

`eslint.config.cjs` (flat config) is the active one; `.eslintrc.js` is legacy and unused. Only
`src/**/*.ts` is linted. `@typescript-eslint/no-explicit-any` is an **error** — use `unknown` +
narrowing. Unused args must be `_`-prefixed.

## Pull request reviewers

Every PR requests a review from the whole team, minus its author: `CarolinHugo`, `LAURETbenjamin`, `MathTek` and `Quentintnrl` (`gh pr create … --reviewer CarolinHugo,LAURETbenjamin,MathTek`). `.github/CODEOWNERS` makes GitHub request them automatically as well.
