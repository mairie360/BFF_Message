import { getCalendarAPIMairie360 } from '@mairie360/calendar-api-openapi/endpoints/calendarAPIMairie360';
import { getProjectAPIMairie360 } from '@mairie360/project-api-openapi/endpoints/projectAPIMairie360';
import axios from 'axios';

// Business references come from Project API and Calendar API directly, never from another BFF (MAIR-525), through
// the operations of their published contracts (@mairie360/project-api-openapi, @mairie360/calendar-api-openapi).
// The base URL (PROJECT_API_URL / CALENDAR_API_URL) and the caller's token are given on every call (`asCaller`).
const businessAxios = axios.create({ headers: { Accept: 'application/json' } });

export const projectApi = getProjectAPIMairie360(businessAxios);
export const calendarApi = getCalendarAPIMairie360(businessAxios);
