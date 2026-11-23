// MAIR-661: the test stacks keep covering GET /ws. The integration stack runs the WebSocket journey
// after newman (newman cannot open a socket), k6 holds real sockets under load with a frame delivery
// budget, and ZAP scans /ws instead of excluding it. These checks read the committed files, so a
// change that drops one of them fails the unit tests before reaching the stacks.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const read = (name: string): string => readFileSync(join(ROOT, name), 'utf8');

/** The block of service `name` in a compose file, up to the next service. */
function service(compose: string, name: string): string {
  const header = `\n  ${name}:\n`;
  const start = compose.indexOf(header);
  if (start < 0) throw new Error(`service ${name} is missing`);
  const body = compose.slice(start + header.length);
  const next = body.search(/\n {2}[^ #\n]/);
  return next < 0 ? body : body.slice(0, next);
}

describe('MAIR-661 WebSocket test stacks', () => {
  test('the integration stack runs the WebSocket journey after newman', () => {
    const journey = service(read('docker-compose-integration.yml'), 'ws-journey');
    expect(journey).toContain('profiles: ["journey"]');
    expect(journey).toContain('./tests/websocket:/journey:ro');
    expect(journey).toContain('"node", "/journey/journey.mjs"');
    for (const token of ['JWT_ADMIN', 'JWT_AGENT', 'JWT_THIRD']) expect(journey).toContain(token);

    const script = read('integration_test.sh');
    expect(script).toContain('JWT_THIRD="$(sign_jwt 3 user 3600)"');
    const wait = script.indexOf('wait "$SERVICE_NAME"');
    const run = script.indexOf('--profile journey run --rm ws-journey');
    expect(wait).toBeGreaterThan(0);
    expect(run).toBeGreaterThan(wait);
    expect(script).toContain('--profile journey down -v');
  });

  test('the journey checks members, the outsider and the eviction through the BFF ids', () => {
    const journey = read('tests/websocket/journey.mjs');
    for (const expected of [
      '/ws`',
      'NEW_MSG',
      'frame.conversationId === conversationId && frame.messageId === messageId',
      'C, not a member, receives nothing',
      'A, the author, receives nothing',
      'const EVICTED = 4008',
      'const MAX_CONNECTIONS = 5',
      'process.exit(failures === 0 ? 0 : 1)',
    ]) {
      expect(journey).toContain(expected);
    }
  });

  test('k6 holds WebSockets under load with strict thresholds', () => {
    const k6 = read('load-test.js');
    for (const expected of [
      "import ws from 'k6/ws'",
      "exec: 'websocket'",
      'export function websocket(',
      'ws_frame_delivery: [`p(95)<${WS_DELIVERY_BUDGET_MS}`]',
      "ws_frames_lost: ['count==0']",
      "'ws_connecting{scenario:websocket}'",
      "checks: ['rate==1']",
      "http_req_failed: ['rate==0']",
      "dropped_iterations: ['count==0']",
    ]) {
      expect(k6).toContain(expected);
    }
    expect(k6).toMatch(/ci: \{[^}]*wsVus: \d+/);
  });

  test('ZAP scans /ws', () => {
    const outOfScope = read('.zap/rules.tsv')
      .split('\n')
      .map((line) => line.split('\t'))
      .filter((fields) => fields[1] === 'OUTOFSCOPE');
    expect(outOfScope.length).toBeGreaterThan(0);
    for (const fields of outOfScope) expect(fields[2]).not.toMatch(/\/ws/);
  });
});
