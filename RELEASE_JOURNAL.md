# Journal des releases — BFF_Message

<!-- release-journal-state {"dev": "65fd970d08915d9041ec087831790329a2411f57", "prod": "0b7312e73c0f706ba5e69fc20be8292c5b08a21e", "prod_tag": "v1.1.0", "staging": "0b7312e73c0f706ba5e69fc20be8292c5b08a21e", "updated": {"dev": "2026-10-22 09:00 UTC", "prod": "2026-10-21 10:10 UTC", "staging": "2026-10-21 09:55 UTC"}} -->
> Tenu à jour par la CI (`mairie360/CICD`, action `release/release-journal`) à chaque passage en dev, staging et prod. Ne pas modifier à la main : le fichier est réécrit au passage suivant.

| Environnement | Version | Commit | Mis à jour |
| --- | --- | --- | --- |
| prod | v1.1.0 | `0b7312e` | 2026-10-21 10:10 UTC |
| staging | — | `0b7312e` | 2026-10-21 09:55 UTC |
| dev | — | `65fd970` | 2026-10-22 09:00 UTC |

## Ajouté sur main depuis la dernière release prod (v1.1.0)

#### Technique
- Ajout de tests d'intégration sur la vraie stack (`docker-compose-integration.yml`, `integration_test.sh`, collection Postman rejouée par newman dans `tests/postman/`, garde-fou jest `tests/integration-collection.test.ts`). Le job `integration_tests` de la promotion staging est actif une fois cette release épinglée par `promote-staging.yml`. (MAIR-262, [#234](https://github.com/mairie360/BFF_Message/pull/234))
- Passage des workflows `cicd.yml`, `promote-staging.yml` et `promote-prod.yml` sur mairie360/CICD v4.5.0, mise à jour de `CLAUDE.md` et des docs, et ignore de `newman-reports/`.

## Différence dev → staging (en dev, pas encore en staging)

#### Technique
- Ajout de tests d'intégration sur la vraie stack (`docker-compose-integration.yml`, `integration_test.sh`, collection Postman rejouée par newman dans `tests/postman/`, garde-fou jest `tests/integration-collection.test.ts`). Le job `integration_tests` de la promotion staging est actif une fois cette release épinglée par `promote-staging.yml`. (MAIR-262, [#234](https://github.com/mairie360/BFF_Message/pull/234))
- Passage des workflows `cicd.yml`, `promote-staging.yml` et `promote-prod.yml` sur mairie360/CICD v4.5.0, mise à jour de `CLAUDE.md` et des docs, et ignore de `newman-reports/`.

## Différence staging → prod (en staging, pas encore en prod)

_Rien._

## Historique des passages

<!-- release-journal-history:start -->
| Date | Environnement | Version | Commit | Run |
| --- | --- | --- | --- | --- |
| 2026-10-22 09:00 UTC | dev | — | `65fd970` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39751706870) |
| 2026-10-21 10:10 UTC | prod | v1.1.0 | `0b7312e` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39580917014) |
| 2026-10-21 09:55 UTC | staging | — | `0b7312e` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39579879428) |
| 2026-10-21 09:48 UTC | dev | — | `0b7312e` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39579045408) |
| 2026-10-21 03:24 UTC | dev | — | `70d82e6` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39538113195) |
| 2026-10-20 18:12 UTC | staging | — | `815c732` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39469831715) |
| 2026-10-20 17:56 UTC | dev | — | `815c732` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39469831715) |
| 2026-10-20 13:03 UTC | dev | — | `9cb0aa6` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39426618962) |
<!-- release-journal-history:end -->
