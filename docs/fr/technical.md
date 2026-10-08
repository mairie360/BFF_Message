# BFF_Message — Documentation technique

[Présentation du module](module.md) · [English](../en/technical.md) · [README](../../README.md)

## Architecture et traitement des requêtes

Serveur Express 5.2.1 écrit en TypeScript. Les schémas Zod et leur registre OpenAPI décrivent les objets échangés; les routeurs adaptent les services amont aux besoins des interfaces.

`src/app.ts` construit l’application Express (en-têtes de sécurité communs de `@mairie360/bffs-lib`, documentation, `/health`, `/check_apis`, routeur Messages à la racine, gestionnaires d’erreurs) ; `src/index.ts` charge `.env`, vérifie la configuration des services amont et écoute. Les helpers convertissent les identifiants et objets du client généré; `coreClient.ts` lit l’annuaire de Core API. `business_references.ts` appelle les BFF métier avec la session. Le bootstrap charge au maximum 20 conversations puis 30 messages de la première conversation.

## Données et persistance

Conversations et messages passent par Message API. Une conversation créée par `POST /direct-messages` (salon Message API nommé `Direct <recipientId>`) qui ne réunit que l’appelant et un contact est renvoyée avec `kind: 'direct'`, `contactId` (identifiant du contact) et le nom du contact ; toute autre conversation est `kind: 'group'`. Le front publie un nouveau message à un contact dans cette conversation (`POST /conversations/{id}/messages`) ; `POST /direct-messages` réutilise lui aussi la conversation directe existante de l’appelant avec le destinataire (salon nommé `Direct <id>` d’après l’un ou l’autre, qui ne réunit qu’eux deux) et ne crée un salon que s’il n’en existe pas. Le `authorName` d’un message est le nom de l’auteur dans l’annuaire Core, omis si l’auteur n’est pas un membre trouvé dans l’annuaire ; `GET /me` ne renvoie que ce que l’annuaire connaît (nom, e-mail, rôles), sans rôle, service, poste ou dernière connexion fictifs. Les contacts proviennent directement de la table SQL `users`, y compris l’utilisateur courant (identifiant `sub` du jeton). Les références métier sont agrégées depuis BFF Project et BFF Calendar. La modification locale du profil et les métadonnées de pièces jointes ne constituent pas une persistance complète.

Les pièces jointes ne sont pas encore prises en charge : `POST /attachments` répond 503 à un appelant authentifié (401 sinon) au lieu d’identifiants inventés, et un `attachmentIds` non vide est refusé en 400 sur `POST /conversations/{id}/messages`. `POST /conversations/{id}/read` relaie l’accusé de lecture à Message API ≥ 1.0 (`POST /api/v1/{chat_id}/read/`) : tous les messages jusqu’au `readUntilMessageId` facultatif inclus sont acquittés, ou jusqu’au dernier message (une lecture `limit=1`) quand le corps ou l’identifiant est absent ; une conversation vide répond `unreadCount: 0` sans rien acquitter. La réponse porte le `unreadCount` renvoyé par Message API ; ses 401/403/404 sont relayés, tout autre échec donne un 502. Les `limit` des listes sont compris entre 1 et 100 ; les listes de Message API sont paginées depuis la 1.0 : le BFF lit toutes les pages de conversations et de membres (au plus 20 pages de 100) et demande les `limit` derniers messages, ou toutes les pages via le curseur `before` sans `limit`. Un message dont le compte auteur est supprimé n’a pas d’`authorId` ; les messages sont limités à 5000 caractères, les noms de groupe à 100 et les descriptions à 500.

`GET /business-references` borne ses appels amont : une liste BFF Project de 50 projets, le détail des tâches uniquement pour les projets listés qui en ont (au plus 20, 4 à la fois), et une fenêtre BFF Calendar de 182 jours de part et d’autre d’aujourd’hui (moins d’un an). La route est limitée en débit par appelant (voir `BUSINESS_REFERENCES_RATE_LIMIT_*`). Les groupes de conversation passent par l’API, tandis que certaines données de profil restent locales au processus.

## Installation et lancement local

Utiliser Node.js 24 (CI et images Docker) pour reproduire le job de contrats et npm avec le fichier de verrouillage versionné. Les versions des autres jobs et de Docker sont précisées plus bas.

Les dépendances privées `@mairie360/*` nécessitent un accès GitHub Packages. Configurer `NODE_AUTH_TOKEN` dans l’environnement avec un jeton autorisé à lire ces packages, conformément à `.npmrc`. Ne pas enregistrer la valeur dans Git.

```bash
npm ci
```

Copier `.env.example` en `.env` à la racine et l’adapter aux services démarrés :

```dotenv
PORT=4003
MESSAGE_API_URL=http://localhost:3003
CORE_API_URL=http://localhost:3000
PROJECT_BFF_URL=http://localhost:4001
CALENDAR_BFF_URL=http://localhost:4002
```

`.env` est chargé par `import 'dotenv/config'`, première ligne de `src/index.ts`. Chaque service amont est configuré par `<SERVICE>_URL` (schéma facultatif, `http` par défaut) et un `<SERVICE>_PORT` facultatif utilisé quand l’URL n’a pas de port, relus à chaque appel (MAIR-431). Il n’y a aucune valeur par défaut `localhost` : le serveur refuse de démarrer si l’une des quatre URL manque ou est invalide, et une route qui appellerait un service amont non configuré répond 503. L’exemple HTTP ne prépare pas de données.

```bash
npm run start
```

`PORT` vaut `4003` par défaut.

Vérifier le processus puis consulter la documentation interactive:

```bash
curl --fail --silent --show-error http://localhost:4003/health
```

Interface Swagger: `http://localhost:4003/docs`. Spécification JSON: `/openapi.json`, avec l’alias `/swagger.json`. `/health` vérifie le processus; `/check_apis` est un diagnostic distinct des dépendances.

## Configuration

Les valeurs ci-dessous sont des exemples locaux ou des comportements explicitement indiqués, pas des identifiants de production.

| Variable ou priorité | Exemple / repli indiqué | Rôle |
| --- | --- | --- |
| `PORT` | 4003 (défaut) | Port d’écoute. |
| `MESSAGE_API_URL` / `MESSAGE_API_PORT` | http://localhost:3003 / — | Racine de Message API (ses routes sont publiées sous `/api/v1`), aussi sondée par `/check_apis`. **Obligatoire**. Remplace `MESSAGE_API_BASE_PATH` (supprimée). |
| `CORE_API_URL` / `CORE_API_PORT` | http://localhost:3000 / — | Annuaire Core API (contacts, utilisateur courant), aussi sondé par `/check_apis`. **Obligatoire**. |
| `PROJECT_BFF_URL` / `PROJECT_BFF_PORT` | http://localhost:4001 / — | Source des références projets et tâches. **Obligatoire**. |
| `CALENDAR_BFF_URL` / `CALENDAR_BFF_PORT` | http://localhost:4002 / — | Source des références événements. **Obligatoire**. |
| `RATE_LIMIT_ENABLED` | true | `false` désactive la limite par appelant de `GET /business-references` (tests de charge). |
| `BUSINESS_REFERENCES_RATE_LIMIT_MAX` / `_WINDOW_MS` | 30 / 60000 | Requêtes par session (empreinte du jeton Bearer, jamais le `sub` du JWT non vérifié) et par fenêtre sur `GET /business-references`, 429 au-delà. |
| `TRUST_PROXY` | non définie (aucun proxy de confiance) | `trust proxy` d’Express (`true`, un nombre de sauts ou des adresses de confiance), pour que `req.ip` soit le vrai client derrière l’ingress. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | non défini (télémétrie désactivée) | Collecteur OpenTelemetry de l’instance, par ex. `http://otel-collector:4318` : les traces et les métriques HTTP y sont exportées en OTLP (MAIR-504). Seuls la méthode, le statut, la route paramétrée et l’hôte appelé sortent du BFF, jamais une URL, une query string, un en-tête, un identifiant ou une IP. |
| `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES` | `bff-message` ; non défini | Remplacent le nom du service ; attributs de ressource supplémentaires comme `service.version=<tag de l’image>,deployment.environment.name=prod`. `OTEL_SDK_DISABLED=true` désactive la télémétrie. |

## Routes et contrat de données

Inventaire extrait de `contracts/openapi.json`. Les paramètres entre accolades sont remplacés par des identifiants réels. Les types détaillés, champs requis, réponses et exemples éventuels sont définis dans ce contrat; les statuts du tableau sont ceux déclarés, sans prétendre lister toutes les erreurs de transport ou de validation.

| Méthode | Chemin | Corps déclaré | Statuts déclarés |
| --- | --- | --- | --- |
| GET | `/health` | — | 200 |
| GET | `/check_apis` | — | 200, 502 |
| GET | `/business-references` | — | 200, 401, 429 |
| POST | `/attachments` | multipart/form-data | 401, 502, 503 |
| GET | `/messaging/bootstrap` | — | 200, 401, 502, 503 |
| GET | `/contacts` | — | 200, 400, 401, 502, 503 |
| GET | `/conversations` | — | 200, 400, 401, 502, 503 |
| DELETE | `/conversations/{conversationId}` | — | 200, 400, 401, 403, 404, 502, 503 |
| POST | `/conversations/{conversationId}/read` | application/json (facultatif) | 200, 400, 401, 403, 404, 502, 503 |
| POST | `/groups` | application/json | 201, 400, 401, 502, 503 |
| GET | `/me` | — | 200, 401, 502, 503 |
| GET | `/conversations/{conversationId}/messages` | — | 200, 400, 401, 404, 502, 503 |
| POST | `/conversations/{conversationId}/messages` | application/json | 201, 400, 401, 404, 502, 503 |
| POST | `/direct-messages` | application/json | 201, 400, 401, 502, 503 |

## Session, permissions et erreurs

Le seul identifiant accepté par le BFF est `Authorization: Bearer <token>` (MAIR-429) : le proxy du web service transforme le cookie `accessToken` en cet en-tête. Les cookies, `x-session-token` et les autres schémas sont ignorés. Toutes les routes sauf `/health`, `/check_apis` et la documentation sont liées à la session : sans jeton Bearer, elles répondent 401 avant tout appel amont, et leurs réponses portent `Cache-Control: no-store`. Le jeton de l’appelant, normalisé en `Bearer <token>`, est transmis à chaque appel amont (Message API, Core API, BFF Project, BFF Calendar) ; il n’y a aucun jeton par défaut. Le `sub` du JWT est lu sans vérifier la signature, uniquement pour construire les requêtes envoyées en amont avec ce même jeton et le sens des messages, jamais pour accorder un accès ni comme clé de limitation de débit. Les profils locaux et réponses de lecture ne doivent pas être interprétés comme une validation de stockage ou de droits par l’API distante.

Toutes les erreurs sont renvoyées dans l’enveloppe commune à tous les BFFs (`@mairie360/bffs-lib`,
schéma `ErrorResponse` du contrat) : `{ "error": { "code": "NOT_FOUND", "message": "Resource not found", "details": [] } }`.
`code` découle du statut (`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_GATEWAY`,
`SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`, ...). Un échec de validation est un 400 dont `details` liste les
champs invalides (`{ "path": "body.content", "message": "..." }`). Un 4xx amont n’est conservé que si la
route le déclare (401/404 de Message API, 403 sur `DELETE /conversations/{conversationId}`, 400 sur les
créations de messages et de conversations), avec un message générique ; tout autre statut amont, une
panne réseau ou une réponse invalide donne un 502 qui nomme le service (`The MESSAGE_API service is unavailable.`),
et un service amont non configuré un 503. Les lectures idempotentes de Message API et Core API sont
retentées une fois sur une panne transitoire. Tous les appels amont et leur traduction passent par
`callUpstream` / `asCaller` de `@mairie360/bffs-lib`.

`/check_apis` sonde l’opération `/health` de Message API et Core API avec les mêmes variables que les
vrais appels et répond `{ status, message_api, core_api }` (`Connected` / `Unreachable`), 200 si les deux
répondent, 502 sinon. BFF Project et BFF Calendar ne sont pas sondés : `GET /business-references` les
signale source par source. Les messages et corps amont ne sont jamais relayés ; une erreur inattendue donne
un 500 générique.

## Synchronisation et vérifications

```bash
npm run contracts:generate
npm run contracts:check
npm test -- --runInBand
npm run lint
npm run build
```

Les tests de `tests/messages.upstream-mocks.test.ts` exécutent le vrai client Message API et le vrai `fetch` contre des mocks HTTP locaux pilotés par les contrats Message API, BFF Project et BFF Calendar, reconstruits depuis les paquets `@mairie360/*-openapi` installés (types orval, versions épinglées dans `package.json`): chaque requête (chemin, paramètres, corps JSON) et chaque réponse de succès simulée est validée contre ces contrats, et les réponses du BFF contre `contracts/openapi.json`. Monter la version d'un paquet suffit à tester le nouveau contrat; les statuts d'erreur ne sont pas typés par orval et sont simulés explicitement. La table `users` (contacts) reste simulée par `jest.mock`.

`contracts:generate` exporte le registre runtime dans `contracts/openapi.json` et régénère `contracts/bff.d.ts`. `contracts:check` échoue si le contrat ou les types sont périmés. Exécuter ensuite `npm run contracts:sync` dans chaque web service associé et livrer les modifications de contrat ensemble.

Le générateur de types est fixé à `openapi-typescript@7.10.1` dans `scripts/contracts.mjs` et s’exécute via npm. Pour une modification uniquement documentaire, vérifier les liens, l’exactitude des deux langues et `git diff --check`; ne pas régénérer les contrats sans modification de leur source.

## CI/CD et exécution Docker

Le job `contracts.yml` utilise Node.js 24, `actions/checkout@v7` et `actions/setup-node@v7`. Il s’exécute sur push, pull request et lancement manuel; il installe avec `npm ci`, contrôle les contrats et lance les tests dédiés.

`cicd.yml` appelle `mairie360/CICD/.github/workflows/BFFs-cicd.yml@v3.2.0`, avec `cicd_version: v3.2.0` et `node_version: "24"`. Les étapes réutilisables et les environnements GitHub déterminent les contrôles, publications et déploiements effectifs.

Le Dockerfile utilise `node:24-alpine`, épinglée par digest (comme `development.Dockerfile`), pour la construction et l’exécution ; la commande de l’image est `["node", "dist/index.js"]` (le code n’importe que des types des paquets `@mairie360/*`). La CI, le job de contrats et les images utilisent tous Node.js 24.

`security_test.sh` et `performance_test.sh` testent l’image désignée par `IMAGE_REF`: en CI, l’image que `release-dev` vient de publier, soit l’artefact ensuite promu en staging puis en prod. Quand `IMAGE_REF` est vide (usage local), ils construisent d’abord `bff-message:local` depuis `development.Dockerfile`, ce qui demande `NODE_AUTH_TOKEN` et `./.npmrc`.

`security_test.sh` lance la stack OWASP ZAP de `docker-compose-security.yml`: ZAP rejoue chaque opération de `/openapi.json` avec un JWT admin statique (`sub=1`, HS256, `JWT_SECRET=b"secret"` dans tous les services des stacks de sécurité et de performance) et remplit corps et paramètres avec les exemples du contrat. `init-test.sql` crée les lignes que ces exemples désignent (utilisateurs 1, 2, 3 et 10, conversation 101 avec le message 1001, conversation 102 pour la route DELETE et conversation 201 pour les messages postés); garder exemples et seed alignés en ajoutant une route. Les identifiants reçus du client doivent être un entier positif ou un identifiant public (`user-3`, `conversation-101`), et `<` / `>` sont refusés dans les contenus de message, noms et descriptions de groupe.

`security_test.sh` lance aussi la gate de couverture OpenAPI de `mairie360/CICD` (`tests/zap/zap_hooks.py`, passé à ZAP avec `--hook`), extraite dans `cicd-repo/` par les jobs CI et clonée au même endroit par les deux scripts au `cicd_version` épinglé (`CICD_VERSION` le remplace). Après le scan, le hook échoue si une opération du contrat n’a jamais été atteinte, ou si une opération qui exige `bearerAuth` n’a reçu que des 401/403. Le contrat exige ce schéma au niveau racine ; les opérations publiques (`/health`, `/check_apis`) déclarent `security: []` dans leur `registerPath`, une nouvelle route publique doit faire de même. Côté k6, `load-test.js` contient un handler par opération de `contracts/openapi.json` via `coverage.js` : k6 s’arrête à l’init s’il en manque un et échoue sur le seuil `operations_uncovered` si un handler n’envoie pas sa requête. **Ajouter une route implique d’ajouter son handler dans `load-test.js`.**

`load-test.js` lance deux scénarios. `crud` (2 VUs) appelle chaque handler une fois par itération, écritures comprises (pièce jointe et marqueur de lecture, qui doivent répondre 503 et sont exclus de `http_req_failed`, groupe, message, message direct), et supprime les conversations qu’il crée. `reads` (jusqu’à 20 VUs) ne rejoue que les handlers GET sur les fixtures de `init-test.sql` (conversation 101 avec le message 1001, dont l’utilisateur 2 est membre). Chaque opération a un seuil `p(95)` fixé par sa famille : 50 ms pour `/health`, 150 ms pour `/check_apis`, 400 ms pour les lectures, 800 ms pour les écritures ; `http_req_failed` doit rester sous 1 %.

Avant un lancement Docker, vérifier les variables de service, les secrets de build et les réseaux dans les fichiers du dépôt. Une CI verte valide ses jobs; elle ne prouve pas la disponibilité des services métier dans un environnement distant.

## Diagnostic

Si les conversations fonctionnent mais pas les contacts, vérifier Core API. Si seules les références métier manquent, vérifier les deux BFF associés et les permissions de la session. `/me` est ici en lecture seule et décrit le profil de messagerie; les adaptateurs `/api/auth/*` du web utilisent BFF User, et la modification du profil passe par BFF_Settings (`PATCH /settings/profile`) → Core_API (`PATCH /api/v1/user/me`).

## Repères dans le dépôt

- [src/index.ts](../../src/index.ts)
- [src/app.ts](../../src/app.ts)
- [src/routes/Messages/index.ts](../../src/routes/Messages/index.ts)
- [src/routes/Messages/message_helpers.ts](../../src/routes/Messages/message_helpers.ts)
- [src/routes/Messages/business_references.ts](../../src/routes/Messages/business_references.ts)
- [src/clients/coreClient.ts](../../src/clients/coreClient.ts)
- [src/clients/messageClient.ts](../../src/clients/messageClient.ts)
- [contracts/openapi.json](../../contracts/openapi.json)
- [contracts/bff.d.ts](../../contracts/bff.d.ts)
- [scripts/contracts.mjs](../../scripts/contracts.mjs)
- [package.json](../../package.json)
- [.github/workflows/contracts.yml](../../.github/workflows/contracts.yml)
- [.github/workflows/cicd.yml](../../.github/workflows/cicd.yml)
- [Dockerfile](../../Dockerfile)
- [docker-compose.yml](../../docker-compose.yml)

Compléments historiques: [CONTRACT.md](../../CONTRACT.md). Les besoins proposés doivent rester distincts du comportement effectivement implémenté.
