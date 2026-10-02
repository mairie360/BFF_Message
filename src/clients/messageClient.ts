import { getMessageAPIMairie360 } from '@mairie360/message-api-openapi/endpoints/messageAPIMairie360';
import axios from 'axios';

function normalizeBaseUrl(baseUrl: string): string {
    return /^https?:\/\//.test(baseUrl) ? baseUrl : `http://${baseUrl}`;
}

// Dedicated axios instance for Message API. MESSAGE_API_BASE_PATH is required: the server refuses to
// start without it (src/index.ts) rather than silently calling localhost.
const configuredBaseUrl = process.env.MESSAGE_API_BASE_PATH?.trim();
const apiClientInstance = axios.create({
    baseURL: configuredBaseUrl ? normalizeBaseUrl(configuredBaseUrl) : undefined,
    timeout: 5000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// The caller's token is passed per call by the helpers (authOptions); no default token is injected.
// Outgoing URLs are not logged: they carry conversation ids of every caller.

// Message API is only called through the operations of its published contract (@mairie360/message-api-openapi).
const messageClient = getMessageAPIMairie360(apiClientInstance);

export default messageClient;
