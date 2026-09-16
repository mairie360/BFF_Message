import { Request, Router } from 'express';
import { z } from 'zod';
import {
  calendarBff,
  calendarBffOptions,
  projectBff,
  projectBffOptions,
} from '../../clients/businessBffClients';
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

function getAuthorizationHeader(request: Request) {
  return request.headers.authorization;
}

async function loadProjectReferences(authorization?: string): Promise<BusinessReference[]> {
  const options = projectBffOptions(authorization);
  const projectsPage = await projectBff.getProjectsPage({ limit: 100 }, options);
  const projects = projectsPage.data.projects ?? [];
  const taskRequests = await Promise.allSettled(
    // Le client généré insère le paramètre tel quel : l'identifiant est encodé ici.
    projects.map((project) =>
      projectBff.getProjectsProjectId(encodeURIComponent(project.id), options),
    ),
  );
  const taskReferences = taskRequests.flatMap((result, projectIndex) => {
    if (result.status !== "fulfilled") return [];

    const project = projects[projectIndex];
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
  const { from, to } = calendarDateRange();
  // from et to sont lus par BFF Calendar mais pas encore déclarés par son contrat publié.
  const calendar = await calendarBff.getCalendarBootstrap({
    ...calendarBffOptions(authorization),
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
