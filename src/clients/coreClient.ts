import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { DEFAULT_JWT_TOKEN } from '../config/token';
import type {
    AddRoleToUserView,
    CreateUserView,
    GetMeResponseView,
    GetUserResponseView,
    PatchMeView,
    PatchUserView,
} from '@mairie360/core-api-openapi/models';

type UsersResponse = unknown;

function getUsers(axiosInstance: AxiosInstance) {
    const getMe = (options?: AxiosRequestConfig): Promise<AxiosResponse<GetMeResponseView>> => axiosInstance.get('/api/v1/user/me/', options);
    const patchMe = (
        patchMeView: PatchMeView,
        options?: AxiosRequestConfig,
    ): Promise<AxiosResponse<void>> => axiosInstance.patch('/api/v1/user/me/', patchMeView, options);
    const getUser = (
        id: number,
        options?: AxiosRequestConfig,
    ): Promise<AxiosResponse<GetUserResponseView>> => axiosInstance.get(`/api/v1/user/${id}/`, options);

    return {
        getMe,
        patchMe,
        getUser,
    };
}

function getAdminUsers(axiosInstance: AxiosInstance) {
    const adminGetUsers = (options?: AxiosRequestConfig): Promise<AxiosResponse<UsersResponse>> => axiosInstance.get('/api/v1/admin/users/', options);
    const adminPostUser = (
        createUserView: CreateUserView,
        options?: AxiosRequestConfig,
    ): Promise<AxiosResponse<void>> => axiosInstance.post('/api/v1/admin/users/', createUserView, options);
    const adminPatchUser = (
        userId: number,
        patchUserView: PatchUserView,
        options?: AxiosRequestConfig,
    ): Promise<AxiosResponse<void>> => axiosInstance.patch(`/api/v1/admin/users/${userId}/`, patchUserView, options);
    const adminAddRoleToUser = (
        userId: number,
        addRoleToUserView: AddRoleToUserView,
        options?: AxiosRequestConfig,
    ): Promise<AxiosResponse<void>> => axiosInstance.post(`/api/v1/admin/users/${userId}/roles/`, addRoleToUserView, options);
    const adminDeleteUserRole = (
        userId: number,
        roleId: number,
        options?: AxiosRequestConfig,
    ): Promise<AxiosResponse<void>> => axiosInstance.delete(`/api/v1/admin/users/${userId}/roles/${roleId}`, options);

    return {
        adminGetUsers,
        adminPostUser,
        adminPatchUser,
        adminAddRoleToUser,
        adminDeleteUserRole,
    };
}

type CoreClient = ReturnType<typeof getUsers> & ReturnType<typeof getAdminUsers>;

function normalizeBaseUrl(baseUrl: string): string {
    return /^https?:\/\//.test(baseUrl) ? baseUrl : `http://${baseUrl}`;
}

function buildCoreBaseUrl(): string {
    const baseUrl = process.env.CORE_API_BASE_URL ?? process.env.CORE_API_URL ?? 'localhost:3000';
    const port = process.env.CORE_API_PORT;
    const normalized = normalizeBaseUrl(baseUrl);

    if (!port || /:\d+(\/|$)/.test(normalized)) {
        return normalized;
    }

    return `${normalized}:${port}`;
}

const apiClientInstance = axios.create({
    baseURL: buildCoreBaseUrl(),
    timeout: 5000,
    headers: {
        'Content-Type': 'application/json',
    },
});

apiClientInstance.interceptors.request.use(
    (config) => {
        const currentAuth = config.headers.Authorization;

        if (!currentAuth && DEFAULT_JWT_TOKEN) {
            config.headers.Authorization = DEFAULT_JWT_TOKEN.startsWith('Bearer ')
                ? DEFAULT_JWT_TOKEN
                : `Bearer ${DEFAULT_JWT_TOKEN}`;
        }

        console.log('Requête sortante vers :', config.baseURL + '' + config.url);
        return config;
    },
    (error) => {
        return Promise.reject(error);
    },
);

const coreClient: CoreClient = {
    ...getUsers(apiClientInstance),
    ...getAdminUsers(apiClientInstance),
};

console.log('Core API Base Path:', apiClientInstance.defaults.baseURL);

export default coreClient;
