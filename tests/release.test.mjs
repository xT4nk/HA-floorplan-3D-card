// node --test tests/
// Internal imports must carry ?v=<VERSION>: HACS adds a version only to the main file's URL,
// so without it browsers keep the old modules after an update and mix versions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
const read = f => readFileSync(new URL(f, dist), 'utf8');
const VERSION = read('floorplan-3d-card.js').match(/export const VERSION = '([^']+)'/)[1];
const REVISION = read('three.module.js').match(/const REVISION = '(\d+)'/)[1];

test('every internal import is versioned', () => {
  const files = readdirSync(dist).filter(f => f.startsWith('floorplan-') && f.endsWith('.js'));
  let seen = 0;
  for (const f of files) {
    for (const [, spec] of read(f).matchAll(/(?:import|export)\s[^'"]*?from\s+['"](\.\/[^'"]+)['"]/g)) {
      seen++;
      const want = spec.startsWith('./three.module.js') ? `./three.module.js?v=r${REVISION}`
        : spec.replace(/\?.*$/, '') + `?v=${VERSION}`;
      assert.equal(spec, want, `${f}: import "${spec}" should be "${want}"`);
    }
  }
  assert.ok(seen >= 4, 'expected at least 4 internal imports');
});
