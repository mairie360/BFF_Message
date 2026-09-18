import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { JsonSchema, OpenApiContract } from './support/openapi-contract';
import { loadOrvalContract, resolveOrvalPackage } from './support/orval-contract';
import {
  calendarBffUrls, calendarBootstrapResponse, calendarEvent, chatResult, chatUsers, chatView, chatsResult, coreApiUrls, createChatResult,
  directoryUsers, messageApiUrls, messageView, postMessageResult, projectBffUrls, projectDetailsResponse, projectListItem, projectsPageResponse,
  taskItem, users,
} from './support/upstream-fixtures';

// Les contrats des services amont sont reconstruits depuis les paquets @mairie360/*-openapi installés :
// monter la version dans package.json suffit à tester le BFF contre le nouveau contrat.

const PACKAGES = [
  '@mairie360/message-api-openapi',
  '@mairie360/core-api-openapi',
  '@mairie360/bff-project-openapi',
  '@mairie360/bff-calendar-openapi',
] as const;

const messageApi = loadOrvalContract('@mairie360/message-api-openapi');
const coreApi = loadOrvalContract('@mairie360/core-api-openapi');
const projectBff = loadOrvalContract('@mairie360/bff-project-openapi');
const calendarBff = loadOrvalContract('@mairie360/bff-calendar-openapi');

/** Chemin d'une opération tel que le client généré le construit (helper `get*Url`), sans sa query string. */
const pathname = (url: string) => new URL(url, 'http://upstream').pathname;

// Opérations amont réellement appelées par le BFF (src/clients/, src/routes/check_apis.ts,
// src/routes/Messages/business_references.ts), adressées par les helpers d'URL des clients générés.
const CONSUMED = [
  { contract: messageApi, operationId: 'getChats', method: 'get', url: messageApiUrls.getGetChatsUrl() },
  { contract: messageApi, operationId: 'createChat', method: 'post', url: messageApiUrls.getCreateChatUrl() },
  { contract: messageApi, operationId: 'getChat', method: 'get', url: messageApiUrls.getGetChatUrl(4) },
  { contract: messageApi, operationId: 'deleteChat', method: 'delete', url: messageApiUrls.getDeleteChatUrl(4) },
  { contract: messageApi, operationId: 'postMessage', method: 'post', url: messageApiUrls.getPostMessageUrl(4) },
  { contract: messageApi, operationId: 'getChatUsers', method: 'get', url: messageApiUrls.getGetChatUsersUrl(4) },
  { contract: messageApi, operationId: 'health', method: 'get', url: messageApiUrls.getHealthUrl() },
  { contract: coreApi, operationId: 'listDirectoryUsers', method: 'get', url: coreApiUrls.getListDirectoryUsersUrl({ ids: '7,8' }) },
  { contract: coreApi, operationId: 'health', method: 'get', url: coreApiUrls.getHealthUrl() },
  { contract: projectBff, operationId: 'getProjectsPage', method: 'get', url: projectBffUrls.getGetProjectsPageUrl({ limit: 100 }) },
  { contract: projectBff, operationId: 'getProjectsProjectId', method: 'get', url: projectBffUrls.getGetProjectsProjectIdUrl('project-1') },
  { contract: calendarBff, operationId: 'getCalendarBootstrap', method: 'get', url: calendarBffUrls.getGetCalendarBootstrapUrl() },
] as const;

function responseSchema(contract: OpenApiContract, method: string, url: string, status: number): JsonSchema {
  const match = contract.match(method, pathname(url));
  if (!match) throw new Error(`${method} ${url} absent de ${contract.title}`);
  const { schema } = contract.responseSchema(match, status);
  if (!schema) throw new Error(`Pas de schéma JSON pour ${status} ${method} ${url}`);
  return schema;
}

describe('upstream contracts from the installed @mairie360 OpenAPI packages', () => {
  test.each(PACKAGES)('%s is the version pinned in package.json', (name) => {
    const { dependencies, devDependencies } = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>; devDependencies: Record<string, string>;
    };
    expect(resolveOrvalPackage(name).version).toBe(dependencies[name] ?? devDependencies[name]);
  });

  test.each(CONSUMED)('$contract.title routes $method $url to $operationId', ({ contract, operationId, method, url }) => {
    const parsed = new URL(url, 'http://upstream');
    const { match, errors } = contract.validateRequest(method, parsed);
    expect(errors).toEqual([]);
    expect((match?.operation as { operationId?: string } | undefined)?.operationId).toBe(operationId);
  });

  test('keeps request bodies, path parameters and response models of the Message API operations', () => {
    const post = messageApi.match('POST', messageApiUrls.getPostMessageUrl(4))!;
    expect(post.operation.parameters).toEqual([{ name: 'chatId', in: 'path', required: true, schema: { type: 'number' } }]);
    expect(messageApi.requestBodySchema(post)).toEqual({ required: true, schema: { $ref: '#/components/schemas/PostMessageView' } });
    expect(messageApi.schema('CreateChatView')).toMatchObject({ required: ['members', 'name'] });
    expect(messageApi.schema('ChatView')).toMatchObject({ required: ['id', 'name', 'unread_count'] });
    expect(messageApi.responseSchema(messageApi.match('DELETE', messageApiUrls.getDeleteChatUrl(4))!, 200)).toEqual({ documented: true, schema: undefined });
    // Les erreurs ne sont pas typées par orval : aucun statut hors 2XX n'est documenté.
    expect(messageApi.responseSchema(messageApi.match('GET', messageApiUrls.getGetChatUrl(4))!, 404).documented).toBe(false);
  });
});

describe('upstream fixtures conform to the upstream contracts', () => {
  const project = projectListItem();
  test.each([
    ['Message API getChats 200', messageApi, 'get', messageApiUrls.getGetChatsUrl(), chatsResult([chatView(4, 'Équipe communication', 2)])],
    ['Message API createChat 200', messageApi, 'post', messageApiUrls.getCreateChatUrl(), createChatResult(12)],
    ['Message API getChat 200', messageApi, 'get', messageApiUrls.getGetChatUrl(4), chatResult([messageView(41, 7), messageView(42, 8, { sitation: 41 })])],
    ['Message API postMessage 200', messageApi, 'post', messageApiUrls.getPostMessageUrl(4), postMessageResult(31)],
    ['Message API getChatUsers 200', messageApi, 'get', messageApiUrls.getGetChatUsersUrl(4), chatUsers([7, 8])],
    ['Core API listDirectoryUsers 200', coreApi, 'get', coreApiUrls.getListDirectoryUsersUrl(), directoryUsers([users.agent, users.thomas])],
    ['BFF Project getProjectsPage 200', projectBff, 'get', projectBffUrls.getGetProjectsPageUrl(), projectsPageResponse([project])],
    ['BFF Project getProjectsProjectId 200', projectBff, 'get', projectBffUrls.getGetProjectsProjectIdUrl(project.id), projectDetailsResponse(project, [taskItem()])],
    ['BFF Calendar getCalendarBootstrap 200', calendarBff, 'get', calendarBffUrls.getGetCalendarBootstrapUrl(), calendarBootstrapResponse([calendarEvent(), calendarEvent({ id: 'evt-2' })])],
  ] as const)('%s', (_name, contract, method, url, body) => {
    expect(contract.validate(responseSchema(contract, method, url, 200), body)).toEqual([]);
  });
});

describe('contract validator', () => {
  test('reports missing required properties, wrong types and minimum on Message API models', () => {
    const invalid = { messages: [{ ...messageView(41, 7), sender_id: -1, content: 42 }] } as { messages: Array<Record<string, unknown>> };
    delete invalid.messages[0].created_at;
    expect(messageApi.validate(responseSchema(messageApi, 'get', messageApiUrls.getGetChatUrl(4), 200), invalid)).toEqual(expect.arrayContaining([
      expect.stringContaining('$.messages[0].created_at: propriété requise manquante'),
      expect.stringContaining('$.messages[0].sender_id: -1 < minimum 0'),
      expect.stringContaining('$.messages[0].content: type string attendu'),
    ]));
  });

  test('matches trailing-slash templates and validates path, query and body inputs', () => {
    expect(messageApi.match('GET', messageApiUrls.getGetChatUsersUrl(4))).toMatchObject({ template: '/api/v1/{chatId}/users/', pathParams: { chatId: '4' } });
    expect(messageApi.validateRequest('GET', new URL('http://api/api/v1/conversation-4/')).errors)
      .toEqual([expect.stringContaining('path.chatId: type number attendu')]);
    expect(projectBff.validateRequest('GET', new URL('http://bff/projects-page?limit=beaucoup')).errors)
      .toEqual([expect.stringContaining('query.limit: type number|null attendu')]);
    const match = messageApi.match('POST', messageApiUrls.getCreateChatUrl())!;
    expect(messageApi.validate(messageApi.requestBodySchema(match).schema!, { name: 'Sans membres', members: ['user-8'] }))
      .toEqual([expect.stringContaining('$.members[0]: type number attendu')]);
  });
});
