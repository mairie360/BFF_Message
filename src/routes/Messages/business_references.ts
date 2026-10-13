import {
  PROJECT_TASK_MANAGER_ROLES, addDays, asCaller, callUpstream, createRateLimiter, hasRole, mapWithConcurrency, parisDate,
  requireSession, sessionKey, sessionRoles, sessionUserId, utcToWallClock, wallClockToUtc,
} from '@mairie360/bffs-lib';
import { Request, Router } from 'express';
import { z } from 'zod';
import { calendarApi, projectApi } from '../../clients/businessApiClients';
import { readCallerRoles } from '../../clients/coreClient';
import { errorResponses, registry } from '../../openapi-registry';
const router = Router();
export const BusinessReferencesSchema = registry.register('BusinessReferencesResponse', z.object({
  references: z.array(z.object({ id: z.string(), title: z.string(), kind: z.enum(['project', 'task', 'event']), description: z.string().optional() })),
  sources: z.object({ projects: z.enum(['available', 'unavailable']), calendar: z.enum(['available', 'unavailable']) }),
}));
registry.registerPath({ method: 'get', path: '/business-references', responses: {
  200: { description: 'References read from Project API and Calendar API (never another BFF)', content: { 'application/json': { schema: BusinessReferencesSchema } } },
  ...errorResponses({
    401: 'Missing session',
    429: 'Too many requests from this caller: retry after the delay given by `Retry-After`',
  }),
} });

/**
 * Bounds of the upstream calls of one `GET /business-references` (MAIR-400, MAIR-525): the project listing page
 * size, how many projects get their task list read (only projects whose listing reports active tasks), how many of
 * those lists are read at once, and the calendar window around today (< 1 year, one Calendar API call).
 */
export const PROJECTS_PAGE_LIMIT = 50;
export const MAX_PROJECT_DETAILS = 20;
export const PROJECT_DETAILS_CONCURRENCY = 4;
export const CALENDAR_WINDOW_HALF_DAYS = 182;

type BusinessReferenceKind = "project" | "task" | "event";

type BusinessReference = {
  id: string;
  title: string;
  kind: BusinessReferenceKind;
  description?: string;
};

/** Timeout of each call to Project API / Calendar API, in ms. */
const BUSINESS_API_TIMEOUT_MS = 8_000;
/** Read references: only a refused session (401) is worth relaying; the other failures degrade the source. */
const READ = { declared: [401], retry: true } as const;

/**
 * Whether the caller sees every task of a visible project (BFF_Project's rule), from the token or Core. Roles that
 * cannot be read fall back to the narrowest view (the caller's own tasks) rather than failing the projects.
 */
async function seesEveryTask(req: Request): Promise<boolean> {
  const roles = sessionRoles(req) ?? await readCallerRoles({ req, declared: [401] }).catch(() => []);
  return hasRole(roles, ...PROJECT_TASK_MANAGER_ROLES);
}

/**
 * The first visible projects, then the active tasks of those that have some (at most MAX_PROJECT_DETAILS lists,
 * PROJECT_DETAILS_CONCURRENCY at a time, until Project API lists the caller's tasks in one call, MAIR-524). Ids and
 * labels are those of BFF Project (`project-<id>`, `task-<id>`), so a reference made earlier still matches.
 */
async function loadProjectReferences(req: Request): Promise<BusinessReference[]> {
  const options = () => asCaller('PROJECT_API', req, BUSINESS_API_TIMEOUT_MS);
  const [page, everyTask] = await Promise.all([
    callUpstream('PROJECT_API', async () => (await projectApi.getProjects({ limit: PROJECTS_PAGE_LIMIT }, options())).data, READ),
    seesEveryTask(req),
  ]);
  const userId = sessionUserId(req);
  // The listing counts each project's tasks: only projects with active ones get their list read.
  const projectsWithTasks = page.projects
    .filter((project) => project.tasks_total > project.tasks_completed)
    .slice(0, MAX_PROJECT_DETAILS);
  // A list that fails (a project deleted since the listing...) only drops that project's tasks.
  const lists = await mapWithConcurrency(projectsWithTasks, PROJECT_DETAILS_CONCURRENCY, (project) =>
    callUpstream('PROJECT_API', async () => (await projectApi.getProjectTasks(project.id, { limit: 500 }, options())).data, READ)
      .catch(() => null));
  const taskReferences = projectsWithTasks.flatMap((project, index) => (lists[index]?.tasks ?? [])
    .filter((task) => everyTask || task.assigned_to === userId)
    .map((task) => ({
      id: `task:task-${task.id}`,
      title: task.title,
      kind: "task" as const,
      description: `Tâche · ${project.name}`,
    })));

  return [
    ...page.projects.map((project) => ({
      id: `project:project-${project.id}`,
      title: project.name,
      kind: "project" as const,
      description: "Projet",
    })),
    ...taskReferences,
  ];
}

/** About six months on each side of today (Paris day), so the whole window stays under one year. */
export function calendarDateRange(at: Date = new Date()) {
  const today = parisDate(at);

  return {
    from: addDays(today, -CALENDAR_WINDOW_HALF_DAYS),
    to: addDays(today, CALENDAR_WINDOW_HALF_DAYS),
  };
}

/** The caller's events of the window, from one Calendar API list (no detail per event, MAIR-525). */
async function loadCalendarReferences(req: Request): Promise<BusinessReference[]> {
  const { from, to } = calendarDateRange();
  const params = { start: wallClockToUtc(from, '00:00:00'), end: wallClockToUtc(to, '23:59:59') };
  const calendar = await callUpstream('CALENDAR_API', async () => (
    await calendarApi.getCalendar(params, asCaller('CALENDAR_API', req, BUSINESS_API_TIMEOUT_MS))
  ).data, READ);

  // Like BFF Calendar's views: the events the caller is a member of.
  return calendar.events.filter((event) => event.is_member).map((event) => ({
    id: `event:${event.id}`,
    title: event.name,
    kind: "event" as const,
    description: `Calendrier · ${utcToWallClock(event.start).date}`,
  }));
}

/**
 * Per-session limit of `GET /business-references`, which fans out to several upstream calls: every
 * request counts (not only failed ones). The key is the client IP plus `sessionKey` (a hash of the
 * Bearer token), never a JWT `sub` decoded without verification, which a caller could forge to use or
 * exhaust another user's counter. Counters live in memory, per replica.
 *
 * Environment: `BUSINESS_REFERENCES_RATE_LIMIT_MAX` (default 30) and `_WINDOW_MS` (default 1 minute);
 * `RATE_LIMIT_ENABLED=false` disables it (load tests).
 */
export function createBusinessReferencesRateLimiter() {
  const prefix = 'BUSINESS_REFERENCES_RATE_LIMIT';
  return createRateLimiter({
    envPrefix: prefix,
    // The lib's defaults (15 minutes, 10 requests) are meant for sign-in routes: keep this route's own.
    windowMs: process.env[`${prefix}_WINDOW_MS`] ? undefined : 60_000,
    limit: process.env[`${prefix}_MAX`] ? undefined : 30,
    failedOnly: false,
    keyOf: sessionKey,
    enabled: process.env.RATE_LIMIT_ENABLED?.trim().toLowerCase() !== 'false',
  });
}

// The session is checked before the rate limiter: an anonymous request costs no upstream call and
// consumes no counter. The caller's session is forwarded as `Bearer <token>`.
router.get('/', requireSession, createBusinessReferencesRateLimiter(), async (request, response) => {
  const results = await Promise.allSettled([
    loadProjectReferences(request),
    loadCalendarReferences(request),
  ]);
  const references = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  return response.json(
    {
      references,
      sources: {
        projects: results[0]?.status === "fulfilled" ? "available" : "unavailable",
        calendar: results[1]?.status === "fulfilled" ? "available" : "unavailable",
      },
    },
  );
});

export default router;
