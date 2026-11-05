# Journal des releases — BFF_Message

<!-- release-journal-state {"dev": "cc37b49e68f7d3aab907787284232397ed588559", "prod": "0b7312e73c0f706ba5e69fc20be8292c5b08a21e", "prod_tag": "v1.1.0", "staging": "0b7312e73c0f706ba5e69fc20be8292c5b08a21e", "updated": {"dev": "2026-11-05 03:40 UTC", "prod": "2026-10-21 10:10 UTC", "staging": "2026-10-21 09:55 UTC"}} -->
> Tenu à jour par la CI (`mairie360/CICD`, action `release/release-journal`) à chaque passage en dev, staging et prod. Ne pas modifier à la main : le fichier est réécrit au passage suivant.

| Environnement | Version | Commit | Mis à jour |
| --- | --- | --- | --- |
| prod | v1.1.0 | `0b7312e` | 2026-10-21 10:10 UTC |
| staging | — | `0b7312e` | 2026-10-21 09:55 UTC |
| dev | — | `cc37b49` | 2026-11-05 03:40 UTC |

## Ajouté sur main depuis la dernière release prod (v1.1.0)

#### Changements de comportement
- `POST /direct-messages` et les routes de conversation : le champ `message.conversationId` est désormais l'identifiant public de la conversation (`conversation-<n>`, égal à `conversation.id`), et non plus le nombre renvoyé par Message API (avant : `21`, maintenant : `conversation-21`). Un appelant qui lisait un nombre doit accepter la chaîne. (MAIR-603, [#250](https://github.com/mairie360/BFF_Message/pull/250))
- Sessions (MAIR-680) : le BFF vérifie désormais les jetons avec la clé publique Ed25519 de Core (`JWT_PUBLIC_KEY`, EdDSA sous le `kid` de Core, avec `iss` et `aud`). Les jetons HS256 ne sont acceptés que tant que `JWT_SECRET` est défini (transition). Le BFF refuse de démarrer sans `JWT_PUBLIC_KEY` ou avec une clé mal formée. (MAIR-680, [#246](https://github.com/mairie360/BFF_Message/pull/246))

#### Corrections
- Messagerie directe : avant, après un `201` de `POST /direct-messages`, le front affichait « La création du message direct n'a pas été confirmée. », car l'identifiant de conversation d'un message ne correspondait pas à `conversation.id`. Maintenant, les messages renvoyés par `POST /direct-messages`, `GET /conversations/{id}` et `POST /conversations/{id}/messages` portent toujours l'identifiant public de leur conversation, quelle que soit la forme de l'identifiant envoyée par le client. (MAIR-603, [#250](https://github.com/mairie360/BFF_Message/pull/250))

#### Technique
- Tests d'intégration newman sur une stack réelle (`integration_test.sh`, collection Postman, job `integration_tests` de la promotion staging) : MAIR-262, [#234](https://github.com/mairie360/BFF_Message/pull/234). Tests de non-régression de MAIR-603 ajoutés à la collection et aux tests unitaires, [#250](https://github.com/mairie360/BFF_Message/pull/250).
- Outils RGPD : test du marqueur de logs (MAIR-290, [#175](https://github.com/mairie360/BFF_Message/pull/175)), checklist RGPD des PR (MAIR-295, [#179](https://github.com/mairie360/BFF_Message/pull/179)), simulation d'usage (MAIR-497, [#245](https://github.com/mairie360/BFF_Message/pull/245)). Aucun effet sur les routes.
- Dépendances et CI : images et actions épinglées par digest ([#241](https://github.com/mairie360/BFF_Message/pull/241), [#248](https://github.com/mairie360/BFF_Message/pull/248)), workflows sur mairie360/CICD v5.2.2 puis v5.3.1 ([#243](https://github.com/mairie360/BFF_Message/pull/243), [#245](https://github.com/mairie360/BFF_Message/pull/245)), Node.js 24.22.1 dans les Dockerfile, et conteneur de développement exécuté par l'utilisateur `node` ([#235](https://github.com/mairie360/BFF_Message/pull/235)).

## Différence dev → staging (en dev, pas encore en staging)

#### Changements de comportement
- `POST /direct-messages` et les routes de conversation : le champ `message.conversationId` est désormais l'identifiant public de la conversation (`conversation-<n>`, égal à `conversation.id`), et non plus le nombre renvoyé par Message API (avant : `21`, maintenant : `conversation-21`). Un appelant qui lisait un nombre doit accepter la chaîne. (MAIR-603, [#250](https://github.com/mairie360/BFF_Message/pull/250))
- Sessions (MAIR-680) : le BFF vérifie désormais les jetons avec la clé publique Ed25519 de Core (`JWT_PUBLIC_KEY`, EdDSA sous le `kid` de Core, avec `iss` et `aud`). Les jetons HS256 ne sont acceptés que tant que `JWT_SECRET` est défini (transition). Le BFF refuse de démarrer sans `JWT_PUBLIC_KEY` ou avec une clé mal formée. (MAIR-680, [#246](https://github.com/mairie360/BFF_Message/pull/246))

#### Corrections
- Messagerie directe : avant, après un `201` de `POST /direct-messages`, le front affichait « La création du message direct n'a pas été confirmée. », car l'identifiant de conversation d'un message ne correspondait pas à `conversation.id`. Maintenant, les messages renvoyés par `POST /direct-messages`, `GET /conversations/{id}` et `POST /conversations/{id}/messages` portent toujours l'identifiant public de leur conversation, quelle que soit la forme de l'identifiant envoyée par le client. (MAIR-603, [#250](https://github.com/mairie360/BFF_Message/pull/250))

#### Technique
- Tests d'intégration newman sur une stack réelle (`integration_test.sh`, collection Postman, job `integration_tests` de la promotion staging) : MAIR-262, [#234](https://github.com/mairie360/BFF_Message/pull/234). Tests de non-régression de MAIR-603 ajoutés à la collection et aux tests unitaires, [#250](https://github.com/mairie360/BFF_Message/pull/250).
- Outils RGPD : test du marqueur de logs (MAIR-290, [#175](https://github.com/mairie360/BFF_Message/pull/175)), checklist RGPD des PR (MAIR-295, [#179](https://github.com/mairie360/BFF_Message/pull/179)), simulation d'usage (MAIR-497, [#245](https://github.com/mairie360/BFF_Message/pull/245)). Aucun effet sur les routes.
- Dépendances et CI : images et actions épinglées par digest ([#241](https://github.com/mairie360/BFF_Message/pull/241), [#248](https://github.com/mairie360/BFF_Message/pull/248)), workflows sur mairie360/CICD v5.2.2 puis v5.3.1 ([#243](https://github.com/mairie360/BFF_Message/pull/243), [#245](https://github.com/mairie360/BFF_Message/pull/245)), Node.js 24.22.1 dans les Dockerfile, et conteneur de développement exécuté par l'utilisateur `node` ([#235](https://github.com/mairie360/BFF_Message/pull/235)).

## Différence staging → prod (en staging, pas encore en prod)

_Rien._

## Historique des passages

<!-- release-journal-history:start -->
| Date | Environnement | Version | Commit | Run |
| --- | --- | --- | --- | --- |
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
