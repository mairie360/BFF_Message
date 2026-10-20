# Journal des releases — BFF_Message

<!-- release-journal-state {"dev": "815c7323097815c25416a17fb667b635af10c22c", "prod": "bb90cbfd09358ba7868710dcac2972facd7d8c1b", "prod_tag": "v1.0.0", "staging": "815c7323097815c25416a17fb667b635af10c22c", "updated": {"dev": "2026-10-20 17:56 UTC", "staging": "2026-10-20 18:12 UTC"}} -->
> Tenu à jour par la CI (`mairie360/CICD`, action `release/release-journal`) à chaque passage en dev, staging et prod. Ne pas modifier à la main : le fichier est réécrit au passage suivant.

| Environnement | Version | Commit | Mis à jour |
| --- | --- | --- | --- |
| prod | v1.0.0 | `bb90cbf` | — |
| staging | — | `815c732` | 2026-10-20 18:12 UTC |
| dev | — | `815c732` | 2026-10-20 17:56 UTC |

## Ajouté sur main depuis la dernière release prod (v1.0.0)

#### Nouveautés
- Le BFF émet désormais de la télémétrie OpenTelemetry (`serviceName: 'bff-message'`) : traces (span serveur nommé d'après la route, spans des handlers, appels amont avec `traceparent`) et métriques HTTP exportées en OTLP vers `OTEL_EXPORTER_OTLP_ENDPOINT`. La télémétrie reste désactivée si cette variable n'est pas définie ou si `OTEL_SDK_DISABLED=true`. Seuls la méthode, le statut, la route paramétrée et l'hôte amont sont exportés, jamais une URL, une query string, un en-tête, un identifiant ou une IP. `OTEL_SERVICE_NAME` et `OTEL_RESOURCE_ATTRIBUTES` permettent de compléter la configuration. (MAIR-504, [#181](https://github.com/mairie360/BFF_Message/pull/181))

#### Changements de comportement
- Le contrat OpenAPI (`contracts/openapi.json`, `contracts/bff.d.ts`) documente désormais, sur de nombreuses routes de messagerie, de contacts, de conversations, de pièces jointes et de profil, une réponse `429` (`ErrorResponse`) quand une limite de débit d'une API amont est atteinte : l'appelant doit réessayer après le délai indiqué par l'en-tête `Retry-After` (en secondes). `src/openapi-registry.ts` et les tests de mocks amont sont aussi modifiés. Le diff est tronqué : le détail exact des routes concernées n'est pas visible. (MAIR-568, [#213](https://github.com/mairie360/BFF_Message/pull/213))

#### Technique
- Alignement des contrats amont, en trois étapes :
  - Passage sur les versions prod (MAIR-568, [#213](https://github.com/mairie360/BFF_Message/pull/213)).
  - Retour sur les builds dev pour la release dev, avec régénération de `package-lock.json` (MAIR-575, [#223](https://github.com/mairie360/BFF_Message/pull/223)).
  - Alignement de `@mairie360/core-api-openapi` sur `0.0.0-staging.b900797` (MAIR-600, [#226](https://github.com/mairie360/BFF_Message/pull/226)).
  - Versions finales : `@mairie360/calendar-api-openapi` `0.0.0-dev-3b4668b`, `@mairie360/message-api-openapi` `0.0.0-dev-75d7650`, `@mairie360/project-api-openapi` `0.0.0-dev-be2b410`. Les images `core-api` et `message-api` des stacks de test docker-compose suivent ces versions.
- 7 commits CI et dépendances de développement :
  - Workflow `mairie360/CICD` passé de v4.2.0 à v4.3.2 ([#214](https://github.com/mairie360/BFF_Message/pull/214), [#217](https://github.com/mairie360/BFF_Message/pull/217), [#220](https://github.com/mairie360/BFF_Message/pull/220), [#224](https://github.com/mairie360/BFF_Message/pull/224)).
  - Transmission des secrets `ANTHROPIC_API_KEY`, `RELEASE_APP_ID` et `RELEASE_APP_PK` pour le journal des releases (MAIR-571, [#219](https://github.com/mairie360/BFF_Message/pull/219)).
  - Mises à jour de `ts-jest`, `eslint` et `typescript-eslint` ([#215](https://github.com/mairie360/BFF_Message/pull/215), [#216](https://github.com/mairie360/BFF_Message/pull/216), [#221](https://github.com/mairie360/BFF_Message/pull/221)).

## Différence dev → staging (en dev, pas encore en staging)

_Rien._

## Différence staging → prod (en staging, pas encore en prod)

#### Nouveautés
- Le BFF émet désormais de la télémétrie OpenTelemetry (`serviceName: 'bff-message'`) : traces (span serveur nommé d'après la route, spans des handlers, appels amont avec `traceparent`) et métriques HTTP exportées en OTLP vers `OTEL_EXPORTER_OTLP_ENDPOINT`. La télémétrie reste désactivée si cette variable n'est pas définie ou si `OTEL_SDK_DISABLED=true`. Seuls la méthode, le statut, la route paramétrée et l'hôte amont sont exportés, jamais une URL, une query string, un en-tête, un identifiant ou une IP. `OTEL_SERVICE_NAME` et `OTEL_RESOURCE_ATTRIBUTES` permettent de compléter la configuration. (MAIR-504, [#181](https://github.com/mairie360/BFF_Message/pull/181))

#### Changements de comportement
- Le contrat OpenAPI (`contracts/openapi.json`, `contracts/bff.d.ts`) documente désormais, sur de nombreuses routes de messagerie, de contacts, de conversations, de pièces jointes et de profil, une réponse `429` (`ErrorResponse`) quand une limite de débit d'une API amont est atteinte : l'appelant doit réessayer après le délai indiqué par l'en-tête `Retry-After` (en secondes). `src/openapi-registry.ts` et les tests de mocks amont sont aussi modifiés. Le diff est tronqué : le détail exact des routes concernées n'est pas visible. (MAIR-568, [#213](https://github.com/mairie360/BFF_Message/pull/213))

#### Technique
- Alignement des contrats amont, en trois étapes :
  - Passage sur les versions prod (MAIR-568, [#213](https://github.com/mairie360/BFF_Message/pull/213)).
  - Retour sur les builds dev pour la release dev, avec régénération de `package-lock.json` (MAIR-575, [#223](https://github.com/mairie360/BFF_Message/pull/223)).
  - Alignement de `@mairie360/core-api-openapi` sur `0.0.0-staging.b900797` (MAIR-600, [#226](https://github.com/mairie360/BFF_Message/pull/226)).
  - Versions finales : `@mairie360/calendar-api-openapi` `0.0.0-dev-3b4668b`, `@mairie360/message-api-openapi` `0.0.0-dev-75d7650`, `@mairie360/project-api-openapi` `0.0.0-dev-be2b410`. Les images `core-api` et `message-api` des stacks de test docker-compose suivent ces versions.
- 7 commits CI et dépendances de développement :
  - Workflow `mairie360/CICD` passé de v4.2.0 à v4.3.2 ([#214](https://github.com/mairie360/BFF_Message/pull/214), [#217](https://github.com/mairie360/BFF_Message/pull/217), [#220](https://github.com/mairie360/BFF_Message/pull/220), [#224](https://github.com/mairie360/BFF_Message/pull/224)).
  - Transmission des secrets `ANTHROPIC_API_KEY`, `RELEASE_APP_ID` et `RELEASE_APP_PK` pour le journal des releases (MAIR-571, [#219](https://github.com/mairie360/BFF_Message/pull/219)).
  - Mises à jour de `ts-jest`, `eslint` et `typescript-eslint` ([#215](https://github.com/mairie360/BFF_Message/pull/215), [#216](https://github.com/mairie360/BFF_Message/pull/216), [#221](https://github.com/mairie360/BFF_Message/pull/221)).

## Historique des passages

<!-- release-journal-history:start -->
| Date | Environnement | Version | Commit | Run |
| --- | --- | --- | --- | --- |
| 2026-10-20 18:12 UTC | staging | — | `815c732` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39469831715) |
| 2026-10-20 17:56 UTC | dev | — | `815c732` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39469831715) |
| 2026-10-20 13:03 UTC | dev | — | `9cb0aa6` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39426618962) |
<!-- release-journal-history:end -->
