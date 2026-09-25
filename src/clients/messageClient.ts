import { getMessageAPIMairie360 } from '@mairie360/message-api-openapi/endpoints/messageAPIMairie360';
import axios from 'axios';

function normalizeBaseUrl(baseUrl: string): string {
    return /^https?:\/\//.test(baseUrl) ? baseUrl : `http://${baseUrl}`;
}

// Dedicated axios instance for Message API
const apiClientInstance = axios.create({
    baseURL: normalizeBaseUrl(process.env.MESSAGE_API_BASE_PATH || 'localhost:3003'),
    timeout: 5000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// The caller's token is passed per call by the helpers (authOptions); no default token is injected.
apiClientInstance.interceptors.request.use(
    (config) => {
        console.log('Outgoing request to:', config.baseURL + '' + config.url);
        return config;
    },
    (error) => {
        return Promise.reject(error);
    },
);

// Message API n'est appelée que par les opérations de son contrat publié (@mairie360/message-api-openapi).
const messageClient = getMessageAPIMairie360(apiClientInstance);

export default messageClient;
