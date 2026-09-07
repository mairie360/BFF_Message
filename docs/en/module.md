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

Conversations and messages use Message API. Contacts are read directly from the SQL `users` table; the user context is adapted from Core. Business references are aggregated from BFF Project and BFF Calendar. Local profile edits, attachment metadata and the read acknowledgement do not provide complete persistence.

## Scope and limitations

Attachment upload currently creates metadata and does not provide durable binary storage. Mark-as-read returns a zero counter without writing to Message API. Conversation groups use the API, while some profile data remains local to the process.

## Developing or operating this module

The [technical guide](technical.md) covers architecture, configuration, routes, session handling, persistence, tests and CI/CD. It describes sources of truth and contract synchronization with associated repositories.
