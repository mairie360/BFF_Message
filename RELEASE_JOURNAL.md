# Journal des releases — BFF_Message

<!-- release-journal-state {"dev": "0b7312e73c0f706ba5e69fc20be8292c5b08a21e", "prod": "bb90cbfd09358ba7868710dcac2972facd7d8c1b", "prod_tag": "v1.0.0", "staging": "815c7323097815c25416a17fb667b635af10c22c", "updated": {"dev": "2026-10-21 09:48 UTC", "staging": "2026-10-20 18:12 UTC"}} -->
> Tenu à jour par la CI (`mairie360/CICD`, action `release/release-journal`) à chaque passage en dev, staging et prod. Ne pas modifier à la main : le fichier est réécrit au passage suivant.

| Environnement | Version | Commit | Mis à jour |
| --- | --- | --- | --- |
| prod | v1.0.0 | `bb90cbf` | — |
| staging | — | `815c732` | 2026-10-20 18:12 UTC |
| dev | — | `0b7312e` | 2026-10-21 09:48 UTC |

## Ajouté sur main depuis la dernière release prod (v1.0.0)

#### Nouveautés
- Le contrat OpenAPI documente une réponse `429` (en-tête `Retry-After`) sur plusieurs routes de messagerie, contacts, conversations, pièces jointes et profil, lorsque la limite d'une API amont est atteinte. Le diff étant tronqué, la liste exacte des routes n'est pas vérifiée. (MAIR-568, [#213](https://github.com/mairie360/BFF_Message/pull/213))
- Télémétrie OpenTelemetry : traces et métriques HTTP exportées en OTLP vers `OTEL_EXPORTER_OTLP_ENDPOINT` lorsque cette variable est définie ; sans elle, rien n'est exporté. Seuls la méthode, le statut, la route paramétrée et l'hôte amont sortent du BFF. (MAIR-504, [#181](https://github.com/mairie360/BFF_Message/pull/181))

#### Technique
- Les paquets `@mairie360/*-openapi` et les images des stacks de test passent sur des versions prod (MAIR-568, MAIR-575, MAIR-600, MAIR-612) ; `follow-redirects` passe en 1.16.1 dans le lockfile (MAIR-494, [#229](https://github.com/mairie360/BFF_Message/pull/229)).
- CI : `cicd.yml` passe à mairie360/CICD v4.4.3, ne se déclenche plus que sur push vers `main`, et la promotion staging / prod se fait par les workflows manuels `promote-staging.yml` / `promote-prod.yml` (MAIR-494, MAIR-571, MAIR-612, [#219](https://github.com/mairie360/BFF_Message/pull/219), [#229](https://github.com/mairie360/BFF_Message/pull/229), [#232](https://github.com/mairie360/BFF_Message/pull/232)).
- Mises à jour de dépendances : `eslint`, `ts-jest`, `js-yaml`, `typescript-eslint`, et `mairie360/CICD` en v4.2.1, v4.2.2, v4.3.1, v4.3.2 (Renovate, [#214](https://github.com/mairie360/BFF_Message/pull/214), [#215](https://github.com/mairie360/BFF_Message/pull/215), [#216](https://github.com/mairie360/BFF_Message/pull/216), [#217](https://github.com/mairie360/BFF_Message/pull/217), [#220](https://github.com/mairie360/BFF_Message/pull/220), [#221](https://github.com/mairie360/BFF_Message/pull/221), [#224](https://github.com/mairie360/BFF_Message/pull/224)).
- Les secrets `ANTHROPIC_API_KEY`, `RELEASE_APP_ID` et `RELEASE_APP_PK` sont transmis au workflow CICD (MAIR-571, [#219](https://github.com/mairie360/BFF_Message/pull/219)).

## Différence dev → staging (en dev, pas encore en staging)

#### Technique
- Les paquets `@mairie360/*-openapi` et les images des stacks de test passent sur leurs versions prod (MAIR-612, [#232](https://github.com/mairie360/BFF_Message/pull/232)) ; `cicd.yml` passe à v4.4.3 et ne se déclenche plus que sur push vers `main`.
- Ajout des workflows `promote-staging.yml` et `promote-prod.yml` (déclenchement manuel) et de la section de promotion dans `CLAUDE.md`, avec `follow-redirects` 1.16.1 dans le lockfile (MAIR-494, [#229](https://github.com/mairie360/BFF_Message/pull/229)).

## Différence staging → prod (en staging, pas encore en prod)

#### Nouveautés
- Le contrat OpenAPI documente une réponse `429` (en-tête `Retry-After`) sur plusieurs routes de messagerie, contacts, conversations, pièces jointes et profil, lorsque la limite d'une API amont est atteinte. Le diff étant tronqué, la liste exacte des routes n'est pas vérifiée. (MAIR-568, [#213](https://github.com/mairie360/BFF_Message/pull/213))
- Télémétrie OpenTelemetry : traces et métriques HTTP exportées en OTLP vers `OTEL_EXPORTER_OTLP_ENDPOINT` lorsque cette variable est définie ; sans elle, rien n'est exporté. Seuls la méthode, le statut, la route paramétrée et l'hôte amont sortent du BFF. (MAIR-504, [#181](https://github.com/mairie360/BFF_Message/pull/181))

#### Technique
- Les paquets `@mairie360/*-openapi` et les images des stacks de test passent sur des versions prod ou staging (MAIR-568, MAIR-575, MAIR-600) ; `core-api-openapi` passe en `0.0.0-staging.b900797` (MAIR-600, [#226](https://github.com/mairie360/BFF_Message/pull/226)).
- Mises à jour de dépendances : `eslint`, `ts-jest`, `js-yaml`, `typescript-eslint`, et `mairie360/CICD` en v4.2.1, v4.2.2, v4.3.1, v4.3.2 (Renovate, [#214](https://github.com/mairie360/BFF_Message/pull/214), [#215](https://github.com/mairie360/BFF_Message/pull/215), [#216](https://github.com/mairie360/BFF_Message/pull/216), [#217](https://github.com/mairie360/BFF_Message/pull/217), [#220](https://github.com/mairie360/BFF_Message/pull/220), [#221](https://github.com/mairie360/BFF_Message/pull/221), [#224](https://github.com/mairie360/BFF_Message/pull/224)).
- Les secrets `ANTHROPIC_API_KEY`, `RELEASE_APP_ID` et `RELEASE_APP_PK` sont transmis au workflow CICD (MAIR-571, [#219](https://github.com/mairie360/BFF_Message/pull/219)).

## Historique des passages

<!-- release-journal-history:start -->
| Date | Environnement | Version | Commit | Run |
| --- | --- | --- | --- | --- |
| 2026-10-21 09:48 UTC | dev | — | `0b7312e` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39579045408) |
| 2026-10-21 03:24 UTC | dev | — | `70d82e6` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39538113195) |
| 2026-10-20 18:12 UTC | staging | — | `815c732` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39469831715) |
| 2026-10-20 17:56 UTC | dev | — | `815c732` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39469831715) |
| 2026-10-20 13:03 UTC | dev | — | `9cb0aa6` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39426618962) |
<!-- release-journal-history:end -->
