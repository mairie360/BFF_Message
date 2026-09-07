# Contrat BFF / web service

Web services associés : **Messages_Web_Service**. Le document [OpenAPI](contracts/openapi.json), les [types TypeScript](contracts/bff.d.ts), `/openapi.json` et `/swagger.json` proviennent tous de `src/openapi.ts`, qui importe les routes montées par l’application.

## Routes implémentées

Les chemins sont relatifs au BFF. Les proxies web conservent méthode, paramètres, contenu binaire, statuts et cookies. Les chemins `/api/auth/*` restent des adaptateurs de session vers BFF User ; les pages Next.js sont distinctes des routes de données.

| Méthode | Route | Réponse / schéma |
| --- | --- | --- |
| GET | `/health` | 200 OK |
| GET | `/check_apis` | 200 CheckApiResponse |
| GET | `/business-references` | 200 BusinessReferencesResponse |
| POST | `/attachments` | 201 Pièce jointe téléchargée avec succès |
| GET | `/messaging/bootstrap` | 200 Informations de démarrage pour l’utilisateur actuel |
| GET | `/contacts` | 200 Liste des contacts |
| GET | `/conversations` | 200 Liste des conversations de l’utilisateur actuel |
| DELETE | `/conversations/{conversationId}` | 200 Conversation supprimée avec succès |
| POST | `/conversations/{conversationId}/read` | 200 Conversation mise à jour |
| POST | `/groups` | 201 Groupe créé avec succès |
| GET | `/me` | 200 Profil utilisateur actuel |
| PATCH | `/me` | 200 Profil utilisateur mis à jour |
| GET | `/conversations/{conversationId}/messages` | 200 Liste des messages de la conversation |
| POST | `/conversations/{conversationId}/messages` | 201 Message créé avec succès |
| POST | `/direct-messages` | 201 Message direct créé avec succès |

## Mise à jour et validation

Après une modification des routes ou schémas, exécuter `npm run contracts:generate`, puis synchroniser chaque web service associé avec `npm run contracts:sync`. `npm run contracts:check` échoue si le contrat exporté ou les types générés sont périmés. Soumettre les branches associées dans la même livraison.

Le générateur de types est fixé à `openapi-typescript@7.10.1`. Il est exécuté via npm ; aucun jeton privé ne figure dans les contrats.

## Références métier

`/business-references` est agrégé dans BFF Message depuis `PROJECT_BFF_URL` et `CALENDAR_BFF_URL`. Le web service relaie la même réponse. Les pièces jointes, groupes ou profils déjà gérés en mémoire par le BFF ne deviennent pas persistants par cet alignement.
