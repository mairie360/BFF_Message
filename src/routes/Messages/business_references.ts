import { Request, Router } from 'express';
import { z } from 'zod';
import { registry } from '../../openapi-registry';
const router = Router();
export const BusinessReferencesSchema = registry.register('BusinessReferencesResponse', z.object({
  references: z.array(z.object({ id: z.string(), title: z.string(), kind: z.enum(['project', 'task', 'event']), description: z.string().optional() })),
  sources: z.object({ projects: z.enum(['available', 'unavailable']), calendar: z.enum(['available', 'unavailable']) }),
}));
registry.registerPath({ method: 'get', path: '/business-references', responses: {
  200: { description: 'Références des BFF Projets et Calendrier', content: { 'application/json': { schema: BusinessReferencesSchema } } },
  401: { description: 'Session invalide' },
} });

type BusinessReferenceKind = "project" | "task" | "event";

type BusinessReference = {
  id: string;
  title: string;
  kind: BusinessReferenceKind;
  description?: string;
};

type ProjectListItem = {
  id: string;
  title: string;
};

type ProjectsPageResponse = {
  projects?: ProjectListItem[];
};

type ProjectTask = {
  id: string;
  title: string;
};

type ProjectDetailsResponse = {
  taskItems?: ProjectTask[];
};

type CalendarEvent = {
  id?: string | number;
  title: string;
  date?: string;
};

type CalendarBootstrapResponse = {
  events?: CalendarEvent[];
};

const DEFAULT_PROJECT_BFF_URL = "http://localhost:4001";
const DEFAULT_CALENDAR_BFF_URL = "http://localhost:4002";

function normalizedBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function getAuthorizationHeader(request: Request) {
  return request.headers.authorization;
}

async function fetchJson<T>(url: string, authorization?: string): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });

  if (authorization) headers.set("Authorization", authorization);

  const response = await fetch(url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`Upstream request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

async function loadProjectReferences(authorization?: string): Promise<BusinessReference[]> {
  const projectBaseUrl = normalizedBaseUrl(
    process.env.PROJECT_BFF_URL ?? DEFAULT_PROJECT_BFF_URL,
  );
  const projectsPage = await fetchJson<ProjectsPageResponse>(
    `${projectBaseUrl}/projects-page?limit=100`,
    authorization,
  );
  const projects = projectsPage.projects ?? [];
  const taskRequests = await Promise.allSettled(
    projects.map((project) =>
      fetchJson<ProjectDetailsResponse>(
        `${projectBaseUrl}/projects/${encodeURIComponent(project.id)}`,
        authorization,
      ),
    ),
  );
  const taskReferences = taskRequests.flatMap((result, projectIndex) => {
    if (result.status !== "fulfilled") return [];

    const project = projects[projectIndex];
    return (result.value.taskItems ?? []).map((task) => ({
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

function calendarDateRange() {
  const today = new Date();
  const from = new Date(Date.UTC(today.getUTCFullYear() - 1, 0, 1));
  const to = new Date(Date.UTC(today.getUTCFullYear() + 1, 11, 31));

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

async function loadCalendarReferences(authorization?: string): Promise<BusinessReference[]> {
  const calendarBaseUrl = normalizedBaseUrl(
    process.env.CALENDAR_BFF_URL ?? DEFAULT_CALENDAR_BFF_URL,
  );
  const { from, to } = calendarDateRange();
  const calendar = await fetchJson<CalendarBootstrapResponse>(
    `${calendarBaseUrl}/calendar/bootstrap?from=${from}&to=${to}`,
    authorization,
  );

  return (calendar.events ?? []).flatMap((event) => {
    if (event.id === undefined) return [];

    return [{
      id: `event:${String(event.id)}`,
      title: event.title,
      kind: "event" as const,
      description: event.date ? `Calendrier · ${event.date}` : "Calendrier",
    }];
  });
}

router.get('/', async (request, response) => {
  const authorization = getAuthorizationHeader(request);
  if (!authorization) return response.status(401).json({ error: { message: 'Session invalide.' } });
  const results = await Promise.allSettled([
    loadProjectReferences(authorization),
    loadCalendarReferences(authorization),
  ]);
  const references = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  return response.setHeader("Cache-Control", "no-store").json(
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
