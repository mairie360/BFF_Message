import { createHmac } from 'node:crypto';
import { AxiosHeaders, type AxiosResponse } from 'axios';
import { getMessageAPIMairie360 } from '@mairie360/message-api-openapi/endpoints/messageAPIMairie360';
import type {
  AcknowledgeReadResultView, ChatView, CreateChatResultView, GetChatResultView, GetChatsResultView, GetUsersView, MessageView, PostMessageResultView,
} from '@mairie360/message-api-openapi/model';
import { getCoreAPIMairie360 } from '@mairie360/core-api-openapi/endpoints/coreAPIMairie360';
import type { DirectoryUser, DirectoryUsersResultView } from '@mairie360/core-api-openapi/model';
import { getCalendarAPIMairie360 } from '@mairie360/calendar-api-openapi/endpoints/calendarAPIMairie360';
import { EventCategory, EventVisibility, type EventView, type GetCalendarResultView } from '@mairie360/calendar-api-openapi/model';
import { getProjectAPIMairie360 } from '@mairie360/project-api-openapi/endpoints/projectAPIMairie360';
import {
  type GetProjectsResultView, type GetTasksResultView, type ProjectListItemView, ProjectStatus, TaskPriority, TaskStatus, type TaskView,
} from '@mairie360/project-api-openapi/model';
import type { ContactUser } from '../../src/clients/coreClient';

// Jeux de données typés par les modèles des paquets @mairie360/*-openapi installés : un champ ajouté,
// retiré ou renommé par un contrat amont fait échouer la compilation des tests. Les valeurs sont en plus
// validées à l'exécution contre les contrats reconstruits (upstream-contracts.test.ts, mocks HTTP).
// Les champs non lus par le BFF sont présents parce que les modèles les exigent : ils doivent être ignorés.

// --- Chemins des opérations amont, tels que les construisent les clients générés (helpers `get*Url`) ---

export const messageApiUrls = getMessageAPIMairie360();
export const coreApiUrls = getCoreAPIMairie360();
export const projectApiUrls = getProjectAPIMairie360();
export const calendarApiUrls = getCalendarAPIMairie360();

/** Réponse axios complète telle que la renvoient les clients générés (`*Result`), pour les mocks de module. */
export function axiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
  return { data, status, statusText: 'OK', headers: {}, config: { headers: new AxiosHeaders() } };
}

// --- Message API (@mairie360/message-api-openapi) ---

// Message API (MAIR-478) adds the kind of a chat and, for a direct chat, the other agent; MAIR-507 its member count
// and a ready-to-display name (the other participant's full name for a direct chat).
export function chatView(id: number, name = `Conversation ${id}`, unread_count = 0, member_count = 3): ChatView {
  return { id, name, unread_count, kind: 'group', contact_id: null, member_count };
}

/** A direct chat as the list shows it: named after the contact, always two participants. */
export function directChatView(id: number, contact_id: number, name: string, unread_count = 0): ChatView {
  return { id, name, unread_count, kind: 'direct', contact_id, member_count: 2 };
}

export function chatsResult(chats: ChatView[], has_more = false): GetChatsResultView {
  return { chats, has_more };
}

export function messageView(id: number, sender_id: number, overrides: Partial<MessageView> = {}): MessageView {
  return { id, sender_id, content: `Message ${id}`, created_at: '2026-09-15T09:00:00Z', citation: null, quoted: null, ...overrides };
}

export function chatResult(chat: ChatView, messages: MessageView[], next_before: number | null = null): GetChatResultView {
  return { chat, messages, has_more: next_before !== null, next_before };
}

/** Members of a chat with their names (MAIR-507): `names` maps an id to `[first_name, last_name]`. */
export function chatUsers(ids: number[], has_more = false, names: Record<number, [string, string]> = {}): GetUsersView {
  return {
    users: ids.map((id) => ({ id, first_name: names[id]?.[0] ?? 'Agent', last_name: names[id]?.[1] ?? `Numéro ${id}` })),
    has_more,
  };
}

export function createChatResult(id: number): CreateChatResultView {
  return { id };
}

export function postMessageResult(id: number): PostMessageResultView {
  return { id };
}

export function acknowledgeReadResult(unread_count: number): AcknowledgeReadResultView {
  return { unread_count };
}

// --- Core API (@mairie360/core-api-openapi), annuaire des agents ---

export const users = {
  agent: { id: 7, first_name: 'Agent', last_name: 'Test', email: 'agent.test@mairie360.fr' },
  sophie: { id: 8, first_name: 'Sophie', last_name: 'Leroy', email: 'sophie.leroy@mairie360.fr' },
  thomas: { id: 9, first_name: 'Thomas', last_name: 'Bernard', email: '' },
} satisfies Record<string, ContactUser>;

/** Fiche annuaire complète : rôles et groupes ne sont pas lus par ce BFF. */
export function directoryUser(user: ContactUser, overrides: Partial<DirectoryUser> = {}): DirectoryUser {
  return { ...user, roles: ['User'], group_ids: [1], ...overrides };
}

/** Corps de `GET /api/v1/user/`. */
export function directoryUsers(list: ContactUser[]): DirectoryUsersResultView {
  return { users: list.map((user) => directoryUser(user)) };
}

// --- Project API (@mairie360/project-api-openapi), read directly since MAIR-525 ---

/** A project of `GET /api/v1/projects/` with the aggregates of its tasks: one active task by default. */
export function projectListItem(id: number, overrides: Partial<ProjectListItemView> = {}): ProjectListItemView {
  return {
    id, name: `Projet ${id}`, description: `Description du projet ${id}`, status: ProjectStatus.Active,
    tasks_total: 1, tasks_completed: 0, priority: TaskPriority.Medium, due_date: null, members: [], members_total: 0,
    ...overrides,
  };
}

export function projectsResult(projects: ProjectListItemView[], total = projects.length): GetProjectsResultView {
  return {
    projects,
    total,
    summary: {
      by_status: { active: projects.length, suspended: 0, completed: 0, other: 0 },
      by_priority: { low: 0, medium: projects.length, high: 0 },
    },
  };
}

export function taskView(id: number, overrides: Partial<TaskView> = {}): TaskView {
  return {
    id, title: `Tâche ${id}`, description: '', status: TaskStatus.Todo, priority: TaskPriority.Medium,
    due_date: null, assigned_to: null, fields: [], ...overrides,
  };
}

export const tasksResult = (tasks: TaskView[]): GetTasksResultView => ({ tasks, total: tasks.length });

// --- Calendar API (@mairie360/calendar-api-openapi), read directly since MAIR-525 ---

/** An event of `GET /api/v1/calendar` (list view). `start` / `end` are UTC instants. */
export function eventView(id: number, overrides: Partial<EventView> = {}): EventView {
  return {
    id, name: `Événement ${id}`, start: '2026-09-08T08:00:00Z', end: '2026-09-08T09:00:00Z',
    category: EventCategory.meeting, visibility: EventVisibility.Private, is_member: true, location: null, service: null,
    recurrence: null, ...overrides,
  };
}

export const calendarResult = (events: EventView[]): GetCalendarResultView => ({ events });

export const JWT_SECRET = 'message-contract-test-secret';

/**
 * HS256 session token of `sub` signed with `secret` (fixed expiry, so a token is the same in every call). `claims`
 * adds claims, such as the `role` Core signs (MAIR-529); without it the token predates that claim.
 */
export function sessionToken(sub: string | number, secret = JWT_SECRET, exp = 4_102_444_800, claims: object = {}): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: String(sub), exp, ...claims })}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

/** `Authorization` header of the session of `userId`: verified by the BFF, forwarded unchanged upstream. */
export function authorizationFor(userId: number): string {
  return `Bearer ${tokenFor(userId)}`;
}

export function tokenFor(userId: number): string {
  return sessionToken(userId);
}
