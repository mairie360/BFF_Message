import { getBffCalendar } from '@mairie360/bff-calendar-openapi/endpoints/bffCalendar';
import { getBffProject } from '@mairie360/bff-project-openapi/endpoints/bffProject';
import axios, { type AxiosRequestConfig } from 'axios';

// Les références métier viennent des BFF Projets et Calendrier, par les opérations de leurs contrats
// publiés (@mairie360/bff-project-openapi, @mairie360/bff-calendar-openapi).
const businessAxios = axios.create({ timeout: 8_000, headers: { Accept: 'application/json' } });

export const projectBff = getBffProject(businessAxios);
export const calendarBff = getBffCalendar(businessAxios);

function normalizeBaseUrl(value: string): string {
  return (/^https?:\/\//i.test(value) ? value : `http://${value}`).replace(/\/+$/, '');
}

/** URL relue à chaque appel : les variables d'environnement peuvent changer sans redémarrage. */
export function projectBffOptions(authorization?: string): AxiosRequestConfig {
  return options(process.env.PROJECT_BFF_URL ?? 'http://localhost:4001', authorization);
}

export function calendarBffOptions(authorization?: string): AxiosRequestConfig {
  return options(process.env.CALENDAR_BFF_URL ?? 'http://localhost:4002', authorization);
}

function options(configured: string, authorization?: string): AxiosRequestConfig {
  return {
    baseURL: normalizeBaseUrl(configured),
    ...(authorization ? { headers: { Authorization: authorization } } : {}),
  };
}
