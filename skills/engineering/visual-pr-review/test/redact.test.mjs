import test from 'node:test';
import assert from 'node:assert/strict';

import { redactCommand, redactKnownValues, redactValue } from '../src/redact.mjs';

test('redactCommand removes inline environment assignments', () => {
  assert.equal(
    redactCommand('API_TOKEN=abc123 npm start -- --port 4173'),
    'API_TOKEN=<redacted> npm start -- --port 4173',
  );
  assert.equal(redactCommand('PORT=4173 npm start'), 'PORT=4173 npm start');
});

test('redactCommand removes credential-bearing flags in both syntaxes', () => {
  assert.equal(redactCommand('tool --token abc --keep 1'), 'tool --token <redacted> --keep 1');
  assert.equal(redactCommand('tool --password=hunter2'), 'tool --password=<redacted>');
  assert.equal(redactCommand('tool --api-key sk-live-1 --port 80'), 'tool --api-key <redacted> --port 80');
});

test('redactCommand consumes complete quoted credential values', () => {
  assert.equal(
    redactCommand('tool --password "correct horse battery staple" --keep 1'),
    'tool --password <redacted> --keep 1',
  );
  assert.equal(
    redactCommand("tool --token='space secret' --keep 1"),
    'tool --token=<redacted> --keep 1',
  );
  assert.equal(
    redactCommand('API_TOKEN="correct horse" npm start'),
    'API_TOKEN=<redacted> npm start',
  );
});

test('redactCommand removes URL userinfo but keeps the host', () => {
  assert.equal(
    redactCommand('psql postgres://user:pw@db.local:5432/app'),
    'psql postgres://<redacted>@db.local:5432/app',
  );
});

test('redactCommand leaves an ordinary command untouched', () => {
  const command = 'npm run dev -- --host 127.0.0.1 --port {port}';
  assert.equal(redactCommand(command), command);
});

test('redactValue describes length without revealing content', () => {
  assert.equal(redactValue('hunter2'), '<redacted:7>');
  assert.equal(redactValue(''), '<redacted:0>');
});

test('redactKnownValues recursively removes secrets without mutating evidence', () => {
  const evidence = {
    consoleErrors: ['token hunter2 leaked', 'safe'],
    semantic: { title: 'Account hunter2', values: ['hunter2', 42] },
  };
  const redacted = redactKnownValues(evidence, ['hunter2', '']);

  assert.deepEqual(redacted, {
    consoleErrors: ['token <redacted> leaked', 'safe'],
    semantic: { title: 'Account <redacted>', values: ['<redacted>', 42] },
  });
  assert.equal(evidence.consoleErrors[0], 'token hunter2 leaked');
});
