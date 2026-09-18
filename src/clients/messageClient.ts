import { getMessageAPIMairie360 } from '@mairie360/message-api-openapi/endpoints/messageAPIMairie360';
import axios from 'axios';
import { DEFAULT_JWT_TOKEN } from '../config/token';

function normalizeBaseUrl(baseUrl: string): string {
    return /^https?:\/\//.test(baseUrl) ? baseUrl : `http://${baseUrl}`;
}

// 1. Créer l'instance Axios dédiée au service distant
const apiClientInstance = axios.create({
    baseURL: normalizeBaseUrl(process.env.MESSAGE_API_BASE_PATH || 'localhost:3003'),
    timeout: 5000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Intercepteur pour injecter automatiquement le token
apiClientInstance.interceptors.request.use(
    (config) => {
        const currentAuth = config.headers.Authorization;

        // Si aucun token n'est fourni par l'appel Orval, on met celui par défaut
        if (!currentAuth && DEFAULT_JWT_TOKEN) {
            config.headers.Authorization = DEFAULT_JWT_TOKEN.startsWith('Bearer ')
                ? DEFAULT_JWT_TOKEN
                : `Bearer ${DEFAULT_JWT_TOKEN}`;
        }

        console.log('Requête sortante vers :', config.baseURL + '' + config.url);
        return config; // <-- TRÈS IMPORTANT : Si cette ligne manque, Axios bloque !
    },
    (error) => {
        return Promise.reject(error);
    },
);

// Message API n'est appelée que par les opérations de son contrat publié (@mairie360/message-api-openapi).
const messageClient = getMessageAPIMairie360(apiClientInstance);

export default messageClient;
