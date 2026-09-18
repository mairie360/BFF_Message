import { getCoreAPIMairie360 } from '@mairie360/core-api-openapi/endpoints/coreAPIMairie360';
import type { DirectoryUser } from '@mairie360/core-api-openapi/model';
import axios, { type AxiosRequestConfig } from 'axios';
import { getAuthorizationHeader } from '../config/token';

// L'annuaire des agents vient de Core API, par les opérations de son contrat publié
// (@mairie360/core-api-openapi) : le BFF n'interroge plus la table `users` directement.
const coreApiAxios = axios.create({ timeout: 5_000, headers: { Accept: 'application/json' } });

const coreApi = getCoreAPIMairie360(coreApiAxios);

export type ContactUser = Pick<DirectoryUser, 'id' | 'first_name' | 'last_name' | 'email'>;

function normalizeBaseUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `http://${value}`;
}

/** URL relue à chaque appel : les variables d'environnement peuvent changer sans redémarrage. */
function coreOptions(incomingRequestToken?: string): AxiosRequestConfig {
  const url = new URL(normalizeBaseUrl(process.env.CORE_API_URL ?? 'localhost'));
  if (!url.port && process.env.CORE_API_PORT) url.port = process.env.CORE_API_PORT;
  const authorization = getAuthorizationHeader(incomingRequestToken);

  return {
    baseURL: url.toString().replace(/\/+$/, ''),
    ...(authorization ? { headers: { Authorization: authorization } } : {}),
  };
}

/** Agents non archivés, hors utilisateur connecté, triés par nom puis prénom. */
export async function listContacts(
  search: string | undefined,
  limit: number | undefined,
  excludedUserId: number | undefined,
  incomingRequestToken?: string,
): Promise<ContactUser[]> {
  const response = await coreApi.listDirectoryUsers(
    { ...(search ? { search } : {}), ...(limit ? { limit } : {}) },
    coreOptions(incomingRequestToken),
  );

  return response.data.users.filter((user) => user.id !== excludedUserId);
}

/** Agents demandés par identifiant, en un seul appel (les inconnus sont absents du résultat). */
export async function listContactsByIds(
  ids: number[],
  incomingRequestToken?: string,
): Promise<ContactUser[]> {
  if (ids.length === 0) return [];

  const response = await coreApi.listDirectoryUsers(
    { ids: ids.join(',') },
    coreOptions(incomingRequestToken),
  );

  return response.data.users;
}

/** Agent d'identifiant `id`, ou `undefined` s'il est inconnu ou archivé. */
export async function getContactUser(
  id: number,
  incomingRequestToken?: string,
): Promise<ContactUser | undefined> {
  const [user] = await listContactsByIds([id], incomingRequestToken);
  return user;
}

export async function checkCoreApi(): Promise<void> {
  await coreApi.health({ ...coreOptions(), timeout: 5_000 });
}
