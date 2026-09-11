# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`bff-message` is the Backend-for-Frontend for Mairie360 internal messaging. It adapts the upstream
**Message API** (chats/messages), **Core API** (user context), a PostgreSQL `users` table (contacts),
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

Node **22** is required to reproduce the contract job / CI (`.github/workflows/contracts.yml`,
`cicd.yml` → `mairie360/CICD` reusable workflow). The Docker images use `node:20-alpine` and run via
`tsx` at runtime, not compiled JS — this is deliberate (private `@mairie360/*` packages ship `.ts`).

Private `@mairie360/*` dependencies come from GitHub Packages. `.npmrc` reads `NODE_AUTH_TOKEN` from
the environment; set it to a token with read access to those packages before `npm ci`.

Env vars for local runs (all optional, each client falls back to a `localhost` default):
`PORT` (required), `DEFAULT_JWT_TOKEN`, `CORE_API_BASE_URL`/`CORE_API_URL` + `CORE_API_PORT`,
`MESSAGE_API_BASE_PATH`, `PROJECT_BFF_URL`, `CALENDAR_BFF_URL`, `DB_HOST`/`DB_PORT`/`DB_NAME`/
`DB_USER`/`DB_PASSWORD` (Postgres `users` table for contacts).

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

**Upstream clients.** `src/clients/coreClient.ts` and `messageClient.ts` are hand-written axios
wrappers over the generated `@mairie360/*-openapi` model types (base URLs assembled from env with
`http://` normalization and `*_PORT` fallbacks). `src/repositories/contactsRepository.ts` talks to
Postgres directly with `pg.Pool` against the `users` table — contacts do **not** go through an API.
`business_references.ts` uses native `fetch` against `PROJECT_BFF_URL` / `CALENDAR_BFF_URL` and
degrades per-source (`sources: available | unavailable`).

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

`contracts:generate` runs `scripts/export-swagger.ts` (writes `contracts/openapi.json` +
root `openapi.json`) then `scripts/contracts.mjs` (regenerates `contracts/bff.d.ts` with
`openapi-typescript@7.10.1`, pinned). **After changing any route or schema, run
`npm run contracts:generate` and commit `contracts/` — CI's `contracts:check` fails otherwise.**
`contracts:sync` is currently inert here (`source = null` in `contracts.mjs`); the paired web
service pulls the contract on its side, and related branches ship together.

## Linting

`eslint.config.cjs` (flat config) is the active one; `.eslintrc.js` is legacy and unused. Only
`src/**/*.ts` is linted. `@typescript-eslint/no-explicit-any` is an **error** — use `unknown` +
narrowing. Unused args must be `_`-prefixed.
