import http from 'k6/http';
import { check, sleep } from 'k6';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';
import { createCoverage } from '/coverage.js';

// ---------------------------------------------------------------------------
// k6 load test of the BFF Message.
//
// Every operation of the contract (contracts/openapi.json, mounted as /openapi.json) has one
// handler below: the shared OpenAPI coverage module (mairie360/CICD tests/k6/coverage.js, see
// performance_test.sh) aborts at init when an operation has no handler, and fails the
// `operations_uncovered` threshold when a handler ends without sending its request. Adding a route
// to the BFF therefore means adding its handler here.
//
// Two scenarios share the handlers:
// - `crud` (2 VUs): `coverage.run()` calls every handler once per iteration, reads and writes, so
//   it carries the coverage gate. Handlers run path by path in contract order and, for one path,
//   in the order get, put, post, delete, options, head, patch, trace. DELETE /conversations/{id}
//   comes before POST /groups in the contract, so its handler first creates the group it deletes.
//   The group and the direct message created later are kept in `state` and deleted by `cleanup()`
//   at the end of the iteration.
// - `reads` (up to 20 VUs): replays only the GET handlers, which read the fixtures seeded by
//   init-test.sql (conversation 101, message 1001) and never depend on `state`.
// Every operation gets a p(95) threshold, whose budget depends on its family (`budgetOf`).
// ---------------------------------------------------------------------------

// Must match the JWT_SECRET of the message-api / core-api services of the test stack.
const JWT_SECRET = __ENV.JWT_SECRET || 'b"secret"';
// User seeded by init-test.sql (JWT sub), member of the fixture conversation 101.
const USER_ID = __ENV.PERF_USER_ID || '2';
// Fixtures seeded by init-test.sql.
const FIXTURE_CONVERSATION = 'conversation-101';
const FIXTURE_MESSAGE = 'message-1001';
const CONTACT_ID = 'user-3';

// State of the current iteration (module scope is per VU in k6).
let state = {};

function b64url(value) {
  return encoding.b64encode(value, 'rawurl');
}

// Minimal HS256 JWT accepted by Message API and Core API (sub + role + exp claims).
function mintJwt(sub) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ sub, role: 'user', exp: now + 3600 }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto.hmac('sha256', JWT_SECRET, signingInput, 'base64rawurl');
  return `${signingInput}.${signature}`;
}

function unique(prefix) {
  return `${prefix} ${__VU}-${__ITER}-${Date.now()}`;
}

function need(value, what) {
  if (value === undefined || value === null) {
    throw new Error(`${what} is missing, an earlier handler of this iteration failed`);
  }
  return value;
}

function json(response) {
  try {
    return response.json();
  } catch (_) {
    return null;
  }
}

function conversationIdOf(response) {
  const body = json(response) || {};
  return body.conversation ? body.conversation.id : undefined;
}

function groupBody(name) {
  return { name, description: 'k6 group', memberIds: [CONTACT_ID] };
}

// POST /attachments takes multipart/form-data: the string body is sent as is by coverage.js.
const BOUNDARY = 'k6-attachment-boundary';
const ATTACHMENT_BODY =
  `--${BOUNDARY}\r\n` +
  'Content-Disposition: form-data; name="files"; filename="k6.txt"\r\n' +
  'Content-Type: text/plain\r\n\r\n' +
  'k6 attachment\r\n' +
  `--${BOUNDARY}--\r\n`;

const handlers = {
  // --- Connectivity (public) ---
  'GET /health': ({ request }) =>
    check(request(), { 'health 200': (r) => r.status === 200 }),
  'GET /check_apis': ({ request }) =>
    check(request(), { 'check_apis 200': (r) => r.status === 200 }),

  // --- Reads ---
  // BFF Project / BFF Calendar are not part of the stack: the route degrades per source and
  // still answers 200.
  'GET /business-references': ({ request }) =>
    check(request(), { 'business-references 200': (r) => r.status === 200 }),
  'GET /messaging/bootstrap': ({ request }) =>
    check(request(), { 'bootstrap 200': (r) => r.status === 200 }),
  'GET /contacts': ({ request }) =>
    check(request({ query: { limit: 20 } }), { 'contacts 200': (r) => r.status === 200 }),
  'GET /conversations': ({ request }) =>
    check(request({ query: { limit: 20 } }), { 'conversations 200': (r) => r.status === 200 }),
  'GET /me': ({ request }) =>
    check(request(), { 'me 200': (r) => r.status === 200 }),
  'GET /conversations/{conversationId}/messages': ({ request }) =>
    check(request({ path: { conversationId: FIXTURE_CONVERSATION }, query: { limit: 20 } }), {
      'messages 200': (r) => r.status === 200,
    }),

  // --- Writes ---
  'POST /attachments': ({ request }) =>
    check(request({ body: ATTACHMENT_BODY, headers: { 'Content-Type': `multipart/form-data; boundary=${BOUNDARY}` } }), {
      'attachments 201': (r) => r.status === 201,
    }),
  // Runs before POST /groups: creates the group it deletes.
  'DELETE /conversations/{conversationId}': ({ request, data }) => {
    const created = http.post(coverage.url('POST /groups'), JSON.stringify(groupBody(unique('k6 deleted group'))), {
      headers: Object.assign({ 'Content-Type': 'application/json' }, data.user),
      tags: { op: 'POST /groups' },
    });
    check(created, { 'create group 201': (r) => r.status === 201 });
    check(request({ path: { conversationId: need(conversationIdOf(created), 'disposable group') } }), {
      'delete conversation 200': (r) => r.status === 200,
    });
  },
  'POST /conversations/{conversationId}/read': ({ request }) =>
    check(request({ path: { conversationId: FIXTURE_CONVERSATION }, body: { readUntilMessageId: FIXTURE_MESSAGE } }), {
      'read 200': (r) => r.status === 200,
    }),
  'POST /groups': ({ request }) => {
    const res = request({ body: groupBody(unique('k6 group')) });
    check(res, { 'create group 201': (r) => r.status === 201 });
    state.groupId = conversationIdOf(res);
  },
  'PATCH /me': ({ request }) =>
    check(request({ body: { city: 'Paris', address: '1 place de la Mairie' } }), { 'patch me 200': (r) => r.status === 200 }),
  'POST /conversations/{conversationId}/messages': ({ request }) =>
    check(request({ path: { conversationId: need(state.groupId, 'created group') }, body: { content: 'k6 message', mentionIds: [CONTACT_ID] } }), {
      'send message 201': (r) => r.status === 201,
    }),
  // Every call opens a new conversation (Message API does not reuse the direct one).
  'POST /direct-messages': ({ request }) => {
    const res = request({ body: { recipientId: CONTACT_ID, message: 'k6 direct message' } });
    check(res, { 'direct message 201': (r) => r.status === 201 });
    state.directId = conversationIdOf(res);
  },
};

const coverage = createCoverage(handlers);
const readOperations = coverage.operations.filter((o) => o.method === 'GET');

// Deletes the conversations kept by the handlers, so that the listings do not grow during the test.
function cleanup(data) {
  for (const conversationId of [state.groupId, state.directId]) {
    if (!conversationId) continue;
    http.del(coverage.url('DELETE /conversations/{conversationId}', { conversationId }), null, {
      headers: data.user,
      tags: { op: 'DELETE /conversations/{conversationId}' },
    });
  }
}

// p(95) budget of an operation, per family.
function budgetOf({ op, method }) {
  if (op === 'GET /health') return 50; // process probe
  if (op === 'GET /check_apis') return 150; // -> Message API / Core API /health
  if (method === 'GET') return 400; // BFF aggregation + upstream reads
  return 800; // writes
}

const perOperationThresholds = {};
for (const operation of coverage.operations) {
  perOperationThresholds[`http_req_duration{op:${operation.op}}`] = [`p(95)<${budgetOf(operation)}`];
}

export const options = {
  scenarios: {
    reads: {
      executor: 'ramping-vus',
      exec: 'reads',
      stages: [
        { duration: '30s', target: 20 }, // ramp-up
        { duration: '1m', target: 20 }, // steady load
        { duration: '10s', target: 0 }, // ramp-down
      ],
    },
    crud: {
      executor: 'constant-vus',
      exec: 'crud',
      vus: 2,
      duration: '1m40s',
    },
  },
  thresholds: {
    ...coverage.thresholds,
    ...perOperationThresholds,
    http_req_failed: ['rate<0.01'], // < 1% errors
    checks: ['rate>0.99'],
  },
};

export function setup() {
  return { user: { Authorization: `Bearer ${mintJwt(USER_ID)}` } };
}

// Every GET handler, with a plain request() (no coverage accounting: `crud` owns the gate).
export function reads(data) {
  for (const operation of readOperations) {
    const request = (call = {}) =>
      http.get(coverage.url(operation.op, call.path, call.query), {
        headers: Object.assign({}, data.user, call.headers),
        tags: { op: operation.op },
      });
    handlers[operation.op]({ request, data, op: operation.op, method: operation.method, path: operation.path });
  }
  sleep(1);
}

export function crud(data) {
  state = {};
  coverage.run({ headers: data.user, data });
  cleanup(data);
  sleep(1);
}
