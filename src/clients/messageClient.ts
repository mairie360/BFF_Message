import axios from 'axios';

function buildMessageBaseUrl(): string {
    const baseUrl = process.env.MESSAGE_API_BASE_URL ?? process.env.MESSAGE_API_URL ?? 'http://localhost:3000';
    const port = process.env.MESSAGE_API_PORT;

    if (!port || /^https?:\/\//.test(baseUrl) && /:\d+(\/|$)/.test(baseUrl)) {
        return baseUrl;
    }

    const normalized = /^https?:\/\//.test(baseUrl) ? baseUrl : `http://${baseUrl}`;
    return `${normalized}:${port}`;
}

const messageClient = axios.create({
    baseURL: buildMessageBaseUrl(),
    timeout: 5000,
});

export default messageClient;
