# BFF_Message

Combine conversations, messages, contacts and business references for Mairie360 internal messaging. The BFF adapts Message API and connects conversations to the user context and visible projects or events.

Regrouper conversations, messages, contacts et références métier pour la messagerie interne de Mairie360. Le BFF adapte Message API et associe les conversations au contexte utilisateur et aux projets ou événements visibles.

## Documentation

| Language / Langue | Module | Technical / Technique |
| --- | --- | --- |
| English | [Module overview](docs/en/module.md) | [Technical documentation](docs/en/technical.md) |
| Français | [Présentation du module](docs/fr/module.md) | [Documentation technique](docs/fr/technical.md) |

The sections below are a quick reference in English; the French version of the setup, the routes and the checks is in [docs/fr/technical.md](docs/fr/technical.md).

Les sections ci-dessous sont un aide-mémoire en anglais ; leur version française (installation, routes, vérifications) est dans [docs/fr/technical.md](docs/fr/technical.md).

## Quick start

Node.js 24 and read access to the GitHub Packages of `mairie360` (`NODE_AUTH_TOKEN`, `read:packages`) are needed for the private `@mairie360/*` packages.

```bash
export NODE_AUTH_TOKEN=<token with read:packages>
npm ci
cp .env.example .env   # then fill it, see below
npm run start
```

The BFF listens on port `4003`: `GET /health` checks the process, `GET /check_apis` its upstreams, `/docs` serves Swagger UI and `/openapi.json` the contract.

Configuration (local example, every upstream is required: there is no `localhost` default):

```dotenv
PORT=4003
MESSAGE_API_URL=http://localhost:3003
CORE_API_URL=http://localhost:3000
PROJECT_API_URL=http://localhost:3001
CALENDAR_API_URL=http://localhost:3002
# Core's Ed25519 public key (MAIR-680), required: paste the public key of the Core you run against.
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n<base64 of Core's public key>\n-----END PUBLIC KEY-----"
```

## Routes

Generated contract: [`contracts/openapi.json`](contracts/openapi.json) (16 operations), published on every release as `@mairie360/bff-message-openapi` for the front.

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/health` | Check the health of the BFF |
| `GET` | `/check_apis` | Checks that Message API and Core API (directory) are reachable |
| `GET` | `/business-references` | List the projects, tasks and events a message can refer to |
| `POST` | `/attachments` | Upload an attachment (not available yet: no attachment storage exists upstream) |
| `GET` | `/messaging/bootstrap` | Get the startup data of the current user |
| `GET` | `/contacts` | List the contacts |
| `GET` | `/conversations` | List the conversations of the current user |
| `GET` | `/conversations/{conversationId}` | Opens a conversation: its members and one page of messages |
| `DELETE` | `/conversations/{conversationId}` | Delete a conversation |
| `POST` | `/conversations/{conversationId}/read` | Acknowledges the messages of a conversation as read |
| `POST` | `/groups` | Create a new group |
| `GET` | `/me` | Get the profile of the current user |
| `GET` | `/conversations/{conversationId}/messages` | List the messages of a conversation |
| `POST` | `/conversations/{conversationId}/messages` | Create a new message in a conversation |
| `POST` | `/direct-messages` | Create a new direct message |

## Upstream contracts

The BFF calls its upstreams through these published packages (never through a local checkout); bumping one of them is how an upstream change reaches this BFF:

- `@mairie360/calendar-api-openapi`
- `@mairie360/core-api-openapi`
- `@mairie360/message-api-openapi`
- `@mairie360/project-api-openapi`

## Commands

```bash
npm run lint                 # eslint
npm test                     # jest: unit, route and upstream-mock tests
npm run contracts:generate   # regenerate contracts/ after a route, schema or status change
npm run contracts:check      # CI gate: fails when contracts/ is stale
```

Docker stacks, one at a time (they need `NODE_AUTH_TOKEN` and pull access to `ghcr.io/mairie360`):

- `./integration_test.sh`: newman collection against the stack of `docker-compose-integration.yml`
- `./security_test.sh`: OWASP ZAP scan of `/openapi.json` (`docker-compose-security.yml`)
- `./performance_test.sh`: k6 load test (`docker-compose-performance.yml`)
- `./gdpr_marker_test.sh`: GDPR marker check (`docker-compose-gdpr-marker.yml`)
- `./gdpr_simulation_test.sh`: GDPR erasure simulation (`docker-compose-gdpr-simulation.yml`)

CI is the reusable `mairie360/CICD` workflow called by `.github/workflows/cicd.yml`.

## Contracts and background / Contrats et compléments

- [CONTRACT.md](CONTRACT.md)
- [contracts/openapi.json](contracts/openapi.json)
