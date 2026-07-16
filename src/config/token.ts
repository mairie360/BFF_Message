export const DEFAULT_JWT_TOKEN: string = process.env.DEFAULT_JWT_TOKEN ?? '';

function isUsableToken(value?: string): value is string {
  if (!value) {
    return false;
  }

  const token = value.trim();
  return !['undefined', 'null', 'Bearer', 'Bearer undefined', 'Bearer null'].includes(token);
}

export function getAuthorizationHeader(incomingRequestToken?: string): string | undefined {
  const token = isUsableToken(incomingRequestToken) ? incomingRequestToken.trim() : DEFAULT_JWT_TOKEN.trim();

  if (!isUsableToken(token)) {
    return undefined;
  }

  return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}
