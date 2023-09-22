import test from 'node:test';
import assert from 'node:assert/strict';
import maru from '../index.js';

await test('default settings', async () => {
  const app = maru(import.meta.url, [], { logs: false });
  await app.start();
  const hasService = !!app.services.example;
  await app.stop();
  assert.ok(hasService);
});

await test('without api', async () => {
  const app = maru(import.meta.url, [], { logs: false, api: false });
  await app.start();
  const hasService = !!app.services.example;
  await app.stop();
  assert.ok(!hasService);
});
