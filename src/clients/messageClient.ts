import { getMessageAPIMairie360 } from '@mairie360/message-api-openapi/endpoints/messageAPIMairie360';
import axios from 'axios';

// Dedicated axios instance for Message API: only instance-level settings live here. The base URL is
// read on every call from MESSAGE_API_URL (+ MESSAGE_API_PORT) by the helpers (`baseUrl('MESSAGE_API')`),
// never frozen at import time, and the caller's token is passed per call: no default token is injected.
// Outgoing URLs are not logged: they carry conversation ids of every caller.
const apiClientInstance = axios.create({
    timeout: 5000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Message API is only called through the operations of its published contract (@mairie360/message-api-openapi).
const messageClient = getMessageAPIMairie360(apiClientInstance);

export default messageClient;
