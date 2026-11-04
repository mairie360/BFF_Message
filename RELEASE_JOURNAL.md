# Journal des releases — BFF_Message

<!-- release-journal-state {"dev": "cdd75eb85250a7be00bbbedd5ca9bfa7744e9263", "prod": "0b7312e73c0f706ba5e69fc20be8292c5b08a21e", "prod_tag": "v1.1.0", "staging": "0b7312e73c0f706ba5e69fc20be8292c5b08a21e", "updated": {"dev": "2026-11-04 21:34 UTC", "prod": "2026-10-21 10:10 UTC", "staging": "2026-10-21 09:55 UTC"}} -->
> Tenu à jour par la CI (`mairie360/CICD`, action `release/release-journal`) à chaque passage en dev, staging et prod. Ne pas modifier à la main : le fichier est réécrit au passage suivant.

| Environnement | Version | Commit | Mis à jour |
| --- | --- | --- | --- |
| prod | v1.1.0 | `0b7312e` | 2026-10-21 10:10 UTC |
| staging | — | `0b7312e` | 2026-10-21 09:55 UTC |
| dev | — | `cdd75eb` | 2026-11-04 21:34 UTC |

## Ajouté sur main depuis la dernière release prod (v1.1.0)

#### Changements de comportement
- Les sessions sont vérifiées avec la clé publique Ed25519 de Core (`JWT_PUBLIC_KEY`, EdDSA sous le `kid` de Core, contrôles `iss` et `aud`) au lieu du secret HS256 partagé. Un jeton HS256 reçoit 401 avant tout appel amont, sauf tant que `JWT_SECRET` reste défini (phase de transition). Un appelant qui signait ses jetons avec l'ancien secret doit passer à des jetons EdDSA. Le BFF refuse de démarrer sans `JWT_PUBLIC_KEY` ou avec une clé mal formée. (MAIR-680, [#246](https://github.com/mairie360/BFF_Message/pull/246))

#### Corrections
- Les messages d'une conversation portent désormais l'identifiant public de leur conversation, égal à `conversation.id` (`conversation-<n>`), quelle que soit la forme d'identifiant envoyée par le client. Avant : `POST /direct-messages` renvoyait `conversation.id` = `conversation-<n>` avec `message.conversationId` = `<n>` numérique, et le Messages front affichait « La création du message direct n'a pas été confirmée. » après un 201. Maintenant : les deux valeurs sont identiques. Le type de `message.conversationId` passe d'un nombre à une chaîne. (MAIR-603, [#250](https://github.com/mairie360/BFF_Message/pull/250))

#### Technique
- Contrôles RGPD : `gdpr-pr.yml` (checklist des PR, MAIR-295, [#179](https://github.com/mairie360/BFF_Message/pull/179)), test du marqueur dans les journaux (MAIR-290, [#175](https://github.com/mairie360/BFF_Message/pull/175)), simulation d'usage RGPD (MAIR-497, [#245](https://github.com/mairie360/BFF_Message/pull/245)), et CICD passé en v5.2.2 sur les workflows (MAIR-771, [#243](https://github.com/mairie360/BFF_Message/pull/243)).
- Tests d'intégration newman sur une stack réelle (MAIR-262, [#234](https://github.com/mairie360/BFF_Message/pull/234)) ; correctifs de sécurité Node.js 24.22.1 avec images épinglées par digest, conteneur de dev en utilisateur `node` ([#235](https://github.com/mairie360/BFF_Message/pull/235)) ; épinglage des digests et des actions par Renovate ([#241](https://github.com/mairie360/BFF_Message/pull/241)).

## Différence dev → staging (en dev, pas encore en staging)

#### Changements de comportement
- Les sessions sont vérifiées avec la clé publique Ed25519 de Core (`JWT_PUBLIC_KEY`, EdDSA sous le `kid` de Core, contrôles `iss` et `aud`) au lieu du secret HS256 partagé. Un jeton HS256 reçoit 401 avant tout appel amont, sauf tant que `JWT_SECRET` reste défini (phase de transition). Un appelant qui signait ses jetons avec l'ancien secret doit passer à des jetons EdDSA. Le BFF refuse de démarrer sans `JWT_PUBLIC_KEY` ou avec une clé mal formée. (MAIR-680, [#246](https://github.com/mairie360/BFF_Message/pull/246))

#### Corrections
- Les messages d'une conversation portent désormais l'identifiant public de leur conversation, égal à `conversation.id` (`conversation-<n>`), quelle que soit la forme d'identifiant envoyée par le client. Avant : `POST /direct-messages` renvoyait `conversation.id` = `conversation-<n>` avec `message.conversationId` = `<n>` numérique, et le Messages front affichait « La création du message direct n'a pas été confirmée. » après un 201. Maintenant : les deux valeurs sont identiques. Le type de `message.conversationId` passe d'un nombre à une chaîne. (MAIR-603, [#250](https://github.com/mairie360/BFF_Message/pull/250))

#### Technique
- Contrôles RGPD : `gdpr-pr.yml` (checklist des PR, MAIR-295, [#179](https://github.com/mairie360/BFF_Message/pull/179)), test du marqueur dans les journaux (MAIR-290, [#175](https://github.com/mairie360/BFF_Message/pull/175)), simulation d'usage RGPD (MAIR-497, [#245](https://github.com/mairie360/BFF_Message/pull/245)), et CICD passé en v5.2.2 sur les workflows (MAIR-771, [#243](https://github.com/mairie360/BFF_Message/pull/243)).
- Tests d'intégration newman sur une stack réelle (MAIR-262, [#234](https://github.com/mairie360/BFF_Message/pull/234)) ; correctifs de sécurité Node.js 24.22.1 avec images épinglées par digest, conteneur de dev en utilisateur `node` ([#235](https://github.com/mairie360/BFF_Message/pull/235)) ; épinglage des digests et des actions par Renovate ([#241](https://github.com/mairie360/BFF_Message/pull/241)).

## Différence staging → prod (en staging, pas encore en prod)

_Rien._

## Historique des passages

<!-- release-journal-history:start -->
| Date | Environnement | Version | Commit | Run |
| --- | --- | --- | --- | --- |
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
