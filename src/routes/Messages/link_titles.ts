import { asCaller, callUpstream, mapWithConcurrency } from '@mairie360/bffs-lib';
import type { Request } from 'express';
import type { MessageLinkView } from '@mairie360/message-api-openapi/model';
import { calendarApi, projectApi } from '../../clients/businessApiClients';

/**
 * Titles of the projects, tasks and events messages link to. Message API stores only the id of a linked object, so
 * the BFF reads each one from its API with the caller's token: the caller gets the title of what they may read, and
 * the current title after a rename. One read per distinct object of the messages, in a single bounded wave; an
 * object that cannot be read (deleted, not visible, API down or not configured) only has no title.
 */

/** Distinct objects whose title is read for one answer; the links past it keep their page without a title. */
export const MAX_LINK_TITLES = 50;
/** Reads in flight at once. */
export const LINK_TITLES_CONCURRENCY = 5;
const LINK_TITLE_TIMEOUT_MS = 3_000;
/** 403 / 404 are expected (an object the caller may not read, or deleted): not reported as upstream errors. */
const QUIET_READ = { declared: [401, 403, 404] } as const;

/** Key of a linked object in the title map: `project-12`, `task-5`, `event-7`, the id the BFF answers. */
export const linkKey = (link: Pick<MessageLinkView, 'kind' | 'id'>) => `${link.kind}-${link.id}`;

async function readTitle(req: Request, link: MessageLinkView): Promise<string | undefined> {
  if (link.kind === 'project') {
    const data = await callUpstream('PROJECT_API', async () => (
      await projectApi.getProject(link.id, { limit: 1 }, asCaller('PROJECT_API', req, LINK_TITLE_TIMEOUT_MS))
    ).data, QUIET_READ);
    return data.project.name;
  }
  if (link.kind === 'task') {
    if (link.project_id == null) return undefined;
    const projectId = link.project_id;
    const task = await callUpstream('PROJECT_API', async () => (
      await projectApi.getTask(projectId, link.id, asCaller('PROJECT_API', req, LINK_TITLE_TIMEOUT_MS))
    ).data, QUIET_READ);
    return task.title;
  }
  const event = await callUpstream('CALENDAR_API', async () => (
    await calendarApi.getEvent(link.id, asCaller('CALENDAR_API', req, LINK_TITLE_TIMEOUT_MS))
  ).data, QUIET_READ);
  return event.name;
}

/** The title of each object `links` name that the caller may read, by `linkKey`. Never rejects. */
export async function readLinkTitles(req: Request, links: MessageLinkView[]): Promise<Map<string, string>> {
  const distinct = new Map<string, MessageLinkView>();
  for (const link of links) {
    if (distinct.size >= MAX_LINK_TITLES) break;
    if (!distinct.has(linkKey(link))) distinct.set(linkKey(link), link);
  }
  const entries = [...distinct.entries()];
  const titles = await mapWithConcurrency(entries, LINK_TITLES_CONCURRENCY, async ([, link]) => {
    const title = await readTitle(req, link).catch(() => undefined);
    return title?.trim() ? title : undefined;
  });
  return new Map(entries.flatMap(([key], index) => (titles[index] ? [[key, titles[index]!] as const] : [])));
}
