import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyCell, exitCodeFor, runtimeDelta, semanticDelta } from '../src/verdict.mjs';

const thresholds = { changedRatio: 0.001, reviewRatio: 0.02, pixelmatch: 0.1 };
const clean = { pageErrors: [], consoleErrors: [], failedRequests: [], assertionFailures: [], status: 200 };
const pixels = (ratio) => ({ changedPixels: Math.round(ratio * 1e6), totalPixels: 1e6, changeRatio: ratio });

test('classifyCell returns unchanged below the change threshold', () => {
  const cell = classifyCell({ pixel: pixels(0), base: clean, head: clean, thresholds });
  assert.equal(cell.verdict, 'unchanged');
  assert.deepEqual(cell.reasons, []);
});

test('classifyCell separates within-threshold change from review-required change', () => {
  assert.equal(classifyCell({ pixel: pixels(0.005), base: clean, head: clean, thresholds }).verdict, 'changed-within-threshold');
  assert.equal(classifyCell({ pixel: pixels(0.02), base: clean, head: clean, thresholds }).verdict, 'changed-within-threshold');
  assert.equal(classifyCell({ pixel: pixels(0.021), base: clean, head: clean, thresholds }).verdict, 'review-required');
});

test('classifyCell escalates on a head-only runtime error even with zero pixel change', () => {
  const head = { ...clean, consoleErrors: ['TypeError: x is not a function'] };
  const cell = classifyCell({ pixel: pixels(0), base: clean, head, thresholds });
  assert.equal(cell.verdict, 'review-required');
  assert.ok(cell.reasons.some((reason) => reason.includes('console error')));
});

test('classifyCell escalates on a semantic change with zero pixel change', () => {
  const cell = classifyCell({
    pixel: pixels(0),
    base: { ...clean, semantic: { title: 'Cart' } },
    head: { ...clean, semantic: { title: 'Basket' } },
    thresholds,
  });
  assert.equal(cell.verdict, 'review-required');
  assert.ok(cell.reasons.some((reason) => reason.includes('semantic')));
});

test('classifyCell reports capture-failed with the recorded reason', () => {
  const cell = classifyCell({
    pixel: null,
    base: clean,
    head: { ...clean, captureError: 'waitForSelector "#done" timed out' },
    thresholds,
  });
  assert.equal(cell.verdict, 'capture-failed');
  assert.deepEqual(cell.reasons, ['head capture failed: waitForSelector "#done" timed out']);
});

test('classifyCell treats a size mismatch as review-required, not a crash', () => {
  const cell = classifyCell({ pixel: null, base: clean, head: clean, sizeMismatch: '800x600 vs 800x900', thresholds });
  assert.equal(cell.verdict, 'review-required');
  assert.ok(cell.reasons[0].includes('800x600 vs 800x900'));
});

test('runtimeDelta reports head-only entries, not shared noise', () => {
  const delta = runtimeDelta(
    { ...clean, consoleErrors: ['shared'], failedRequests: [] },
    { ...clean, consoleErrors: ['shared', 'new'], failedRequests: ['GET /x 500'] },
  );
  assert.deepEqual(delta.consoleErrors, ['new']);
  assert.deepEqual(delta.failedRequests, ['GET /x 500']);
  assert.equal(delta.regressed, true);
});

test('runtimeDelta compares repeated runtime evidence as a multiset', () => {
  const delta = runtimeDelta(
    { ...clean, consoleErrors: ['repeated'] },
    { ...clean, consoleErrors: ['repeated', 'repeated', 'repeated'] },
  );
  assert.deepEqual(delta.consoleErrors, ['repeated', 'repeated']);
  assert.equal(delta.regressed, true);
});

test('classifyCell never labels identical non-2xx documents unchanged', () => {
  const notFound = { ...clean, status: 404, failedRequests: ['GET /missing 404'] };
  const cell = classifyCell({ pixel: pixels(0), base: notFound, head: notFound, thresholds });
  assert.equal(cell.verdict, 'review-required');
  assert.ok(cell.reasons.some((reason) => reason.includes('head document returned HTTP 404')));
});

test('an improved document status is changed evidence, not a runtime regression', () => {
  const base = { ...clean, status: 500 };
  const head = { ...clean, status: 200 };
  const delta = runtimeDelta(base, head);
  assert.equal(delta.statusChanged, true);
  assert.equal(delta.regressed, false);

  const cell = classifyCell({ pixel: pixels(0), base, head, thresholds });
  assert.equal(cell.verdict, 'review-required');
  assert.ok(cell.reasons.some((reason) => reason.includes('document status changed 500 -> 200')));
});

test('semanticDelta lists only the fields that differ', () => {
  const delta = semanticDelta({ title: 'A', text: { h1: 'x' } }, { title: 'A', text: { h1: 'y' } });
  assert.deepEqual(delta.changed, ['text.h1']);
});

test('exitCodeFor is 0 for a clean run and 1 when any capture failed', () => {
  assert.equal(exitCodeFor([{ verdict: 'unchanged' }, { verdict: 'review-required' }]), 0);
  assert.equal(exitCodeFor([{ verdict: 'unchanged' }, { verdict: 'capture-failed' }]), 1);
  assert.equal(exitCodeFor([]), 1);
});
