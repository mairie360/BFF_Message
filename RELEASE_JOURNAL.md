# Journal des releases — BFF_Message

<!-- release-journal-state {"dev": "9cb0aa6787d556b57b2e858ee6f9bdbe355d42e3", "prod": "bb90cbfd09358ba7868710dcac2972facd7d8c1b", "prod_tag": "v1.0.0", "staging": "bb90cbfd09358ba7868710dcac2972facd7d8c1b", "updated": {"dev": "2026-10-20 13:03 UTC"}} -->
> Tenu à jour par la CI (`mairie360/CICD`, action `release/release-journal`) à chaque passage en dev, staging et prod. Ne pas modifier à la main : le fichier est réécrit au passage suivant.

| Environnement | Version | Commit | Mis à jour |
| --- | --- | --- | --- |
| prod | v1.0.0 | `bb90cbf` | — |
| staging | — | `bb90cbf` | — |
| dev | — | `9cb0aa6` | 2026-10-20 13:03 UTC |

## Ajouté sur main depuis la dernière release prod (v1.0.0)

#### Nouveautés
- Le BFF envoie désormais ses traces et ses métriques HTTP en OTLP au collecteur désigné par `OTEL_EXPORTER_OTLP_ENDPOINT`, sous le nom de service `bff-message`. La télémétrie est désactivée si cette variable n'est pas définie ou si `OTEL_SDK_DISABLED=true`. Les traces couvrent le span serveur nommé d'après la route, les handlers et les appels amont, qui portent `traceparent`. Seuls la méthode, le statut, la route paramétrée et l'hôte appelé sortent du BFF, jamais une URL, une query string, un en-tête, un identifiant ou une IP. (MAIR-504, [#181](https://github.com/mairie360/BFF_Message/pull/181))

#### Changements de comportement
- Le contrat OpenAPI du BFF (`contracts/openapi.json`, `contracts/bff.d.ts`) documente une réponse `429` (`ErrorResponse`) sur de nombreuses routes de messagerie, contacts, conversations, pièces jointes et profil. Elle correspond au cas « An upstream API rate limit is reached: retry after the Retry-After header (seconds) ». Le diff est tronqué : l'effet exact à l'exécution n'est pas visible en entier. (MAIR-568, [#213](https://github.com/mairie360/BFF_Message/pull/213))

#### Technique
- Contrats OpenAPI des APIs :
  - D'abord alignés sur les versions prod (`@mairie360/calendar-api-openapi` 1.1.0, `@mairie360/core-api-openapi` 2.1.0, `@mairie360/message-api-openapi` 2.0.0, `@mairie360/project-api-openapi` 1.1.0) avec mise à jour des fixtures de test. (MAIR-568, [#213](https://github.com/mairie360/BFF_Message/pull/213))
  - Puis repassés sur les builds dev (`0.0.0-dev-3b4668b`, `0.0.0-dev-30d9bb5`, `0.0.0-dev-75d7650`, `0.0.0-dev-be2b410`). Les images `message-api` (`dev-75d7650`) et `core-api` (`dev-30d9bb5`) des stacks de test suivent, et `package-lock.json` est régénéré pour que `npm ci` repasse. (MAIR-575, [#223](https://github.com/mairie360/BFF_Message/pull/223))
- CI et outillage (7 commits) :
  - Workflow `mairie360/CICD` passé de v4.2.0 à v4.3.2 (4 commits). ([#214](https://github.com/mairie360/BFF_Message/pull/214), [#217](https://github.com/mairie360/BFF_Message/pull/217), [#220](https://github.com/mairie360/BFF_Message/pull/220), [#224](https://github.com/mairie360/BFF_Message/pull/224))
  - Transmission des secrets `ANTHROPIC_API_KEY`, `RELEASE_APP_ID` et `RELEASE_APP_PK` pour le journal des releases. (MAIR-571, [#219](https://github.com/mairie360/BFF_Message/pull/219))
  - Mises à jour de dépendances de dev : `eslint`, `ts-jest`, `typescript-eslint` (3 commits). ([#215](https://github.com/mairie360/BFF_Message/pull/215), [#216](https://github.com/mairie360/BFF_Message/pull/216), [#221](https://github.com/mairie360/BFF_Message/pull/221))

## Différence dev → staging (en dev, pas encore en staging)

#### Nouveautés
- Le BFF envoie désormais ses traces et ses métriques HTTP en OTLP au collecteur désigné par `OTEL_EXPORTER_OTLP_ENDPOINT`, sous le nom de service `bff-message`. La télémétrie est désactivée si cette variable n'est pas définie ou si `OTEL_SDK_DISABLED=true`. Les traces couvrent le span serveur nommé d'après la route, les handlers et les appels amont, qui portent `traceparent`. Seuls la méthode, le statut, la route paramétrée et l'hôte appelé sortent du BFF, jamais une URL, une query string, un en-tête, un identifiant ou une IP. (MAIR-504, [#181](https://github.com/mairie360/BFF_Message/pull/181))

#### Changements de comportement
- Le contrat OpenAPI du BFF (`contracts/openapi.json`, `contracts/bff.d.ts`) documente une réponse `429` (`ErrorResponse`) sur de nombreuses routes de messagerie, contacts, conversations, pièces jointes et profil. Elle correspond au cas « An upstream API rate limit is reached: retry after the Retry-After header (seconds) ». Le diff est tronqué : l'effet exact à l'exécution n'est pas visible en entier. (MAIR-568, [#213](https://github.com/mairie360/BFF_Message/pull/213))

#### Technique
- Contrats OpenAPI des APIs :
  - D'abord alignés sur les versions prod (`@mairie360/calendar-api-openapi` 1.1.0, `@mairie360/core-api-openapi` 2.1.0, `@mairie360/message-api-openapi` 2.0.0, `@mairie360/project-api-openapi` 1.1.0) avec mise à jour des fixtures de test. (MAIR-568, [#213](https://github.com/mairie360/BFF_Message/pull/213))
  - Puis repassés sur les builds dev (`0.0.0-dev-3b4668b`, `0.0.0-dev-30d9bb5`, `0.0.0-dev-75d7650`, `0.0.0-dev-be2b410`). Les images `message-api` (`dev-75d7650`) et `core-api` (`dev-30d9bb5`) des stacks de test suivent, et `package-lock.json` est régénéré pour que `npm ci` repasse. (MAIR-575, [#223](https://github.com/mairie360/BFF_Message/pull/223))
- CI et outillage (7 commits) :
  - Workflow `mairie360/CICD` passé de v4.2.0 à v4.3.2 (4 commits). ([#214](https://github.com/mairie360/BFF_Message/pull/214), [#217](https://github.com/mairie360/BFF_Message/pull/217), [#220](https://github.com/mairie360/BFF_Message/pull/220), [#224](https://github.com/mairie360/BFF_Message/pull/224))
  - Transmission des secrets `ANTHROPIC_API_KEY`, `RELEASE_APP_ID` et `RELEASE_APP_PK` pour le journal des releases. (MAIR-571, [#219](https://github.com/mairie360/BFF_Message/pull/219))
  - Mises à jour de dépendances de dev : `eslint`, `ts-jest`, `typescript-eslint` (3 commits). ([#215](https://github.com/mairie360/BFF_Message/pull/215), [#216](https://github.com/mairie360/BFF_Message/pull/216), [#221](https://github.com/mairie360/BFF_Message/pull/221))

## Différence staging → prod (en staging, pas encore en prod)

_Rien._

## Historique des passages

<!-- release-journal-history:start -->
| Date | Environnement | Version | Commit | Run |
| --- | --- | --- | --- | --- |
| 2026-10-20 13:03 UTC | dev | — | `9cb0aa6` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39426618962) |
<!-- release-journal-history:end -->
