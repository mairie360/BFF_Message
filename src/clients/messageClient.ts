import axios from 'axios';
import type {
    AxiosInstance,
    AxiosRequestConfig,
    AxiosResponse,
} from 'axios';
import { DEFAULT_JWT_TOKEN } from '../config/token';
import type {
    CreateChatResultView,
    CreateChatView,
    GetChatResultView,
    GetChatsResultView,
    GetUsersView,
    PostMessageResultView,
    PostMessageView,
} from '@mairie360/message-api-openapi/model';

function getMessageApi(axiosInstance: AxiosInstance) {
    const getChats = (options?: AxiosRequestConfig): Promise<AxiosResponse<GetChatsResultView>> => axiosInstance.get('/v1/', options);
    const createChat = (
        createChatView: CreateChatView,
        options?: AxiosRequestConfig,
    ): Promise<AxiosResponse<CreateChatResultView>> => axiosInstance.post('/v1/', createChatView, options);
    const getChat = (
        chatId: number,
        options?: AxiosRequestConfig,
    ): Promise<AxiosResponse<GetChatResultView>> => axiosInstance.get(`/v1/${chatId}/`, options);
    const deleteChat = (chatId: number, options?: AxiosRequestConfig): Promise<AxiosResponse<void>> => axiosInstance.delete(`/v1/${chatId}/`, options);
    const postMessage = (
        chatId: number,
        postMessageView: PostMessageView,
        options?: AxiosRequestConfig,
    ): Promise<AxiosResponse<PostMessageResultView>> => axiosInstance.post(`/v1/${chatId}/messages/`, postMessageView, options);
    const getChatUsers = (
        chatId: number,
        options?: AxiosRequestConfig,
    ): Promise<AxiosResponse<GetUsersView>> => axiosInstance.get(`/v1/${chatId}/users/`, options);

    return {
        getChats,
        createChat,
        getChat,
        deleteChat,
        postMessage,
        getChatUsers,
    };
}

function normalizeBaseUrl(baseUrl: string): string {
    return /^https?:\/\//.test(baseUrl) ? baseUrl : `http://${baseUrl}`;
}

// 1. Créer l'instance Axios dédiée au service distant
const apiClientInstance = axios.create({
    baseURL: normalizeBaseUrl(process.env.MESSAGE_API_BASE_PATH || 'localhost:8080/api'),
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

// 2. Injecter l'instance dans le code généré par Orval
const messageClient = getMessageApi(apiClientInstance);

console.log('Message API Base Path:', apiClientInstance.defaults.baseURL);

export default messageClient;
