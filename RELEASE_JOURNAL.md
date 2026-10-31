# Journal des releases — BFF_Message

<!-- release-journal-state {"dev": "4dcec6e6cec8575124f282eeb59ca4ec06ba6fdb", "prod": "0b7312e73c0f706ba5e69fc20be8292c5b08a21e", "prod_tag": "v1.1.0", "staging": "0b7312e73c0f706ba5e69fc20be8292c5b08a21e", "updated": {"dev": "2026-10-23 12:22 UTC", "prod": "2026-10-21 10:10 UTC", "staging": "2026-10-21 09:55 UTC"}} -->
> Tenu à jour par la CI (`mairie360/CICD`, action `release/release-journal`) à chaque passage en dev, staging et prod. Ne pas modifier à la main : le fichier est réécrit au passage suivant.

| Environnement | Version | Commit | Mis à jour |
| --- | --- | --- | --- |
| prod | v1.1.0 | `0b7312e` | 2026-10-21 10:10 UTC |
| staging | — | `0b7312e` | 2026-10-21 09:55 UTC |
| dev | — | `4dcec6e` | 2026-10-23 12:22 UTC |

## Ajouté sur main depuis la dernière release prod (v1.1.0)

#### Changements de comportement

- Le conteneur de développement (`development.Dockerfile`) tourne désormais sous l'utilisateur non-root `node`, et `/app` lui appartient. (PR [#235](https://github.com/mairie360/BFF_Message/pull/235))

#### Technique

- Node.js passe au runtime patché `24.22.1-alpine`, épinglé par digest dans `Dockerfile` et `development.Dockerfile`. Les versions CI et du job de contrats sont alignées sur 24.22.1, en réponse à l'avis de sécurité d'octobre 2026. (PR [#235](https://github.com/mairie360/BFF_Message/pull/235))
- Ajout de la suite d'intégration sur stack réelle : `docker-compose-integration.yml`, `integration_test.sh`, collection newman dans `tests/postman/` et test jest de couverture de cette collection. Elle devient la porte `integration_tests` de la promotion staging. Mise à jour de `mairie360/CICD` de v4.4.3 à v4.5.0 dans `cicd.yml`, `promote-staging.yml` et `promote-prod.yml`. (MAIR-262, [#234](https://github.com/mairie360/BFF_Message/pull/234))

## Différence dev → staging (en dev, pas encore en staging)

#### Changements de comportement

- Le conteneur de développement (`development.Dockerfile`) tourne désormais sous l'utilisateur non-root `node`, et `/app` lui appartient. (PR [#235](https://github.com/mairie360/BFF_Message/pull/235))

#### Technique

- Node.js passe au runtime patché `24.22.1-alpine`, épinglé par digest dans `Dockerfile` et `development.Dockerfile`. Les versions CI et du job de contrats sont alignées sur 24.22.1, en réponse à l'avis de sécurité d'octobre 2026. (PR [#235](https://github.com/mairie360/BFF_Message/pull/235))
- Ajout de la suite d'intégration sur stack réelle : `docker-compose-integration.yml`, `integration_test.sh`, collection newman dans `tests/postman/` et test jest de couverture de cette collection. Elle devient la porte `integration_tests` de la promotion staging. Mise à jour de `mairie360/CICD` de v4.4.3 à v4.5.0 dans `cicd.yml`, `promote-staging.yml` et `promote-prod.yml`. (MAIR-262, [#234](https://github.com/mairie360/BFF_Message/pull/234))

## Différence staging → prod (en staging, pas encore en prod)

_Rien._

## Historique des passages

<!-- release-journal-history:start -->
| Date | Environnement | Version | Commit | Run |
| --- | --- | --- | --- | --- |
| 2026-10-23 12:22 UTC | dev | — | `4dcec6e` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39952374514) |
| 2026-10-22 09:00 UTC | dev | — | `65fd970` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39751706870) |
| 2026-10-21 10:10 UTC | prod | v1.1.0 | `0b7312e` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39580917014) |
| 2026-10-21 09:55 UTC | staging | — | `0b7312e` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39579879428) |
| 2026-10-21 09:48 UTC | dev | — | `0b7312e` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39579045408) |
| 2026-10-21 03:24 UTC | dev | — | `70d82e6` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39538113195) |
| 2026-10-20 18:12 UTC | staging | — | `815c732` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39469831715) |
| 2026-10-20 17:56 UTC | dev | — | `815c732` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39469831715) |
| 2026-10-20 13:03 UTC | dev | — | `9cb0aa6` | [run](https://github.com/mairie360/BFF_Message/actions/runs/39426618962) |
<!-- release-journal-history:end -->
