import { getAuthorizationHeader } from '../src/config/token';
import * as tokenModule from '../src/config/token';

describe('getAuthorizationHeader', () => {
  test('forwards the caller token with a Bearer prefix', () => {
    expect(getAuthorizationHeader('abc.def.ghi')).toBe('Bearer abc.def.ghi');
    expect(getAuthorizationHeader(' Bearer abc.def.ghi ')).toBe('Bearer abc.def.ghi');
  });

  test.each([undefined, '', '   ', 'undefined', 'null', 'Bearer', 'Bearer undefined', 'Bearer null'])(
    'never substitutes a default token for an unusable caller token (%p)',
    (value) => {
      expect(getAuthorizationHeader(value)).toBeUndefined();
    },
  );

  test('exposes no default/service token', () => {
    expect(tokenModule).not.toHaveProperty('DEFAULT_JWT_TOKEN');
  });
});
