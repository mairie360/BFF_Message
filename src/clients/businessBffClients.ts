import { getBffCalendar } from '@mairie360/bff-calendar-openapi/endpoints/bffCalendar';
import { getBffProject } from '@mairie360/bff-project-openapi/endpoints/bffProject';
import axios from 'axios';

// Business references come from BFF Project and BFF Calendar, through the operations of their
// published contracts (@mairie360/bff-project-openapi, @mairie360/bff-calendar-openapi). The base URL
// (PROJECT_BFF_URL / CALENDAR_BFF_URL) and the caller's token are given on every call (`asCaller`).
const businessAxios = axios.create({ headers: { Accept: 'application/json' } });

export const projectBff = getBffProject(businessAxios);
export const calendarBff = getBffCalendar(businessAxios);
