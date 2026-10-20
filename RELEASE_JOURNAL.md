# Journal des releases — BFF_Message

<!-- release-journal-state {"dev": "815c7323097815c25416a17fb667b635af10c22c", "prod": "bb90cbfd09358ba7868710dcac2972facd7d8c1b", "prod_tag": "v1.0.0", "staging": "bb90cbfd09358ba7868710dcac2972facd7d8c1b", "updated": {"dev": "2026-10-20 17:56 UTC"}} -->
> Tenu à jour par la CI (`mairie360/CICD`, action `release/release-journal`) à chaque passage en dev, staging et prod. Ne pas modifier à la main : le fichier est réécrit au passage suivant.

| Environnement | Version | Commit | Mis à jour |
| --- | --- | --- | --- |
| prod | v1.0.0 | `bb90cbf` | — |
| staging | — | `bb90cbf` | — |
| dev | — | `815c732` | 2026-10-20 17:56 UTC |

## Ajouté sur main depuis la dernière release prod (v1.0.0)

#### Nouveautés
- Le BFF exporte désormais ses traces (span serveur nommé d'après la route, spans des handlers, appels aux APIs amont avec propagation `traceparent`) et ses métriques HTTP en OTLP vers `OTEL_EXPORTER_OTLP_ENDPOINT`, sous le nom de service `bff-message`. Si la variable n'est pas définie, ou avec `OTEL_SDK_DISABLED=true`, rien n'est exporté. Seuls la méthode, le statut, la route paramétrée et l'hôte amont sortent du BFF : jamais d'URL, de query string, d'en-tête, d'identifiant ni d'IP. `OTEL_SERVICE_NAME` et `OTEL_RESOURCE_ATTRIBUTES` permettent de surcharger le nom du service et d'ajouter des attributs comme `service.version` ou `deployment.environment.name`. (MAIR-504, [#181](https://github.com/mairie360/BFF_Message/pull/181))

#### Changements de comportement
- Le contrat OpenAPI du BFF (`contracts/openapi.json`, `contracts/bff.d.ts`) documente désormais une réponse `429` (`ErrorResponse`, « An upstream API rate limit is reached: retry after the Retry-After header (seconds) ») sur les routes qui appellent Message API ou Core API. `src/openapi-registry.ts` et les tests de mocks amont sont aussi modifiés, mais le diff est tronqué : l'effet exact à l'exécution n'est pas détaillé ici. (MAIR-568, [#213](https://github.com/mairie360/BFF_Message/pull/213))

#### Technique
- Contrats OpenAPI amont réalignés en trois étapes, sans changement de code d'après les PR :
  - passage aux versions prod (MAIR-568, [#213](https://github.com/mairie360/BFF_Message/pull/213)) ;
  - puis aux builds dev (MAIR-575, [#223](https://github.com/mairie360/BFF_Message/pull/223)) ;
  - puis au build staging de Core API (MAIR-600, [#226](https://github.com/mairie360/BFF_Message/pull/226)).
  - Versions finales : `@mairie360/core-api-openapi` `0.0.0-staging.b900797`, `@mairie360/calendar-api-openapi` `0.0.0-dev-3b4668b`, `@mairie360/message-api-openapi` `0.0.0-dev-75d7650`, `@mairie360/project-api-openapi` `0.0.0-dev-be2b410`.
  - Les images `core-api` et `message-api` des stacks docker-compose suivent ces versions.
- 4 montées du workflow réutilisable `mairie360/CICD` (v4.2.0 → v4.3.2) et transmission des secrets du journal des releases (`ANTHROPIC_API_KEY`, `RELEASE_APP_ID`, `RELEASE_APP_PK`) (MAIR-571, [#214](https://github.com/mairie360/BFF_Message/pull/214), [#217](https://github.com/mairie360/BFF_Message/pull/217), [#220](https://github.com/mairie360/BFF_Message/pull/220), [#224](https://github.com/mairie360/BFF_Message/pull/224), [#219](https://github.com/mairie360/BFF_Message/pull/219)). 3 mises à jour de dépendances de développement (`ts-jest`, `eslint`, `typescript-eslint`) ([#215](https://github.com/mairie360/BFF_Message/pull/215), [#216](https://github.com/mairie360/BFF_Message/pull/216), [#221](https://github.com/mairie360/BFF_Message/pull/221)).

## Différence dev → staging (en dev, pas encore en staging)

#### Nouveautés
- Le BFF exporte désormais ses traces (span serveur nommé d'après la route, spans des handlers, appels aux APIs amont avec propagation `traceparent`) et ses métriques HTTP en OTLP vers `OTEL_EXPORTER_OTLP_ENDPOINT`, sous le nom de service `bff-message`. Si la variable n'est pas définie, ou avec `OTEL_SDK_DISABLED=true`, rien n'est exporté. Seuls la méthode, le statut, la route paramétrée et l'hôte amont sortent du BFF : jamais d'URL, de query string, d'en-tête, d'identifiant ni d'IP. `OTEL_SERVICE_NAME` et `OTEL_RESOURCE_ATTRIBUTES` permettent de surcharger le nom du service et d'ajouter des attributs comme `service.version` ou `deployment.environment.name`. (MAIR-504, [#181](https://github.com/mairie360/BFF_Message/pull/181))

#### Changements de comportement
- Le contrat OpenAPI du BFF (`contracts/openapi.json`, `contracts/bff.d.ts`) documente désormais une réponse `429` (`ErrorResponse`, « An upstream API rate limit is reached: retry after the Retry-After header (seconds) ») sur les routes qui appellent Message API ou Core API. `src/openapi-registry.ts` et les tests de mocks amont sont aussi modifiés, mais le diff est tronqué : l'effet exact à l'exécution n'est pas détaillé ici. (MAIR-568, [#213](https://github.com/mairie360/BFF_Message/pull/213))

#### Technique
- Contrats OpenAPI amont réalignés en trois étapes, sans changement de code d'après les PR :
  - passage aux versions prod (MAIR-568, [#213](https://github.com/mairie360/BFF_Message/pull/213)) ;
  - puis aux builds dev (MAIR-575, [#223](https://github.com/mairie360/BFF_Message/pull/223)) ;
  - puis au build staging de Core API (MAIR-600, [#226](https://github.com/mairie360/BFF_Message/pull/226)).
  - Versions finales : `@mairie360/core-api-openapi` `0.0.0-staging.b900797`, `@mairie360/calendar-api-openapi` `0.0.0-dev-3b4668b`, `@mairie360/message-api-openapi` `0.0.0-dev-75d7650`, `@mairie360/project-api-openapi` `0.0.0-dev-be2b410`.
  - Les images `core-api` et `message-api` des stacks docker-compose suivent ces versions.
- 4 montées du workflow réutilisable `mairie360/CICD` (v4.2.0 → v4.3.2) et transmission des secrets du journal des releases (`ANTHROPIC_API_KEY`, `RELEASE_APP_ID`, `RELEASE_APP_PK`) (MAIR-571, [#214](https://github.com/mairie360/BFF_Message/pull/214), [#217](https://github.com/mairie360/BFF_Message/pull/217), [#220](https://github.com/mairie360/BFF_Message/pull/220), [#224](https://github.com/mairie360/BFF_Message/pull/224), [#219](https://github.com/mairie360/BFF_Message/pull/219)). 3 mises à jour de dépendances de développement (`ts-jest`, `eslint`, `typescript-eslint`) ([#215](https://github.com/mairie360/BFF_Message/pull/215), [#216](https://github.com/mairie360/BFF_Message/pull/216), [#221](https://github.com/mairie360/BFF_Message/pull/221)).

## Différence staging → prod (en staging, pas encore en prod)

_Rien._

## Historique des passages

<!-- release-journal-history:start -->
| Date | Environnement | Version | Commit | Run |
| --- | --- | --- | --- | --- |
| 2026-10-20 17:56 UTC | dev | — | `815c732` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39469831715) |
| 2026-10-20 13:03 UTC | dev | — | `9cb0aa6` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39426618962) |
<!-- release-journal-history:end -->
