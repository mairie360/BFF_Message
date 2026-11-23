# Contrat BFF / web service

Web services associés : **Messages_Web_Service**. Le document [OpenAPI](contracts/openapi.json), les [types TypeScript](contracts/bff.d.ts), `/openapi.json` et `/swagger.json` proviennent tous de `src/openapi.ts`, qui importe les routes montées par l’application.

## Routes implémentées

Les chemins sont relatifs au BFF. Les proxies web conservent méthode, paramètres, contenu binaire, statuts et cookies. Les chemins `/api/auth/*` restent des adaptateurs de session vers BFF User ; les pages Next.js sont distinctes des routes de données.

| Méthode | Route | Réponse / schéma |
| --- | --- | --- |
| GET | `/health` | 200 OK |
| GET | `/check_apis` | 200 / 502 CheckApisResponse |
| GET | `/business-references` | 200 BusinessReferencesResponse |
| GET | `/stream` | 200 flux SSE de `MessageStreamEvent` (MAIR-525) |
| POST | `/attachments` | 503 Attachment upload not available yet (401 without a session) |
| GET | `/messaging/bootstrap` | 200 Informations de démarrage pour l’utilisateur actuel |
| GET | `/contacts` | 200 Liste des contacts |
| GET | `/conversations` | 200 Une page de conversations (`limit` 1-30, `cursor`, `search`), `nextCursor` |
| GET | `/conversations/{conversationId}` | 200 Conversation ouverte : conversation, participants (id, nom) et une page de messages (`limit`, `before`), `nextCursor` |
| DELETE | `/conversations/{conversationId}` | 200 Conversation supprimée avec succès |
| POST | `/conversations/{conversationId}/read` | 200 `{ conversationId, unreadCount }`: acknowledges reads up to the optional `readUntilMessageId` (latest message when absent) through Message API; 401/403/404 relayed, 502 on upstream failure |
| POST | `/groups` | 201 Groupe créé avec succès |
| GET | `/me` | 200 Profil utilisateur actuel |
| GET | `/conversations/{conversationId}/messages` | 200 Une page de messages (`limit`, `before`) avec la conversation, `nextCursor` |
| POST | `/conversations/{conversationId}/messages` | 201 Message créé avec succès |
| POST | `/direct-messages` | 201 Message direct créé avec succès |
| PATCH | `/conversations/{conversationId}/messages/{messageId}` | 200 `{ message }` modifié par son auteur (MAIR-1154) |
| DELETE | `/conversations/{conversationId}/messages/{messageId}` | 200 `{ message }` supprimé (`deleted: true`) |
| POST / DELETE | `/conversations/{conversationId}/messages/{messageId}/reactions` | 200 `{ reactions }` (`{ emoji }` / `?emoji=`) |
| GET | `/conversations/{conversationId}/members` | 200 `{ members, canManage }` |
| POST | `/conversations/{conversationId}/members` | 200 `{ members, canManage, systemMessage }` (`{ userIds }`) |
| DELETE | `/conversations/{conversationId}/members/{userId}` | 200 `{ members, canManage, systemMessage }` |
| POST | `/conversations/{conversationId}/leave` | 204 |
| GET | `/conversations/{conversationId}/search` | 200 `{ type, items, hasMore, total }` (`q`, `type`, `limit`, `offset`) |
| GET | `/conversations/{conversationId}/mention-suggestions` | 200 `{ everyone, groups, people }` (`q`) |
| GET | `/link-suggestions` | 200 `{ items, sources }` (`q`) |

## Mise à jour et validation

Après une modification des routes ou schémas, exécuter `npm run contracts:generate`, puis synchroniser chaque web service associé avec `npm run contracts:sync`. `npm run contracts:check` échoue si le contrat exporté ou les types générés sont périmés. Soumettre les branches associées dans la même livraison.

Le générateur de types est fixé à `openapi-typescript@7.10.1`. Il est exécuté via npm ; aucun jeton privé ne figure dans les contrats.

## Références métier

`/business-references` est construit dans BFF Message depuis Project API et Calendar API (`PROJECT_API_URL`, `CALENDAR_API_URL`), jamais depuis un autre BFF (MAIR-525). `/stream` remplace le rechargement toutes les 2 s : le web service relaie la même réponse, le front la lit avec `fetch` en flux (pas d'`EventSource`), relit la conversation signalée et ne recharge toutes les 2 s que tant que le flux n'est pas connecté.

## Temps réel WebSocket (MAIR-655)

Le flux `/stream` est remplacé par un WebSocket `GET /ws` (MAIR-658, déclaré dans `contracts/openapi.json` avec le schéma `MessageRealtimeEvent` et les refus `400`, `401`, `502`, `503`), le SSE restant disponible jusqu'à sa validation puis son retrait (MAIR-662). Le contrat (poignée de main front → BFF → Message API, trames `MessageRealtimeEvent` `{ type, conversationId, messageId, unreadCount }`, codes de fermeture, limites, comportement du client) est figé dans `docs/fr/temps-reel-websocket.md` de Message_API (version anglaise de référence : `docs/en/realtime-websocket.md`, décision : `docs/en/adr/0001-messaging-websocket.md`). Le front n'ouvre `/ws` que via son propre serveur : le BFF reste privé et ne lit aucun cookie. Ce changement ne touche ni aux pièces jointes (`POST /attachments` répond toujours `503`, rien n'est stocké) ni aux groupes (créés et lus dans Message API, pas en mémoire du BFF).
