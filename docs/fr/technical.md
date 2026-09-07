# BFF_Message — Documentation technique

[Présentation du module](module.md) · [English](../en/technical.md) · [README](../../README.md)

## Architecture et traitement des requêtes

Serveur Express 5.2.1 écrit en TypeScript. Les schémas Zod et leur registre OpenAPI décrivent les objets échangés; les routeurs adaptent les services amont aux besoins des interfaces.

`src/index.ts` monte le routeur Messages à la racine. Les helpers convertissent les identifiants et objets du client généré; `contactsRepository.ts` lit l’annuaire. `business_references.ts` appelle les BFF métier avec la session. Le bootstrap charge au maximum 20 conversations puis 30 messages de la première conversation.

## Données et persistance

Conversations et messages passent par Message API. Les contacts proviennent directement de la table SQL `users`; le contexte utilisateur est adapté depuis Core. Les références métier sont agrégées depuis BFF Project et BFF Calendar. La modification locale du profil, les métadonnées de pièces jointes et l’accusé de lecture ne constituent pas une persistance complète.

L’upload de pièces jointes fabrique actuellement des métadonnées et ne fournit pas un stockage binaire durable. Le marquage lu renvoie un compteur nul sans écrire dans Message API. Les groupes de conversation passent par l’API, tandis que certaines données de profil restent locales au processus.

## Installation et lancement local

Utiliser Node.js 22 pour reproduire le job de contrats et npm avec le fichier de verrouillage versionné. Les versions des autres jobs et de Docker sont précisées plus bas.

Les dépendances privées `@mairie360/*` nécessitent un accès GitHub Packages. Configurer `NODE_AUTH_TOKEN` dans l’environnement avec un jeton autorisé à lire ces packages, conformément à `.npmrc`. Ne pas enregistrer la valeur dans Git.

```bash
npm ci
```

Créer `.env` à la racine. Exemple de configuration HTTP locale à adapter aux services démarrés:

```dotenv
PORT=4003
MESSAGE_API_BASE_PATH=http://localhost:3003/api
CORE_API_BASE_URL=http://localhost:3000
CORE_API_URL=localhost
CORE_API_PORT=3000
MESSAGE_API_URL=localhost
MESSAGE_API_PORT=3003
PROJECT_BFF_URL=http://localhost:4001
CALENDAR_BFF_URL=http://localhost:4002
```

Compléter `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` et `DB_PASSWORD` pour une base existante contenant les tables attendues par les dépôts SQL. Ces variables et les éventuels secrets listés ci-dessous restent à fournir; l’exemple HTTP ne prépare ni schéma ni données.

```bash
npm run start
```

`PORT` est obligatoire pour ce BFF; cet exemple utilise `4003`.

Vérifier le processus puis consulter la documentation interactive:

```bash
curl --fail --silent --show-error http://localhost:4003/health
```

Interface Swagger: `http://localhost:4003/docs`. Spécification JSON: `/openapi.json`, avec l’alias `/swagger.json`. `/health` vérifie le processus; `/check_apis` est un diagnostic distinct des dépendances.

## Configuration

Les valeurs ci-dessous sont des exemples locaux ou des comportements explicitement indiqués, pas des identifiants de production.

| Variable ou priorité | Exemple / repli indiqué | Rôle |
| --- | --- | --- |
| `PORT` | 4003 | Port de cet exemple local. |
| `MESSAGE_API_BASE_PATH` | http://localhost:3003/api | Adresse métier explicite; le repli du code est `http://localhost:8080/api`. |
| `CORE_API_BASE_URL` | http://localhost:3000 | Prioritaire sur `CORE_API_URL` pour le client Core. |
| `CORE_API_URL` / `CORE_API_PORT` | localhost / 3000 | Configuration alternative Core et diagnostic. |
| `MESSAGE_API_URL` / `MESSAGE_API_PORT` | localhost / 3003 | Hôte et port du diagnostic. |
| `PROJECT_BFF_URL` | http://localhost:4001 | Source des références projets et tâches. |
| `CALENDAR_BFF_URL` | http://localhost:4002 | Source des références événements. |
| `DB_HOST` / `DB_PORT` | localhost / 5432 | Connexion PostgreSQL des dépôts SQL. |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | — | Base, compte et secret à fournir pour le schéma partagé attendu. |

## Routes et contrat de données

Inventaire extrait de `contracts/openapi.json`. Les paramètres entre accolades sont remplacés par des identifiants réels. Les types détaillés, champs requis, réponses et exemples éventuels sont définis dans ce contrat; les statuts du tableau sont ceux déclarés, sans prétendre lister toutes les erreurs de transport ou de validation.

| Méthode | Chemin | Corps déclaré | Statuts déclarés |
| --- | --- | --- | --- |
| GET | `/health` | — | 200 |
| GET | `/check_apis` | — | 200, 502 |
| GET | `/business-references` | — | 200, 401 |
| POST | `/attachments` | multipart/form-data | 201, 401 |
| GET | `/messaging/bootstrap` | — | 200, 401 |
| GET | `/contacts` | — | 200, 401 |
| GET | `/conversations` | — | 200, 401 |
| DELETE | `/conversations/{conversationId}` | — | 200 |
| POST | `/conversations/{conversationId}/read` | application/json | 200 |
| POST | `/groups` | application/json | 201, 401 |
| GET | `/me` | — | 200, 401 |
| PATCH | `/me` | application/json | 200, 400 |
| GET | `/conversations/{conversationId}/messages` | — | 200, 401 |
| POST | `/conversations/{conversationId}/messages` | application/json | 201, 401 |
| POST | `/direct-messages` | application/json | 201, 401 |

## Session, permissions et erreurs

Le BFF utilise l’en-tête Authorization; en son absence, le middleware peut reprendre le cookie `accessToken`. Les clients métier transmettent cette autorisation. Les profils locaux et réponses de lecture ne doivent pas être interprétés comme une validation de stockage ou de droits par l’API distante.

## Synchronisation et vérifications

```bash
npm run contracts:generate
npm run contracts:check
npm test -- --runInBand
npm run lint
npm run build
```

`contracts:generate` exporte le registre runtime dans `contracts/openapi.json` et régénère `contracts/bff.d.ts`. `contracts:check` échoue si le contrat ou les types sont périmés. Exécuter ensuite `npm run contracts:sync` dans chaque web service associé et livrer les modifications de contrat ensemble.

Le générateur de types est fixé à `openapi-typescript@7.10.1` dans `scripts/contracts.mjs` et s’exécute via npm. Pour une modification uniquement documentaire, vérifier les liens, l’exactitude des deux langues et `git diff --check`; ne pas régénérer les contrats sans modification de leur source.

## CI/CD et exécution Docker

Le job `contracts.yml` utilise Node.js 22, `actions/checkout@v7` et `actions/setup-node@v7`. Il s’exécute sur push, pull request et lancement manuel; il installe avec `npm ci`, contrôle les contrats et lance les tests dédiés.

`cicd.yml` appelle `mairie360/CICD/.github/workflows/BFFs-cicd.yml@v1.13.2`, avec `cicd_version: v1.13.2` et `node_version: "22"`. Les étapes réutilisables et les environnements GitHub déterminent les contrôles, publications et déploiements effectifs.

Le Dockerfile utilise encore `node:20-alpine` pour la construction et l’exécution; la commande de l’image est `["npx", "tsx", "dist/index.js"]`. Cette version est distincte du job de contrats Node.js 22.

Avant un lancement Docker, vérifier les variables de service, les secrets de build et les réseaux dans les fichiers du dépôt. Une CI verte valide ses jobs; elle ne prouve pas la disponibilité des services métier dans un environnement distant.

## Diagnostic

Si les conversations fonctionnent mais pas les contacts, vérifier PostgreSQL. Si seules les références métier manquent, vérifier les deux BFF associés et les permissions de la session. `/me` décrit ici le profil de messagerie; les adaptateurs `/api/auth/*` du web utilisent BFF User.

## Repères dans le dépôt

- [src/index.ts](../../src/index.ts)
- [src/routes/Messages/index.ts](../../src/routes/Messages/index.ts)
- [src/routes/Messages/message_helpers.ts](../../src/routes/Messages/message_helpers.ts)
- [src/routes/Messages/business_references.ts](../../src/routes/Messages/business_references.ts)
- [src/repositories/contactsRepository.ts](../../src/repositories/contactsRepository.ts)
- [src/clients/messageClient.ts](../../src/clients/messageClient.ts)
- [src/clients/coreClient.ts](../../src/clients/coreClient.ts)
- [contracts/openapi.json](../../contracts/openapi.json)
- [contracts/bff.d.ts](../../contracts/bff.d.ts)
- [scripts/contracts.mjs](../../scripts/contracts.mjs)
- [package.json](../../package.json)
- [.github/workflows/contracts.yml](../../.github/workflows/contracts.yml)
- [.github/workflows/cicd.yml](../../.github/workflows/cicd.yml)
- [Dockerfile](../../Dockerfile)
- [docker-compose.yml](../../docker-compose.yml)

Compléments historiques: [CONTRACT.md](../../CONTRACT.md). Les besoins proposés doivent rester distincts du comportement effectivement implémenté.
