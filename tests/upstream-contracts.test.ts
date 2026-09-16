import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { JsonSchema, OpenApiContract } from './support/openapi-contract';
import { loadOrvalContract, resolveOrvalPackage } from './support/orval-contract';
import {
  calendarBootstrapResponse, calendarEvent, chatResult, chatUsers, chatView, chatsResult, messageView,
  projectDetailsResponse, projectListItem, projectsPageResponse, taskItem,
} from './support/upstream-fixtures';

// Les contrats des services amont sont reconstruits depuis les paquets @mairie360/*-openapi installés :
// monter la version dans package.json suffit à tester le BFF contre le nouveau contrat.

const PACKAGES = [
  '@mairie360/message-api-openapi',
  '@mairie360/core-api-openapi',
  '@mairie360/bff-project-openapi',
  '@mairie360/bff-calendar-openapi',
] as const;

// Opérations amont réellement appelées par le BFF (src/clients/, src/routes/check_apis.ts,
// src/routes/Messages/business_references.ts).
const CONSUMED = [
  { pkg: '@mairie360/message-api-openapi', operationId: 'getChats', method: 'get', template: '/v1/' },
  { pkg: '@mairie360/message-api-openapi', operationId: 'createChat', method: 'post', template: '/v1/' },
  { pkg: '@mairie360/message-api-openapi', operationId: 'getChat', method: 'get', template: '/v1/{chatId}/' },
  { pkg: '@mairie360/message-api-openapi', operationId: 'deleteChat', method: 'delete', template: '/v1/{chatId}/' },
  { pkg: '@mairie360/message-api-openapi', operationId: 'postMessage', method: 'post', template: '/v1/{chatId}/messages/' },
  { pkg: '@mairie360/message-api-openapi', operationId: 'getChatUsers', method: 'get', template: '/v1/{chatId}/users/' },
  { pkg: '@mairie360/message-api-openapi', operationId: 'health', method: 'get', template: '/health' },
  { pkg: '@mairie360/core-api-openapi', operationId: 'listDirectoryUsers', method: 'get', template: '/api/v1/user/' },
  { pkg: '@mairie360/core-api-openapi', operationId: 'health', method: 'get', template: '/health' },
  { pkg: '@mairie360/bff-project-openapi', operationId: 'getProjectsPage', method: 'get', template: '/projects-page' },
  { pkg: '@mairie360/bff-project-openapi', operationId: 'getProjectsProjectId', method: 'get', template: '/projects/{projectId}' },
  { pkg: '@mairie360/bff-calendar-openapi', operationId: 'getCalendarBootstrap', method: 'get', template: '/calendar/bootstrap' },
] as const;

const messageApi = loadOrvalContract('@mairie360/message-api-openapi');
const projectBff = loadOrvalContract('@mairie360/bff-project-openapi');
const calendarBff = loadOrvalContract('@mairie360/bff-calendar-openapi');

function responseSchema(contract: OpenApiContract, method: string, pathname: string, status: number): JsonSchema {
  const match = contract.match(method, pathname);
  if (!match) throw new Error(`${method} ${pathname} absent de ${contract.title}`);
  const { schema } = contract.responseSchema(match, status);
  if (!schema) throw new Error(`Pas de schéma JSON pour ${status} ${method} ${pathname}`);
  return schema;
}

describe('upstream contracts from the installed @mairie360 OpenAPI packages', () => {
  test.each(PACKAGES)('%s is the version pinned in package.json', (name) => {
    const { dependencies, devDependencies } = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>; devDependencies: Record<string, string>;
    };
    expect(resolveOrvalPackage(name).version).toBe(dependencies[name] ?? devDependencies[name]);
  });

  test.each(CONSUMED)('$pkg declares $operationId as $method $template', ({ pkg, operationId, method, template }) => {
    const operation = loadOrvalContract(pkg).document.paths[template]?.[method] as { operationId?: string } | undefined;
    expect(operation?.operationId).toBe(operationId);
  });

  test('keeps request bodies, path parameters and response models of the Message API operations', () => {
    const post = messageApi.match('POST', '/v1/4/messages/')!;
    expect(post.operation.parameters).toEqual([{ name: 'chatId', in: 'path', required: true, schema: { type: 'number' } }]);
    expect(messageApi.requestBodySchema(post)).toEqual({ required: true, schema: { $ref: '#/components/schemas/PostMessageView' } });
    expect(messageApi.schema('CreateChatView')).toMatchObject({ required: ['members', 'name'] });
    expect(messageApi.schema('ChatView')).toMatchObject({ required: ['id', 'name', 'unread_count'] });
    expect(messageApi.responseSchema(messageApi.match('DELETE', '/v1/4/')!, 200)).toEqual({ documented: true, schema: undefined });
    // Les erreurs ne sont pas typées par orval : aucun statut hors 2XX n'est documenté.
    expect(messageApi.responseSchema(messageApi.match('GET', '/v1/4/')!, 404).documented).toBe(false);
  });
});

describe('upstream fixtures conform to the upstream contracts', () => {
  const project = projectListItem();
  test.each([
    ['Message API GET /v1/ 200', messageApi, 'get', '/v1/', chatsResult([chatView(4, 'Équipe communication', 2)])],
    ['Message API POST /v1/ 200', messageApi, 'post', '/v1/', { id: 12 }],
    ['Message API GET /v1/{chatId}/ 200', messageApi, 'get', '/v1/4/', chatResult([messageView(41, 7), messageView(42, 8, { sitation: 41 })])],
    ['Message API POST /v1/{chatId}/messages/ 200', messageApi, 'post', '/v1/4/messages/', { id: 31 }],
    ['Message API GET /v1/{chatId}/users/ 200', messageApi, 'get', '/v1/4/users/', chatUsers([7, 8])],
    ['BFF Project GET /projects-page 200', projectBff, 'get', '/projects-page', projectsPageResponse([project])],
    ['BFF Project GET /projects/{projectId} 200', projectBff, 'get', '/projects/project-1', projectDetailsResponse(project, [taskItem()])],
    ['BFF Calendar GET /calendar/bootstrap 200', calendarBff, 'get', '/calendar/bootstrap', calendarBootstrapResponse([calendarEvent(), calendarEvent({ id: 'evt-2' })])],
  ] as const)('%s', (_name, contract, method, pathname, body) => {
    expect(contract.validate(responseSchema(contract, method, pathname, 200), body)).toEqual([]);
  });
});

describe('contract validator', () => {
  test('reports missing required properties, wrong types and minimum on Message API models', () => {
    const invalid = { messages: [{ ...messageView(41, 7), sender_id: -1, content: 42 }] } as { messages: Array<Record<string, unknown>> };
    delete invalid.messages[0].created_at;
    expect(messageApi.validate(responseSchema(messageApi, 'get', '/v1/4/', 200), invalid)).toEqual(expect.arrayContaining([
      expect.stringContaining('$.messages[0].created_at: propriété requise manquante'),
      expect.stringContaining('$.messages[0].sender_id: -1 < minimum 0'),
      expect.stringContaining('$.messages[0].content: type string attendu'),
    ]));
  });

  test('matches trailing-slash templates and validates path, query and body inputs', () => {
    expect(messageApi.match('GET', '/v1/4/users/')).toMatchObject({ template: '/v1/{chatId}/users/', pathParams: { chatId: '4' } });
    expect(messageApi.validateRequest('GET', new URL('http://api/v1/conversation-4/')).errors)
      .toEqual([expect.stringContaining('path.chatId: type number attendu')]);
    expect(projectBff.validateRequest('GET', new URL('http://bff/projects-page?limit=beaucoup')).errors)
      .toEqual([expect.stringContaining('query.limit: type number|null attendu')]);
    const match = messageApi.match('POST', '/v1/')!;
    expect(messageApi.validate(messageApi.requestBodySchema(match).schema!, { name: 'Sans membres', members: ['user-8'] }))
      .toEqual([expect.stringContaining('$.members[0]: type number attendu')]);
  });
});
