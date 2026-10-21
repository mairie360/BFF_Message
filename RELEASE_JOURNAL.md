# Journal des releases — BFF_Message

<!-- release-journal-state {"dev": "0b7312e73c0f706ba5e69fc20be8292c5b08a21e", "prod": "bb90cbfd09358ba7868710dcac2972facd7d8c1b", "prod_tag": "v1.0.0", "staging": "0b7312e73c0f706ba5e69fc20be8292c5b08a21e", "updated": {"dev": "2026-10-21 09:48 UTC", "staging": "2026-10-21 09:55 UTC"}} -->
> Tenu à jour par la CI (`mairie360/CICD`, action `release/release-journal`) à chaque passage en dev, staging et prod. Ne pas modifier à la main : le fichier est réécrit au passage suivant.

| Environnement | Version | Commit | Mis à jour |
| --- | --- | --- | --- |
| prod | v1.0.0 | `bb90cbf` | — |
| staging | — | `0b7312e` | 2026-10-21 09:55 UTC |
| dev | — | `0b7312e` | 2026-10-21 09:48 UTC |

## Ajouté sur main depuis la dernière release prod (v1.0.0)

#### Nouveautés
- Les traces et les métriques HTTP sont exportées en OTLP vers `OTEL_EXPORTER_OTLP_ENDPOINT` quand cette variable est définie ; sans elle, la télémétrie reste désactivée. Seuls la méthode, le statut, la route paramétrée et l'hôte appelé quittent le BFF, jamais une URL, une query string, un en-tête, un identifiant ou une IP. (MAIR-504, [#181](https://github.com/mairie360/BFF_Message/pull/181))
- Le contrat OpenAPI (`contracts/openapi.json`) documente désormais une réponse `429` avec l'en-tête `Retry-After` sur plusieurs routes qui appellent les APIs amont. Le diff est tronqué : seule la documentation est confirmée, le comportement à l'exécution n'a pas été vérifié. (MAIR-568, [#213](https://github.com/mairie360/BFF_Message/pull/213))

#### Technique
- Les paquets `@mairie360/*-openapi` passent de builds `0.0.0-dev` ou staging à leurs versions prod (calendar 1.2.0, core 2.2.0, message 2.1.0, project 1.2.0), et les stacks de test pointent sur les images prod (database 3.3.0, core-api 2.2.0, message-api 2.1.0). (MAIR-612, [#232](https://github.com/mairie360/BFF_Message/pull/232) ; MAIR-575, [#223](https://github.com/mairie360/BFF_Message/pull/223) ; MAIR-600, [#226](https://github.com/mairie360/BFF_Message/pull/226))
- La CI passe sur mairie360/CICD v4.4.3 : `cicd.yml` ne se lance sur push que pour `main`, la promotion staging et prod devient manuelle via `promote-staging.yml` et `promote-prod.yml` (MAIR-494, [#229](https://github.com/mairie360/BFF_Message/pull/229)), et les secrets de release sont transmis au workflow réutilisable (MAIR-571, [#219](https://github.com/mairie360/BFF_Message/pull/219)).
- Mises à jour de dépendances de maintenance : CICD v4.2.1 à v4.3.2 (Renovate), eslint, ts-jest, typescript-eslint, js-yaml, et `follow-redirects` 1.16.1 dans le lockfile (GHSA corrigées).

## Différence dev → staging (en dev, pas encore en staging)

_Rien._

## Différence staging → prod (en staging, pas encore en prod)

#### Nouveautés
- Les traces et les métriques HTTP sont exportées en OTLP vers `OTEL_EXPORTER_OTLP_ENDPOINT` quand cette variable est définie ; sans elle, la télémétrie reste désactivée. Seuls la méthode, le statut, la route paramétrée et l'hôte appelé quittent le BFF, jamais une URL, une query string, un en-tête, un identifiant ou une IP. (MAIR-504, [#181](https://github.com/mairie360/BFF_Message/pull/181))
- Le contrat OpenAPI (`contracts/openapi.json`) documente désormais une réponse `429` avec l'en-tête `Retry-After` sur plusieurs routes qui appellent les APIs amont. Le diff est tronqué : seule la documentation est confirmée, le comportement à l'exécution n'a pas été vérifié. (MAIR-568, [#213](https://github.com/mairie360/BFF_Message/pull/213))

#### Technique
- Les paquets `@mairie360/*-openapi` passent de builds `0.0.0-dev` ou staging à leurs versions prod (calendar 1.2.0, core 2.2.0, message 2.1.0, project 1.2.0), et les stacks de test pointent sur les images prod (database 3.3.0, core-api 2.2.0, message-api 2.1.0). (MAIR-612, [#232](https://github.com/mairie360/BFF_Message/pull/232) ; MAIR-575, [#223](https://github.com/mairie360/BFF_Message/pull/223) ; MAIR-600, [#226](https://github.com/mairie360/BFF_Message/pull/226))
- La CI passe sur mairie360/CICD v4.4.3 : `cicd.yml` ne se lance sur push que pour `main`, la promotion staging et prod devient manuelle via `promote-staging.yml` et `promote-prod.yml` (MAIR-494, [#229](https://github.com/mairie360/BFF_Message/pull/229)), et les secrets de release sont transmis au workflow réutilisable (MAIR-571, [#219](https://github.com/mairie360/BFF_Message/pull/219)).
- Mises à jour de dépendances de maintenance : CICD v4.2.1 à v4.3.2 (Renovate), eslint, ts-jest, typescript-eslint, js-yaml, et `follow-redirects` 1.16.1 dans le lockfile (GHSA corrigées).

## Historique des passages

<!-- release-journal-history:start -->
| Date | Environnement | Version | Commit | Run |
| --- | --- | --- | --- | --- |
| 2026-10-21 09:55 UTC | staging | — | `0b7312e` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39579879428) |
| 2026-10-21 09:48 UTC | dev | — | `0b7312e` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39579045408) |
| 2026-10-21 03:24 UTC | dev | — | `70d82e6` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39538113195) |
| 2026-10-20 18:12 UTC | staging | — | `815c732` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39469831715) |
| 2026-10-20 17:56 UTC | dev | — | `815c732` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39469831715) |
| 2026-10-20 13:03 UTC | dev | — | `9cb0aa6` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39426618962) |
<!-- release-journal-history:end -->
