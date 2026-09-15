import type { ContactUser } from '../../src/repositories/contactsRepository';

// Jeux de données conformes aux contrats des services amont reconstruits depuis les paquets
// @mairie360/*-openapi installés (validés dans upstream-contracts.test.ts), et utilisateurs de la
// table PostgreSQL `users` (sans contrat OpenAPI). Les champs non lus par le BFF sont volontairement
// présents : ils doivent être ignorés.

type Overrides<T> = Partial<T> & Record<string, unknown>;

// --- Message API (@mairie360/message-api-openapi) ---

export function chatView(id: number, name = `Conversation ${id}`, unreadCount = 0) {
  return { id, name, unread_count: unreadCount };
}

export function chatsResult(chats: Array<ReturnType<typeof chatView>>) {
  return { chats };
}

export function messageView(id: number, senderId: number, overrides: Overrides<{ content: string; created_at: string; sitation: number | null }> = {}) {
  return { id, sender_id: senderId, content: `Message ${id}`, created_at: '2026-09-15T09:00:00Z', sitation: null, ...overrides };
}

export function chatResult(messages: Array<ReturnType<typeof messageView>>) {
  return { messages };
}

export function chatUsers(ids: number[]) {
  return { users: ids.map((id) => ({ id })) };
}

// --- PostgreSQL `users` (contacts) ---

export const users = {
  agent: { id: 7, first_name: 'Agent', last_name: 'Test', email: 'agent.test@mairie360.fr' },
  sophie: { id: 8, first_name: 'Sophie', last_name: 'Leroy', email: 'sophie.leroy@mairie360.fr' },
  thomas: { id: 9, first_name: 'Thomas', last_name: 'Bernard', email: null },
} satisfies Record<string, ContactUser>;

// --- BFF Project (@mairie360/bff-project-openapi) ---

export const person = (id: string, name = `Agent ${id}`) => ({ id, name, avatarUrl: null });

export type ProjectItem = ReturnType<typeof projectListItem>;
export function projectListItem(overrides: Overrides<{ id: string; title: string }> = {}) {
  return {
    id: 'project-1',
    title: 'Rénovation de la médiathèque',
    description: 'Travaux de mise aux normes',
    status: 'in-progress',
    statusLabel: 'En cours',
    priority: 'high',
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

export function projectsPageResponse(projects: ProjectItem[]) {
  return {
    access: { role: 'User', scope: 'assigned', canCreateProject: false, canManageProjects: false, canManageTasks: false, canUpdateAssignedTaskStatus: true, canCommentTasks: true },
    page: { title: 'Projets', subtitle: 'Suivi des projets', defaultView: 'grid', views: [{ value: 'grid', label: 'Grille' }] },
    filters: { search: null, status: 'all', priority: 'all', statuses: [{ label: 'Tous', value: 'all' }], priorities: [{ label: 'Toutes', value: 'all' }] },
    options: { members: [{ label: 'Alice Martin', value: 'user-2', name: 'Alice Martin', avatarUrl: null }], labels: [{ label: 'Travaux', value: 'travaux' }] },
    summary: { totalProjects: projects.length, projectsByStatus: { 'in-progress': projects.length }, projectsByPriority: { high: projects.length } },
    kanban: { columns: [{ status: 'in-progress', label: 'En cours', projectIds: projects.map((project) => project.id), count: projects.length }] },
    projects,
    pagination: { page: 1, limit: 100, total: projects.length, hasNextPage: false },
  };
}

export type TaskItem = ReturnType<typeof taskItem>;
export function taskItem(overrides: Overrides<{ id: string; title: string }> = {}) {
  return {
    id: 'task-1',
    title: 'Valider le devis',
    status: 'todo',
    statusLabel: 'À faire',
    responsible: person('user-2', 'Alice Martin'),
    assignees: [],
    priority: 'medium',
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

export function projectDetailsResponse(project: ProjectItem, taskItems: TaskItem[]) {
  return { project, taskItems };
}

// --- BFF Calendar (@mairie360/bff-calendar-openapi) ---

export function calendarEvent(overrides: Overrides<{ id: string | number; title: string; date: string }> = {}) {
  return {
    id: 1,
    title: 'Conseil municipal',
    date: '2026-09-20',
    endDate: '2026-09-20',
    category: 'meeting',
    service: 'direction',
    startTime: '18:00',
    endTime: '20:00',
    location: 'Salle du conseil',
    assigneeIds: [2],
    approvalStatus: 'approved',
    canEdit: false,
    ...overrides,
  };
}

export function calendarBootstrapResponse(events: unknown[]) {
  return {
    events,
    assignees: [{ id: 2, name: 'Alice Martin', email: 'alice.martin@mairie.test' }],
    categories: [{ label: 'Réunion', value: 'meeting' }],
    services: [{ label: 'Direction générale', value: 'direction' }],
    currentUser: { id: 2, name: 'Alice Martin', email: 'alice.martin@mairie.test', groupIds: [1] },
    assigneeScope: 'self',
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
