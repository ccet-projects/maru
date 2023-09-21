import test from 'node:test';
import assert from 'node:assert';
import maru from '../index.js';

test('just start and stop an application', async () => {
  const app = maru(import.meta.url);
  await app.start();
  await app.stop();
  assert.ok(true);
});
