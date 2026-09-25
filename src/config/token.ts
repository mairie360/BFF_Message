function isUsableToken(value?: string): value is string {
  if (!value) {
    return false;
  }

  const token = value.trim();
  return !['undefined', 'null', 'Bearer', 'Bearer undefined', 'Bearer null'].includes(token);
}

/**
 * Authorization header forwarded upstream: only ever the caller's own token.
 * There is deliberately no default/service token fallback, so an anonymous request reaches
 * the upstream services without credentials and is rejected there.
 */
export function getAuthorizationHeader(incomingRequestToken?: string): string | undefined {
  if (!isUsableToken(incomingRequestToken)) {
    return undefined;
  }

  const token = incomingRequestToken.trim();
  return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}
