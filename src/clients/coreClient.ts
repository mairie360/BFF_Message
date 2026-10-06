import { getCoreAPIMairie360 } from '@mairie360/core-api-openapi/endpoints/coreAPIMairie360';
import type { DirectoryUser } from '@mairie360/core-api-openapi/model';
import { asCaller, callUpstream, withoutSession } from '@mairie360/bffs-lib';
import axios from 'axios';
import type { CallContext } from './context';

// The agents directory comes from Core API, through the operations of its published contract
// (@mairie360/core-api-openapi): the BFF has no database access. The base URL (CORE_API_URL +
// CORE_API_PORT) and the caller's token are given on every call (`asCaller`).
const coreApi = getCoreAPIMairie360(axios.create({ headers: { Accept: 'application/json' } }));

const CORE_API_TIMEOUT_MS = 5_000;

export type ContactUser = Pick<DirectoryUser, 'id' | 'first_name' | 'last_name' | 'email'> & Partial<Pick<DirectoryUser, 'roles'>>;

/** Directory listing (an idempotent GET: retried once on a transient failure). */
async function listDirectoryUsers(params: Parameters<typeof coreApi.listDirectoryUsers>[0], context: CallContext) {
  const response = await callUpstream(
    'CORE_API',
    () => coreApi.listDirectoryUsers(params, asCaller('CORE_API', context.req, CORE_API_TIMEOUT_MS)),
    { declared: context.declared, retry: true },
  );
  return response.data.users;
}

/** Non-archived agents, without the current user, sorted by last name then first name. */
export async function listContacts(
  search: string | undefined,
  limit: number | undefined,
  excludedUserId: number | undefined,
  context: CallContext,
): Promise<ContactUser[]> {
  const users = await listDirectoryUsers({ ...(search ? { search } : {}), ...(limit ? { limit } : {}) }, context);
  return users.filter((user) => user.id !== excludedUserId);
}

/** Longest `ids` query Core API accepts (comma-separated list, 255 characters at most). */
const MAX_IDS_QUERY_LENGTH = 255;

/** Splits `ids` into comma-separated lists of at most `MAX_IDS_QUERY_LENGTH` characters. */
export function idsQueries(ids: number[]): string[] {
  const queries: string[] = [];
  let current = '';

  for (const id of [...new Set(ids)]) {
    const next = current ? `${current},${id}` : String(id);
    if (next.length > MAX_IDS_QUERY_LENGTH && current) {
      queries.push(current);
      current = String(id);
    } else {
      current = next;
    }
  }
  if (current) queries.push(current);

  return queries;
}

/**
 * Agents by id (unknown ids are absent from the result): one call per `ids` list Core API accepts,
 * usually a single one.
 */
export async function listContactsByIds(ids: number[], context: CallContext): Promise<ContactUser[]> {
  const pages = await Promise.all(idsQueries(ids).map((query) => listDirectoryUsers({ ids: query }, context)));
  return pages.flat();
}

/** Agent `id`, or `undefined` when unknown or archived. */
export async function getContactUser(id: number, context: CallContext): Promise<ContactUser | undefined> {
  const [user] = await listContactsByIds([id], context);
  return user;
}

/** `/check_apis` probe: Core API's `/health`, without session. */
export function checkCoreApi(): Promise<unknown> {
  return coreApi.health(withoutSession('CORE_API', CORE_API_TIMEOUT_MS));
}
