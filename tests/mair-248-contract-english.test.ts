// MAIR-248: the contract the fronts read (`contracts/openapi.json`, published as
// `@mairie360/bff-*-openapi`) is written in English. Fails on any French text that comes back
// into a summary, a description or an example.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** French texts kept on purpose (labels the fronts show as they are), removed before the check. */
const ALLOWED: string[] = [];

const FRENCH_WORDS = new Set([
  'les', 'des', 'une', 'est', 'pour', 'avec', 'sans', 'dans', 'aucun', 'aucune', 'identifiant',
  'utilisateur', 'requête', 'erreur', 'corps', 'chemin', 'récupère', 'liste',
]);

function strings(value: unknown, out: string[]): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => strings(item, out));
  return out;
}

export function isFrench(text: string): boolean {
  const rest = ALLOWED.reduce((acc, allowed) => acc.split(allowed).join(''), text);
  return /[àâçéèêëîïôûùüÿœÀÂÇÉÈÊÎÔÛ]/.test(rest)
    || rest.split(/[^\p{L}\p{N}]+/u).some((word) => FRENCH_WORDS.has(word.toLowerCase()));
}

describe('MAIR-248 contract language', () => {
  it('has no French text in contracts/openapi.json', () => {
    const contract = JSON.parse(readFileSync(join(__dirname, '..', 'contracts', 'openapi.json'), 'utf8'));
    expect(strings(contract, []).filter(isFrench)).toEqual([]);
  });

  it('flags French text', () => {
    expect(isFrench('Liste des conversations')).toBe(true);
    expect(isFrench('Récupère le profil')).toBe(true);
    expect(isFrench('List the conversations')).toBe(false);
  });
});
