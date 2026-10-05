import { addDays, asCaller, createRateLimiter, parisDate, requireBearer, sessionKey } from '@mairie360/bffs-lib';
import { Request, Router } from 'express';
import { z } from 'zod';
import { calendarBff, projectBff } from '../../clients/businessBffClients';
import { errorResponses, registry } from '../../openapi-registry';
const router = Router();
export const BusinessReferencesSchema = registry.register('BusinessReferencesResponse', z.object({
  references: z.array(z.object({ id: z.string(), title: z.string(), kind: z.enum(['project', 'task', 'event']), description: z.string().optional() })),
  sources: z.object({ projects: z.enum(['available', 'unavailable']), calendar: z.enum(['available', 'unavailable']) }),
}));
registry.registerPath({ method: 'get', path: '/business-references', responses: {
  200: { description: 'Références des BFF Projets et Calendrier', content: { 'application/json': { schema: BusinessReferencesSchema } } },
  ...errorResponses({
    401: 'Missing session',
    429: 'Too many requests from this caller: retry after the delay given by `Retry-After`',
  }),
} });

/**
 * Bounds of the upstream fan-out of one `GET /business-references` (MAIR-400): the project listing
 * page size, how many projects get their tasks loaded (only projects whose listing reports tasks),
 * how many of those detail calls run at once, and the calendar window around today (≤ 1 year,
 * BFF Calendar refuses wider ranges).
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

/** `Promise.allSettled` over `items` with at most `concurrency` calls of `task` in flight. */
export async function settleWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: 'fulfilled', value: await task(items[index] as T) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/** Timeout of each call to BFF Project / BFF Calendar, in ms. */
const BUSINESS_BFF_TIMEOUT_MS = 8_000;

async function loadProjectReferences(req: Request): Promise<BusinessReference[]> {
  const options = asCaller('PROJECT_BFF', req, BUSINESS_BFF_TIMEOUT_MS);
  const projectsPage = await projectBff.getProjectsPage({ limit: PROJECTS_PAGE_LIMIT }, options);
  const projects = projectsPage.data.projects ?? [];
  // The listing already counts each project's tasks: only projects that have some are detailed, and
  // at most MAX_PROJECT_DETAILS of them, a few at a time, instead of one call per listed project.
  const projectsWithTasks = projects
    .filter((project) => (project.tasks?.total ?? 0) > 0)
    .slice(0, MAX_PROJECT_DETAILS);
  const taskRequests = await settleWithConcurrency(
    projectsWithTasks,
    PROJECT_DETAILS_CONCURRENCY,
    // The generated client inserts the parameter as is: the id is encoded here.
    (project) => projectBff.getProjectsProjectId(encodeURIComponent(project.id), options),
  );
  const taskReferences = taskRequests.flatMap((result, projectIndex) => {
    if (result.status !== "fulfilled") return [];

    const project = projectsWithTasks[projectIndex];
    return (result.value.data.taskItems ?? []).map((task) => ({
      id: `task:${task.id}`,
      title: task.title,
      kind: "task" as const,
      description: project ? `Tâche · ${project.title}` : "Tâche",
    }));
  });

  return [
    ...projects.map((project) => ({
      id: `project:${project.id}`,
      title: project.title,
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

async function loadCalendarReferences(req: Request): Promise<BusinessReference[]> {
  const { from, to } = calendarDateRange();
  // from and to are read by BFF Calendar but not declared yet by its published contract.
  const calendar = await calendarBff.getCalendarBootstrap({
    ...asCaller('CALENDAR_BFF', req, BUSINESS_BFF_TIMEOUT_MS),
    params: { from, to },
  });

  return (calendar.data.events ?? []).flatMap((event) => {
    if (event.id === undefined) return [];

    return [{
      id: `event:${String(event.id)}`,
      title: event.title,
      kind: "event" as const,
      description: event.date ? `Calendrier · ${event.date}` : "Calendrier",
    }];
  });
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
router.get('/', requireBearer, createBusinessReferencesRateLimiter(), async (request, response) => {
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
