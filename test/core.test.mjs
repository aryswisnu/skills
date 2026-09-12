import test from 'node:test';
import assert from 'node:assert/strict';

import { safeArtifactName } from '../src/core.mjs';

test('safeArtifactName produces stable filesystem names', () => {
  assert.equal(safeArtifactName('Checkout / Empty Cart'), 'checkout-empty-cart');
  assert.equal(safeArtifactName('  Ünicode  '), 'unicode');
  assert.equal(safeArtifactName('../../etc/passwd'), 'etc-passwd');
  assert.equal(safeArtifactName('***'), 'capture');
});
