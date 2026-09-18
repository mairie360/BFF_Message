import { AxiosHeaders, type AxiosResponse } from 'axios';
import { getMessageAPIMairie360 } from '@mairie360/message-api-openapi/endpoints/messageAPIMairie360';
import type {
  ChatView, CreateChatResultView, GetChatResultView, GetChatsResultView, GetUsersView, MessageView, PostMessageResultView,
} from '@mairie360/message-api-openapi/model';
import { getCoreAPIMairie360 } from '@mairie360/core-api-openapi/endpoints/coreAPIMairie360';
import type { DirectoryUser, DirectoryUsersResultView } from '@mairie360/core-api-openapi/model';
import { getBffProject } from '@mairie360/bff-project-openapi/endpoints/bffProject';
import {
  type ApiError as ProjectBffError,
  type Person,
  type ProjectDetailsResponse,
  type ProjectListItem,
  ProjectListItemPriority,
  ProjectListItemStatus,
  type ProjectsPageResponse,
  ProjectsPageResponseAccessRole,
  ProjectsPageResponseAccessScope,
  ProjectsPageResponseKanbanColumnsItemStatus,
  ProjectsPageResponsePageDefaultView,
  ProjectsPageResponsePageViewsItemValue,
  type ProjectTask,
  ProjectTaskPriority,
  ProjectTaskStatus,
} from '@mairie360/bff-project-openapi/model';
import { getBffCalendar } from '@mairie360/bff-calendar-openapi/endpoints/bffCalendar';
import {
  type CalendarBootstrapResponse,
  CalendarBootstrapResponseAssigneeScope,
  type CalendarEvent,
  CalendarEventApprovalStatus,
  CalendarEventCategory,
} from '@mairie360/bff-calendar-openapi/model';
import type { ContactUser } from '../../src/clients/coreClient';

// Jeux de données typés par les modèles des paquets @mairie360/*-openapi installés : un champ ajouté,
// retiré ou renommé par un contrat amont fait échouer la compilation des tests. Les valeurs sont en plus
// validées à l'exécution contre les contrats reconstruits (upstream-contracts.test.ts, mocks HTTP).
// Les champs non lus par le BFF sont présents parce que les modèles les exigent : ils doivent être ignorés.

// --- Chemins des opérations amont, tels que les construisent les clients générés (helpers `get*Url`) ---

export const messageApiUrls = getMessageAPIMairie360();
export const coreApiUrls = getCoreAPIMairie360();
export const projectBffUrls = getBffProject();
export const calendarBffUrls = getBffCalendar();

/** Réponse axios complète telle que la renvoient les clients générés (`*Result`), pour les mocks de module. */
export function axiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
  return { data, status, statusText: 'OK', headers: {}, config: { headers: new AxiosHeaders() } };
}

// --- Message API (@mairie360/message-api-openapi) ---

export function chatView(id: number, name = `Conversation ${id}`, unread_count = 0): ChatView {
  return { id, name, unread_count };
}

export function chatsResult(chats: ChatView[]): GetChatsResultView {
  return { chats };
}

export function messageView(id: number, sender_id: number, overrides: Partial<MessageView> = {}): MessageView {
  return { id, sender_id, content: `Message ${id}`, created_at: '2026-09-15T09:00:00Z', sitation: null, ...overrides };
}

export function chatResult(messages: MessageView[]): GetChatResultView {
  return { messages };
}

export function chatUsers(ids: number[]): GetUsersView {
  return { users: ids.map((id) => ({ id })) };
}

export function createChatResult(id: number): CreateChatResultView {
  return { id };
}

export function postMessageResult(id: number): PostMessageResultView {
  return { id };
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

// --- BFF Project (@mairie360/bff-project-openapi) ---

export const person = (id: string, name = `Agent ${id}`): Person => ({ id, name, avatarUrl: null });

export function projectListItem(overrides: Partial<ProjectListItem> = {}): ProjectListItem {
  return {
    id: 'project-1',
    title: 'Rénovation de la médiathèque',
    description: 'Travaux de mise aux normes',
    status: ProjectListItemStatus['in-progress'],
    statusLabel: 'En cours',
    priority: ProjectListItemPriority.high,
    priorityLabel: 'Haute',
    responsible: person('user-2', 'Alice Martin'),
    assignees: [person('user-3')],
    labels: ['travaux'],
    progress: 40,
    dueDate: '2026-12-01',
    createdAt: '2026-01-10T08:00:00Z',
    tasks: { total: 3, completed: 1 },
    permissions: { canView: true, canEdit: false, canDuplicate: false, canDelete: false, canCreateTask: false, canAssignMembers: false, canClose: false },
    ...overrides,
  };
}

export function projectsPageResponse(projects: ProjectListItem[]): ProjectsPageResponse {
  return {
    access: {
      role: ProjectsPageResponseAccessRole.User,
      scope: ProjectsPageResponseAccessScope.assigned,
      canCreateProject: false,
      canManageProjects: false,
      canManageTasks: false,
      canUpdateAssignedTaskStatus: true,
      canCommentTasks: true,
    },
    page: {
      title: 'Projets',
      subtitle: 'Suivi des projets',
      defaultView: ProjectsPageResponsePageDefaultView.grid,
      views: [{ value: ProjectsPageResponsePageViewsItemValue.grid, label: 'Grille' }],
    },
    filters: { search: null, status: 'all', priority: 'all', statuses: [{ label: 'Tous', value: 'all' }], priorities: [{ label: 'Toutes', value: 'all' }] },
    options: { members: [{ label: 'Alice Martin', value: 'user-2', name: 'Alice Martin', avatarUrl: null }], labels: [{ label: 'Travaux', value: 'travaux' }] },
    summary: { totalProjects: projects.length, projectsByStatus: { 'in-progress': projects.length }, projectsByPriority: { high: projects.length } },
    kanban: {
      columns: [{
        status: ProjectsPageResponseKanbanColumnsItemStatus['in-progress'],
        label: 'En cours',
        projectIds: projects.map((project) => project.id),
        count: projects.length,
      }],
    },
    projects,
    pagination: { page: 1, limit: 100, total: projects.length, hasNextPage: false },
  };
}

export function taskItem(overrides: Partial<ProjectTask> = {}): ProjectTask {
  return {
    id: 'task-1',
    title: 'Valider le devis',
    status: ProjectTaskStatus.todo,
    statusLabel: 'À faire',
    responsible: person('user-2', 'Alice Martin'),
    assignees: [],
    priority: ProjectTaskPriority.medium,
    priorityLabel: 'Moyenne',
    labels: [],
    dueDate: '2026-10-01',
    completed: false,
    createdAt: '2026-01-11T08:00:00Z',
    updatedAt: '2026-01-12T08:00:00Z',
    permissions: { canView: true, canEdit: false, canDelete: false, canUpdateStatus: true, canComment: true },
    ...overrides,
  };
}

export function projectDetailsResponse(project: ProjectListItem, taskItems: ProjectTask[]): ProjectDetailsResponse {
  return { project, taskItems };
}

/** Corps d'erreur de BFF Project (ApiError de son contrat). */
export function projectBffError(code: string, message: string): ProjectBffError {
  return { error: { code, message, details: [] } };
}

// --- BFF Calendar (@mairie360/bff-calendar-openapi) ---

export function calendarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 1,
    title: 'Conseil municipal',
    date: '2026-09-20',
    endDate: '2026-09-20',
    category: CalendarEventCategory.meeting,
    service: 'direction',
    startTime: '18:00',
    endTime: '20:00',
    location: 'Salle du conseil',
    assigneeIds: [2],
    approvalStatus: CalendarEventApprovalStatus.approved,
    canEdit: false,
    ...overrides,
  };
}

export function calendarBootstrapResponse(events: CalendarEvent[]): CalendarBootstrapResponse {
  return {
    events,
    assignees: [{ id: 2, name: 'Alice Martin', email: 'alice.martin@mairie.test' }],
    categories: [{ label: 'Réunion', value: CalendarEventCategory.meeting }],
    services: [{ label: 'Direction générale', value: 'direction' }],
    currentUser: { id: 2, name: 'Alice Martin', email: 'alice.martin@mairie.test', groupIds: [1] },
    assigneeScope: CalendarBootstrapResponseAssigneeScope.self,
  };
}

// --- Session ---

/** JWT non signé : les services amont (simulés) vérifient la signature, le BFF ne lit que `sub`. */
export function authorizationFor(userId: number): string {
  return `Bearer ${tokenFor(userId)}`;
}

export function tokenFor(userId: number): string {
  return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: String(userId) })).toString('base64url')}.signature`;
}
