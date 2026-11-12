# Journal des releases — BFF_Message

<!-- release-journal-state {"dev": "8908c7867027493ad6205ad24d4de4374041ba04", "prod": "0b7312e73c0f706ba5e69fc20be8292c5b08a21e", "prod_tag": "v1.1.0", "staging": "8908c7867027493ad6205ad24d4de4374041ba04", "updated": {"dev": "2026-11-12 13:17 UTC", "prod": "2026-10-21 10:10 UTC", "staging": "2026-11-12 18:59 UTC"}} -->
> Tenu à jour par la CI (`mairie360/CICD`, action `release/release-journal`) à chaque passage en dev, staging et prod. Ne pas modifier à la main : le fichier est réécrit au passage suivant.

| Environnement | Version | Commit | Mis à jour |
| --- | --- | --- | --- |
| prod | v1.1.0 | `0b7312e` | 2026-10-21 10:10 UTC |
| staging | — | `8908c78` | 2026-11-12 18:59 UTC |
| dev | — | `8908c78` | 2026-11-12 13:17 UTC |

## Ajouté sur main depuis la dernière release prod (v1.1.0)

- fix(deps): MAIR-816 Release dev: align internal versions and deploy (#254) ([#254](https://github.com/mairie360/BFF_Message/pull/254))
- chore(deps): pin node.js to c86ecea (#248) ([#248](https://github.com/mairie360/BFF_Message/pull/248))
- fix: MAIR-603 E2E - Parcours utilisateurs Playwright des fronts (#250) ([#250](https://github.com/mairie360/BFF_Message/pull/250))
- feat: MAIR-497 GDPR - Usage simulation and AI review of logs and database before prod ([#245](https://github.com/mairie360/BFF_Message/pull/245))
- fix: MAIR-680 [Audit 23/10] Toutes les APIs et BFFs : remplacer le secret JWT HS256 partagé par 12 services (A1) ([#246](https://github.com/mairie360/BFF_Message/pull/246))
- chore(deps): pin dependencies (#241) ([#241](https://github.com/mairie360/BFF_Message/pull/241))
- ci: MAIR-771 APIs, BFFs, Database : monter CICD en v5.2.2 pour activer les contrôles RGPD (#243) ([#243](https://github.com/mairie360/BFF_Message/pull/243))
- fix: MAIR-290 Détecter les données personnelles dans les journaux avec un test du marqueur (#175) ([#175](https://github.com/mairie360/BFF_Message/pull/175))
- ci: MAIR-295 Ajouter une checklist RGPD aux PR et des rappels d'échéances automatiques (#179) ([#179](https://github.com/mairie360/BFF_Message/pull/179))
- fix(security): patch Node.js runtime and toolchain (#235) ([#235](https://github.com/mairie360/BFF_Message/pull/235))
- feat: MAIR-262 Tests d'intégration - Tests de fonctionnement des APIs, tests métier des BFFs et tests de régression (#234) ([#234](https://github.com/mairie360/BFF_Message/pull/234))

## Différence dev → staging (en dev, pas encore en staging)

_Rien._

## Différence staging → prod (en staging, pas encore en prod)

- fix(deps): MAIR-816 Release dev: align internal versions and deploy (#254) ([#254](https://github.com/mairie360/BFF_Message/pull/254))
- chore(deps): pin node.js to c86ecea (#248) ([#248](https://github.com/mairie360/BFF_Message/pull/248))
- fix: MAIR-603 E2E - Parcours utilisateurs Playwright des fronts (#250) ([#250](https://github.com/mairie360/BFF_Message/pull/250))
- feat: MAIR-497 GDPR - Usage simulation and AI review of logs and database before prod ([#245](https://github.com/mairie360/BFF_Message/pull/245))
- fix: MAIR-680 [Audit 23/10] Toutes les APIs et BFFs : remplacer le secret JWT HS256 partagé par 12 services (A1) ([#246](https://github.com/mairie360/BFF_Message/pull/246))
- chore(deps): pin dependencies (#241) ([#241](https://github.com/mairie360/BFF_Message/pull/241))
- ci: MAIR-771 APIs, BFFs, Database : monter CICD en v5.2.2 pour activer les contrôles RGPD (#243) ([#243](https://github.com/mairie360/BFF_Message/pull/243))
- fix: MAIR-290 Détecter les données personnelles dans les journaux avec un test du marqueur (#175) ([#175](https://github.com/mairie360/BFF_Message/pull/175))
- ci: MAIR-295 Ajouter une checklist RGPD aux PR et des rappels d'échéances automatiques (#179) ([#179](https://github.com/mairie360/BFF_Message/pull/179))
- fix(security): patch Node.js runtime and toolchain (#235) ([#235](https://github.com/mairie360/BFF_Message/pull/235))
- feat: MAIR-262 Tests d'intégration - Tests de fonctionnement des APIs, tests métier des BFFs et tests de régression (#234) ([#234](https://github.com/mairie360/BFF_Message/pull/234))

> Résumé Claude indisponible pour ce passage : listes brutes des commits.

## Historique des passages

<!-- release-journal-history:start -->
| Date | Environnement | Version | Commit | Run |
| --- | --- | --- | --- | --- |
| 2026-11-12 18:59 UTC | staging | — | `8908c78` | [run](https://github.com/mairie360/BFF_Message/actions/runs/43284356758) |
| 2026-11-12 13:17 UTC | dev | — | `8908c78` | [run](https://github.com/mairie360/BFF_Message/actions/runs/43225068437) |
| 2026-11-05 03:40 UTC | dev | — | `cc37b49` | [run](https://github.com/mairie360/BFF_Message/actions/runs/41962690603) |
| 2026-11-04 21:34 UTC | dev | — | `cdd75eb` | [run](https://github.com/mairie360/BFF_Message/actions/runs/41915754364) |
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
