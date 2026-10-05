import { getBffCalendar } from '@mairie360/bff-calendar-openapi/endpoints/bffCalendar';
import { getBffProject } from '@mairie360/bff-project-openapi/endpoints/bffProject';
import { baseUrl } from '@mairie360/bffs-lib';
import axios, { type AxiosRequestConfig } from 'axios';

// Business references come from BFF Project and BFF Calendar, through the operations of their
// published contracts (@mairie360/bff-project-openapi, @mairie360/bff-calendar-openapi).
const businessAxios = axios.create({ timeout: 8_000, headers: { Accept: 'application/json' } });

export const projectBff = getBffProject(businessAxios);
export const calendarBff = getBffCalendar(businessAxios);

/** PROJECT_BFF_URL (+ _PORT) read on every call: no localhost default, 503 when missing. */
export function projectBffOptions(authorization: string): AxiosRequestConfig {
  return { baseURL: baseUrl('PROJECT_BFF'), headers: { Authorization: authorization } };
}

/** CALENDAR_BFF_URL (+ _PORT) read on every call: no localhost default, 503 when missing. */
export function calendarBffOptions(authorization: string): AxiosRequestConfig {
  return { baseURL: baseUrl('CALENDAR_BFF'), headers: { Authorization: authorization } };
}
