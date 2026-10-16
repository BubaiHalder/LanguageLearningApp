const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TokenStore } = require('../src/features/tutor/token-store.ts');

function backend(overrides = {}) {
  const data = new Map();
  return { data, isAvailableAsync: async () => true, getItemAsync: async (k) => data.get(k) ?? null,
    setItemAsync: async (k, v) => { data.set(k, v); }, deleteItemAsync: async (k) => { data.delete(k); }, ...overrides };
}

test('token store: saves, loads and clears a token', async () => {
  const store = new TokenStore(backend());
  assert.equal(await store.load(), null);
  assert.equal(await store.save('abc-token'), true);
  assert.equal(await store.load(), 'abc-token');
  assert.equal(await store.clear(), true);
  assert.equal(await store.load(), null);
});

test('token store: blank tokens are never saved', async () => {
  const b = backend(); const store = new TokenStore(b);
  assert.equal(await store.save('   '), false);
  assert.equal(b.data.size, 0);
});

test('token store: unavailable or failing storage degrades to not saved without throwing', async () => {
  const unavailable = new TokenStore(backend({ isAvailableAsync: async () => false }));
  assert.equal(await unavailable.save('t'), false); assert.equal(await unavailable.load(), null);
  assert.equal(await unavailable.clear(), true);
  const failing = new TokenStore(backend({ getItemAsync: async () => { throw new Error('keystore locked'); },
    setItemAsync: async () => { throw new Error('keystore locked'); }, deleteItemAsync: async () => { throw new Error('keystore locked'); } }));
  assert.equal(await failing.load(), null); assert.equal(await failing.save('t'), false); assert.equal(await failing.clear(), false);
});
