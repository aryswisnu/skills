import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeConfig } from '../src/config.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every shipped example config passes strict validation', async () => {
  const dir = path.join(repoRoot, 'examples/configs');
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json'));
  assert.ok(files.length > 0, 'no example configs found');
  for (const file of files) {
    const config = normalizeConfig(JSON.parse(await readFile(path.join(dir, file), 'utf8')));
    assert.ok(config.scenarios.length > 0, `${file} declared no scenarios`);
  }
});

test('the demo config passes strict validation', async () => {
  const config = normalizeConfig(JSON.parse(await readFile(path.join(repoRoot, 'examples/demo/visual-review.json'), 'utf8')));
  assert.deepEqual(config.scenarios.map((scenario) => scenario.id), ['home', 'home-evidence-open', 'details']);
});
