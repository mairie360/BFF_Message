import { getCoreAPIMairie360 } from '@mairie360/core-api-openapi/endpoints/coreAPIMairie360';
import type { DirectoryUser } from '@mairie360/core-api-openapi/model';
import { baseUrl } from '@mairie360/bffs-lib';
import axios, { type AxiosRequestConfig } from 'axios';

// The agents directory comes from Core API, through the operations of its published contract
// (@mairie360/core-api-openapi): the BFF has no database access.
const coreApiAxios = axios.create({ timeout: 5_000, headers: { Accept: 'application/json' } });

const coreApi = getCoreAPIMairie360(coreApiAxios);

export type ContactUser = Pick<DirectoryUser, 'id' | 'first_name' | 'last_name' | 'email'> & Partial<Pick<DirectoryUser, 'roles'>>;

/** CORE_API_URL (+ CORE_API_PORT) read on every call: no localhost default, 503 when missing. */
function coreOptions(authorization?: string): AxiosRequestConfig {
  return {
    baseURL: baseUrl('CORE_API'),
    ...(authorization ? { headers: { Authorization: authorization } } : {}),
  };
}

/** Non-archived agents, without the current user, sorted by last name then first name. */
export async function listContacts(
  search: string | undefined,
  limit: number | undefined,
  excludedUserId: number | undefined,
  authorization: string,
): Promise<ContactUser[]> {
  const response = await coreApi.listDirectoryUsers(
    { ...(search ? { search } : {}), ...(limit ? { limit } : {}) },
    coreOptions(authorization),
  );

  return response.data.users.filter((user) => user.id !== excludedUserId);
}

/** Agents by id, in a single call (unknown ids are absent from the result). */
export async function listContactsByIds(
  ids: number[],
  authorization: string,
): Promise<ContactUser[]> {
  if (ids.length === 0) return [];

  const response = await coreApi.listDirectoryUsers(
    { ids: ids.join(',') },
    coreOptions(authorization),
  );

  return response.data.users;
}

/** Agent `id`, or `undefined` when unknown or archived. */
export async function getContactUser(
  id: number,
  authorization: string,
): Promise<ContactUser | undefined> {
  const [user] = await listContactsByIds([id], authorization);
  return user;
}

export async function checkCoreApi(): Promise<void> {
  await coreApi.health({ ...coreOptions(), timeout: 5_000 });
}
