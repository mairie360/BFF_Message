import { assertConfigured } from '@mairie360/bffs-lib';
import { UPSTREAMS } from '../src/index';

// MAIR-431: the entry point refuses to start (assertConfigured, under require.main) when an upstream
// URL is missing, instead of calling a localhost default.
describe('upstream configuration', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  test('lists every upstream the BFF calls', () => {
    expect([...UPSTREAMS].sort()).toEqual(['CALENDAR_BFF', 'CORE_API', 'MESSAGE_API', 'PROJECT_BFF']);
  });

  test('fails fast naming every missing upstream URL', () => {
    for (const service of UPSTREAMS) delete process.env[`${service}_URL`];
    process.env.CORE_API_URL = 'core-api';

    expect(() => assertConfigured(UPSTREAMS)).toThrow(
      'Missing or invalid upstream configuration: MESSAGE_API_URL, PROJECT_BFF_URL, CALENDAR_BFF_URL',
    );
  });

  test('accepts a host with an optional port, without scheme', () => {
    for (const service of UPSTREAMS) process.env[`${service}_URL`] = service.toLowerCase().replace('_', '-');
    process.env.MESSAGE_API_PORT = '3003';

    expect(() => assertConfigured(UPSTREAMS)).not.toThrow();
  });
});
