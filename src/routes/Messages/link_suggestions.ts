import { parseRequest, requireSession } from '@mairie360/bffs-lib';
import { Router } from 'express';
import type { z } from 'zod';
import { errorResponses, LinkSuggestionsQuery, LinkSuggestionsResponse, registry } from '../../openapi-registry';
import {
  type BusinessReference, createBusinessReferencesRateLimiter, loadCalendarReferences, loadProjectReferences,
} from './business_references';
import { businessObjectUrl, foldText } from './message_helpers';

/**
 * `#` suggestions of the composer (MAIR-1154): the business references the caller may read (projects, tasks, events,
 * read from Project API and Calendar API like `GET /business-references`), filtered by title, with the page of each
 * object in its front when `PROJECT_FRONT_URL` / `CALENDAR_FRONT_URL` is set.
 */
const router = Router();

/** Most suggestions answered at once. */
export const MAX_LINK_SUGGESTIONS = 50;

registry.registerPath({
  method: 'get',
  path: '/link-suggestions',
  tags: ['Messages'],
  summary: 'What the caller may link a message to after #',
  description: 'The projects, tasks and events the caller may read whose title contains `q` (case- and accent-insensitive, at most '
    + `${MAX_LINK_SUGGESTIONS}), with the id to send in \`links\` and the page of the object in its front. A source that fails `
    + 'is reported `unavailable` and contributes nothing. Rate limited per session like `GET /business-references`.',
  request: { query: LinkSuggestionsQuery },
  responses: {
    200: { description: 'The suggestions', content: { 'application/json': { schema: LinkSuggestionsResponse } } },
    ...errorResponses({
      400: 'Invalid query (details lists the invalid fields)',
      401: 'Missing session',
      429: 'Too many requests from this caller: retry after the delay given by `Retry-After`',
    }),
  },
});

type LinkSuggestion = z.infer<typeof LinkSuggestionsResponse>['items'][number];

/** `project:project-12`, `task:task-5`, `event:7` (the ids of the business references) as a link suggestion. */
export function toLinkSuggestion(reference: BusinessReference): LinkSuggestion | null {
  const id = Number(/(\d+)$/.exec(reference.id)?.[1]);
  if (!Number.isSafeInteger(id)) return null;
  const url = businessObjectUrl(reference.kind, id);
  return {
    id: `${reference.kind}-${id}`,
    kind: reference.kind,
    title: reference.title,
    ...(reference.description ? { detail: reference.description } : {}),
    ...(url ? { url } : {}),
  };
}

router.get('/', requireSession, createBusinessReferencesRateLimiter(), async (req, res) => {
  const { q } = parseRequest(LinkSuggestionsQuery, req.query, 'query');
  const needle = foldText(q ?? '');
  const [projects, calendar] = await Promise.allSettled([loadProjectReferences(req), loadCalendarReferences(req)]);
  const references = [projects, calendar].flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  const items = references
    .filter((reference) => foldText(reference.title).includes(needle))
    .flatMap((reference) => toLinkSuggestion(reference) ?? [])
    .slice(0, MAX_LINK_SUGGESTIONS);

  res.json({
    items,
    sources: {
      projects: projects.status === 'fulfilled' ? 'available' : 'unavailable',
      calendar: calendar.status === 'fulfilled' ? 'available' : 'unavailable',
    },
  });
});

export default router;
