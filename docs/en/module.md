# BFF_Message — Module overview

[Technical documentation](technical.md) · [Français](../fr/module.md) · [README](../../README.md)

Combine conversations, messages, contacts and business references for Mairie360 internal messaging. The BFF adapts Message API and connects conversations to the user context and visible projects or events.

## Audience and value

Staff exchanging direct or group messages and teams integrating collaboration across modules.

Business domain: Instant messaging.

## Available capabilities

- Initial loading of the user, contacts, conversations and active conversation messages.
- Send direct or conversation messages, create groups and delete conversations.
- Contact search and project, task and event references through `/business-references`.

## Typical workflow

1. Load `/messaging/bootstrap` and select a conversation.
2. Find a contact or business reference, then send a message.
3. Update the conversation and inspect the messages returned by the BFF.

## Role within Mairie360

Associated repositories: [Messages_Web_Service](https://github.com/mairie360/Messages_Web_Service).

This repository contains the BFF server and its contract. Associated web services own the screens; the BFF adapts data and server rules needed by those screens.

## Data and current state

Conversations and messages use Message API. Contacts are read directly from the SQL `users` table, including the current user (token `sub` claim). Business references are aggregated from BFF Project and BFF Calendar. Attachments are not available yet (503); the read acknowledgement goes through Message API. The profile is read-only here (`GET /me`); profile edits go through BFF_Settings (`PATCH /settings/profile`) → Core_API (`PATCH /api/v1/user/me`).

## Scope and limitations

Attachment upload is not available yet: `POST /attachments` answers 503 instead of made-up ids, and messages with attachments are refused. Mark-as-read acknowledges the messages through Message API (up to the latest one when no message id is given). Conversation groups use the API.

## Developing or operating this module

The [technical guide](technical.md) covers architecture, configuration, routes, session handling, persistence, tests and CI/CD. It describes sources of truth and contract synchronization with associated repositories.
