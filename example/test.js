import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import maru from '../index.js'; // eslint-disable-line import/no-relative-packages

describe('start and stop', () => {
  let app = null;

  it('default settings', async () => {
    app = maru(import.meta.url);
    try {
      await app.start();
      assert.ok(app.info);
      assert.equal(app.name, 'maru-test');
      assert.ok(app.services.main);
    } finally {
      await app.stop();
    }
  });

  it('bare skeleton', async () => {
    app = maru(import.meta.url, [], { logs: false, api: false });
    try {
      await app.start();
      assert.ok(!app.services.main);
    } finally {
      await app.stop();
    }
  });
});
