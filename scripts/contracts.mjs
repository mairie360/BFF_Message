import process from 'node:process';
import console from 'node:console';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const mode = process.argv[2] ?? '--check';
const spec = resolve('contracts/openapi.json');
const types = resolve('contracts/bff.d.ts');
const temporary = mkdtempSync(join(tmpdir(), 'mairie360-contract-'));
try {
  const output = join(temporary, 'bff.d.ts');
  execFileSync('npm', ['exec', '--yes', '--package=openapi-typescript@7.10.1', '--', 'openapi-typescript', spec, '--output', output], { stdio: 'pipe' });
  const generated = readFileSync(output);
  if (mode === '--generate') {
    mkdirSync(resolve(types, '..'), { recursive: true });
    writeFileSync(types, generated);
  } else if (!generated.equals(readFileSync(types))) {
    throw new Error('The generated TypeScript contract is stale. Regenerate it with npm run contracts:generate.');
  }
  console.log('OpenAPI data and routes match the generated TypeScript contract.');
} finally { rmSync(temporary, { recursive: true, force: true }); }
