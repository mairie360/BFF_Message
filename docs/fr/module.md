# BFF_Message — Présentation du module

[Documentation technique](technical.md) · [English](../en/module.md) · [README](../../README.md)

Regrouper conversations, messages, contacts et références métier pour la messagerie interne de Mairie360. Le BFF adapte Message API et associe les conversations au contexte utilisateur et aux projets ou événements visibles.

## Public et utilité

Les agents échangeant en direct ou en groupe et les équipes intégrant la collaboration entre modules.

Domaine fonctionnel: Messagerie instantanée.

## Fonctions disponibles

- Chargement initial de l’utilisateur, des contacts, conversations et messages de la conversation active.
- Envoi de messages directs ou dans une conversation, création de groupes et suppression de conversations.
- Recherche de contacts et références de projets, tâches et événements via `/business-references`.

## Parcours type

1. Charger `/messaging/bootstrap` et sélectionner une conversation.
2. Rechercher un contact ou une référence métier, puis envoyer un message.
3. Mettre à jour la conversation et consulter les messages renvoyés par le BFF.

## Place dans Mairie360

Dépôts associés: [Messages_Web_Service](https://github.com/mairie360/Messages_Web_Service).

Ce dépôt contient le serveur BFF et son contrat. Les web services associés portent les écrans; le BFF adapte les données et les règles serveur nécessaires à ces écrans.

## Données et état actuel

Conversations et messages passent par Message API. Les contacts proviennent directement de la table SQL `users`; le contexte utilisateur est adapté depuis Core. Les références métier sont agrégées depuis BFF Project et BFF Calendar. La modification locale du profil, les métadonnées de pièces jointes et l’accusé de lecture ne constituent pas une persistance complète.

## Périmètre et limites

L’upload de pièces jointes fabrique actuellement des métadonnées et ne fournit pas un stockage binaire durable. Le marquage lu renvoie un compteur nul sans écrire dans Message API. Les groupes de conversation passent par l’API, tandis que certaines données de profil restent locales au processus.

## Pour développer ou exploiter ce module

Le [guide technique](technical.md) détaille architecture, configuration, routes, session, persistance, tests et CI/CD. Il décrit les sources de vérité et les étapes de synchronisation des contrats avec les dépôts associés.
