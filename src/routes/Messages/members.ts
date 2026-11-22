import { parseRequest } from '@mairie360/bffs-lib';
import { Router } from 'express';
import {
    registry,
    AddMembersBody,
    ConversationIdParams,
    ConversationSearchQuery,
    ConversationSearchResponse,
    LeftConversationIdParams,
    MembersChangeResponse,
    MembersResponse,
    MentionSuggestionsQuery,
    MentionSuggestionsResponse,
    RemovedMemberParams,
    WrittenConversationIdParams,
    errorResponses,
} from '../../openapi-registry';
import {
    addMembers,
    fetchMembers,
    fetchMentionSuggestions,
    leaveConversation,
    removeMember,
    searchConversation,
} from './message_helpers';

/** Members of a conversation, search and `@` suggestions (MAIR-1154, messaging V2). Mounted at `/conversations`. */
const router = Router();

const upstreamFailures = {
    502: 'Message API is unavailable or failed',
    503: 'Message API is not configured on the BFF',
};

registry.registerPath({
    method: 'get',
    path: '/conversations/{conversationId}/members',
    tags: ['Members'],
    summary: 'List the members of a conversation',
    description: 'Every member with their name and whether they administer the group (its creator, while a member), and whether the '
        + 'caller may add and remove members (`canManage`).',
    request: { params: ConversationIdParams },
    responses: {
        200: { description: 'The members of the conversation', content: { 'application/json': { schema: MembersResponse } } },
        ...errorResponses({
            400: 'Invalid conversation id',
            401: 'Missing or invalid session',
            404: 'Unknown conversation, or the caller is not one of its members',
            ...upstreamFailures,
        }),
    },
});

registry.registerPath({
    method: 'post',
    path: '/conversations/{conversationId}/members',
    tags: ['Members'],
    summary: 'Add members to a group conversation',
    description: 'The administrator of the group (or a platform administrator) adds agents. The conversation records a system note '
        + '(`members_added`), answered as `systemMessage`; every member gets a `members_changed` stream event.',
    request: {
        params: WrittenConversationIdParams,
        body: { required: true, content: { 'application/json': { schema: AddMembersBody } } },
    },
    responses: {
        200: { description: 'The members after the change and the system note', content: { 'application/json': { schema: MembersChangeResponse } } },
        ...errorResponses({
            400: 'Invalid conversation id or body (details lists the invalid fields), or an unknown agent',
            401: 'Missing or invalid session',
            403: 'The caller does not administer the group',
            404: 'Unknown conversation, or the caller is not one of its members',
            409: 'An agent is already a member, or the conversation is a direct one (its participants never change)',
            ...upstreamFailures,
        }),
    },
});

registry.registerPath({
    method: 'delete',
    path: '/conversations/{conversationId}/members/{userId}',
    tags: ['Members'],
    summary: 'Remove a member from a group conversation',
    description: 'The administrator of the group (or a platform administrator) removes another member; the caller leaves with '
        + '`POST /conversations/{conversationId}/leave`. The conversation records a system note (`member_removed`), answered as '
        + '`systemMessage`; the members and the removed agent get a `members_changed` stream event.',
    request: { params: RemovedMemberParams },
    responses: {
        200: { description: 'The members after the change and the system note', content: { 'application/json': { schema: MembersChangeResponse } } },
        ...errorResponses({
            400: 'Invalid ids, or `userId` is the caller (use the leave route)',
            401: 'Missing or invalid session',
            403: 'The caller does not administer the group, or the conversation is a direct one',
            404: 'Unknown conversation, the caller is not one of its members, or the agent is not a member',
            ...upstreamFailures,
        }),
    },
});

registry.registerPath({
    method: 'post',
    path: '/conversations/{conversationId}/leave',
    tags: ['Members'],
    summary: 'Leave a conversation',
    description: 'The caller leaves a group (a system note `member_left` is recorded, the group is deleted with its last member) '
        + 'or hides a direct conversation from their list (it comes back with the next message).',
    request: { params: LeftConversationIdParams },
    responses: {
        204: { description: 'The caller left the conversation' },
        ...errorResponses({
            400: 'Invalid conversation id',
            401: 'Missing or invalid session',
            403: 'The caller may not leave this conversation',
            404: 'Unknown conversation, or the caller is not one of its members',
            ...upstreamFailures,
        }),
    },
});

registry.registerPath({
    method: 'get',
    path: '/conversations/{conversationId}/search',
    tags: ['Members'],
    summary: 'Search a conversation',
    description: 'One page of the messages whose content contains `q` (newest first, with an excerpt and the position of each match, '
        + 'and the message id to scroll to), of the members whose name contains it (`type=people`), or of the files (`type=files`: '
        + 'always empty, attachments are not supported yet).',
    request: { params: ConversationIdParams, query: ConversationSearchQuery },
    responses: {
        200: { description: 'One page of results', content: { 'application/json': { schema: ConversationSearchResponse } } },
        ...errorResponses({
            400: 'Invalid conversation id or query (details lists the invalid fields)',
            401: 'Missing or invalid session',
            404: 'Unknown conversation, or the caller is not one of its members',
            ...upstreamFailures,
        }),
    },
});

registry.registerPath({
    method: 'get',
    path: '/conversations/{conversationId}/mention-suggestions',
    tags: ['Members'],
    summary: 'What the caller may mention after @',
    description: 'The other members whose name contains `q` (case- and accent-insensitive), the groups a member belongs to whose name '
        + 'contains it (at most 20), and whether to offer `@tout le monde`.',
    request: { params: ConversationIdParams, query: MentionSuggestionsQuery },
    responses: {
        200: { description: 'The suggestions', content: { 'application/json': { schema: MentionSuggestionsResponse } } },
        ...errorResponses({
            400: 'Invalid conversation id or query (details lists the invalid fields)',
            401: 'Missing or invalid session',
            404: 'Unknown conversation, or the caller is not one of its members',
            ...upstreamFailures,
        }),
    },
});

router.get('/:conversationId/members', async (req, res) => {
    const { conversationId } = parseRequest(ConversationIdParams, req.params, 'params');
    res.status(200).json(await fetchMembers(conversationId, { req, declared: [401, 404] }));
});

router.post('/:conversationId/members', async (req, res) => {
    const { conversationId } = parseRequest(ConversationIdParams, req.params, 'params');
    const { userIds } = parseRequest(AddMembersBody, req.body, 'body');
    res.status(200).json(await addMembers(conversationId, userIds, { req, declared: [400, 401, 403, 404, 409] }));
});

router.delete('/:conversationId/members/:userId', async (req, res) => {
    const { conversationId, userId } = parseRequest(RemovedMemberParams, req.params, 'params');
    res.status(200).json(await removeMember(conversationId, userId, { req, declared: [401, 403, 404] }));
});

router.post('/:conversationId/leave', async (req, res) => {
    const { conversationId } = parseRequest(ConversationIdParams, req.params, 'params');
    await leaveConversation(conversationId, { req, declared: [401, 403, 404] });
    res.status(204).end();
});

router.get('/:conversationId/search', async (req, res) => {
    const { conversationId } = parseRequest(ConversationIdParams, req.params, 'params');
    const query = parseRequest(ConversationSearchQuery, req.query, 'query');
    res.status(200).json(await searchConversation(conversationId, query, { req, declared: [400, 401, 404] }));
});

router.get('/:conversationId/mention-suggestions', async (req, res) => {
    const { conversationId } = parseRequest(ConversationIdParams, req.params, 'params');
    const { q } = parseRequest(MentionSuggestionsQuery, req.query, 'query');
    res.status(200).json(await fetchMentionSuggestions(conversationId, q, { req, declared: [400, 401, 404] }));
});

export default router;
