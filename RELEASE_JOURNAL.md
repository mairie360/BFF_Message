# Journal des releases — BFF_Message

<!-- release-journal-state {"dev": "70d82e6280617a2eb23bfd64f173acb56efc0597", "prod": "bb90cbfd09358ba7868710dcac2972facd7d8c1b", "prod_tag": "v1.0.0", "staging": "815c7323097815c25416a17fb667b635af10c22c", "updated": {"dev": "2026-10-21 03:24 UTC", "staging": "2026-10-20 18:12 UTC"}} -->
> Tenu à jour par la CI (`mairie360/CICD`, action `release/release-journal`) à chaque passage en dev, staging et prod. Ne pas modifier à la main : le fichier est réécrit au passage suivant.

| Environnement | Version | Commit | Mis à jour |
| --- | --- | --- | --- |
| prod | v1.0.0 | `bb90cbf` | — |
| staging | — | `815c732` | 2026-10-20 18:12 UTC |
| dev | — | `70d82e6` | 2026-10-21 03:24 UTC |

## Ajouté sur main depuis la dernière release prod (v1.0.0)

#### Nouveautés
- Le BFF exporte des traces et des métriques HTTP en OTLP vers `OTEL_EXPORTER_OTLP_ENDPOINT` lorsque cette variable est définie ; sans elle, la télémétrie reste désactivée. Seuls la méthode, le statut, la route paramétrée et l'hôte appelé sont exportés, jamais l'URL, la query string, les en-têtes, les identifiants ou l'IP. (MAIR-504, [#181](https://github.com/mairie360/BFF_Message/pull/181))
- Le contrat OpenAPI documente une réponse `429` (délai indiqué par l'en-tête `Retry-After`) sur plusieurs routes de messagerie, contacts, conversations, pièces jointes et profil. (MAIR-568, [#213](https://github.com/mairie360/BFF_Message/pull/213))

#### Technique
- Les `@mairie360/*-openapi` passent des builds `0.0.0-dev` aux versions prod (calendar 1.1.0, core-api 2.1.0, message-api 2.0.0, project-api 1.1.0), avec des fixtures de test mises à jour (`role` requis sur `DirectoryUser`, `todo` et `review` dans `ProjectStatusCountsView`). Les images des stacks de test sont alignées d'abord sur des builds dev, puis sur le build staging de core-api. (MAIR-568 [#213](https://github.com/mairie360/BFF_Message/pull/213), MAIR-575 [#223](https://github.com/mairie360/BFF_Message/pull/223), MAIR-600 [#226](https://github.com/mairie360/BFF_Message/pull/226))
- Le lockfile est régénéré pour que `npm ci` repasse après la mise à jour de typescript-eslint ; eslint 10.13.0, ts-jest 29.4.15 et typescript-eslint 8.72.0 sont mis à jour. (MAIR-575 [#223](https://github.com/mairie360/BFF_Message/pull/223), [#215](https://github.com/mairie360/BFF_Message/pull/215), [#216](https://github.com/mairie360/BFF_Message/pull/216), [#221](https://github.com/mairie360/BFF_Message/pull/221))
- `cicd.yml` passe de mairie360/CICD v4.2.0 à v4.3.2 (plusieurs PR Renovate, [#214](https://github.com/mairie360/BFF_Message/pull/214), [#217](https://github.com/mairie360/BFF_Message/pull/217), [#220](https://github.com/mairie360/BFF_Message/pull/220), [#224](https://github.com/mairie360/BFF_Message/pull/224)). Le workflow transmet désormais `ANTHROPIC_API_KEY`, `RELEASE_APP_ID` et `RELEASE_APP_PK` pour le journal des releases. (MAIR-571, [#219](https://github.com/mairie360/BFF_Message/pull/219))
- Les workflows `promote-staging.yml` et `promote-prod.yml` remplacent la promotion automatique : un push sur `main` s'arrête à `release-dev`, et staging puis prod se lancent à la main. (MAIR-494, [#229](https://github.com/mairie360/BFF_Message/pull/229))

## Différence dev → staging (en dev, pas encore en staging)

#### Technique
- Un push sur `main` ne déclenche plus que `release-dev` : staging et prod passent par les workflows manuels `promote-staging.yml` et `promote-prod.yml` (option `-f sha=` pour un commit donné). `cicd.yml` passe à mairie360/CICD v4.4.0, et Renovate couvre les trois workflows. (MAIR-494, [#229](https://github.com/mairie360/BFF_Message/pull/229))
- Documentation mise à jour (`CLAUDE.md`, `docs/fr/technical.md`, `docs/en/technical.md`) pour décrire la promotion.

## Différence staging → prod (en staging, pas encore en prod)

#### Nouveautés
- Le BFF exporte des traces et des métriques HTTP en OTLP vers `OTEL_EXPORTER_OTLP_ENDPOINT` lorsque cette variable est définie ; sans elle, la télémétrie reste désactivée. Seuls la méthode, le statut, la route paramétrée et l'hôte appelé sont exportés. (MAIR-504, [#181](https://github.com/mairie360/BFF_Message/pull/181))
- Le contrat OpenAPI documente une réponse `429` (délai indiqué par l'en-tête `Retry-After`) sur plusieurs routes de messagerie, contacts, conversations, pièces jointes et profil. (MAIR-568, [#213](https://github.com/mairie360/BFF_Message/pull/213))

#### Technique
- Les `@mairie360/*-openapi` passent des builds `0.0.0-dev` aux versions prod (calendar 1.1.0, core-api 2.1.0, message-api 2.0.0, project-api 1.1.0), avec des fixtures de test mises à jour (`role` requis sur `DirectoryUser`, `todo` et `review` dans `ProjectStatusCountsView`). Les images des stacks de test sont alignées sur des builds dev, puis sur le build staging de core-api. (MAIR-568 [#213](https://github.com/mairie360/BFF_Message/pull/213), MAIR-575 [#223](https://github.com/mairie360/BFF_Message/pull/223), MAIR-600 [#226](https://github.com/mairie360/BFF_Message/pull/226))
- Le lockfile est régénéré pour que `npm ci` repasse ; eslint 10.13.0, ts-jest 29.4.15 et typescript-eslint 8.72.0 sont mis à jour. (MAIR-575 [#223](https://github.com/mairie360/BFF_Message/pull/223), [#215](https://github.com/mairie360/BFF_Message/pull/215), [#216](https://github.com/mairie360/BFF_Message/pull/216), [#221](https://github.com/mairie360/BFF_Message/pull/221))
- `cicd.yml` passe de mairie360/CICD v4.2.0 à v4.3.2 (plusieurs PR Renovate, [#214](https://github.com/mairie360/BFF_Message/pull/214), [#217](https://github.com/mairie360/BFF_Message/pull/217), [#220](https://github.com/mairie360/BFF_Message/pull/220), [#224](https://github.com/mairie360/BFF_Message/pull/224)). Le workflow transmet désormais `ANTHROPIC_API_KEY`, `RELEASE_APP_ID` et `RELEASE_APP_PK` pour le journal des releases. (MAIR-571, [#219](https://github.com/mairie360/BFF_Message/pull/219))

## Historique des passages

<!-- release-journal-history:start -->
| Date | Environnement | Version | Commit | Run |
| --- | --- | --- | --- | --- |
| 2026-10-21 03:24 UTC | dev | — | `70d82e6` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39538113195) |
| 2026-10-20 18:12 UTC | staging | — | `815c732` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39469831715) |
| 2026-10-20 17:56 UTC | dev | — | `815c732` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39469831715) |
| 2026-10-20 13:03 UTC | dev | — | `9cb0aa6` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39426618962) |
<!-- release-journal-history:end -->
