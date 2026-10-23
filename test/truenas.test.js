import assert from 'node:assert/strict';
import test from 'node:test';
import { RefusedError, resetPassword } from '../src/truenas.js';

// A stand-in for the TrueNAS websocket API: answers each JSON-RPC method from a table, and records the calls.
function fakeSocket(answers, calls = []) {
  return class FakeSocket {
    constructor() {
      setTimeout(() => this.onopen?.(), 0);
    }
    send(raw) {
      const { id, method, params } = JSON.parse(raw);
      calls.push({ method, params });
      const answer = answers[method];
      if (answer === 'silence') return;
      setTimeout(() => {
        const out = typeof answer === 'function' ? answer(params) : answer;
        const message = out instanceof Error ? { id, error: { message: out.message } } : { id, result: out };
        this.onmessage?.({ data: JSON.stringify(message) });
      }, 0);
    }
    close() {}
  };
}
const account = { id: 7, username: 'andrew', local: true, builtin: false, locked: false, smb: true };
const base = { url: 'wss://nas.test/api/current', apiKey: 'KEY-SECRET', username: 'andrew' };
const answers = (over = {}) => ({
  'auth.login_with_api_key': true,
  'user.query': [account],
  'user.update': { id: 7, password: 'GeneratedPassw0rd12345' },
  ...over,
});

test('resets one account with a TrueNAS-generated password', async () => {
  const calls = [];
  const password = await resetPassword(base, fakeSocket(answers(), calls));
  assert.equal(password, 'GeneratedPassw0rd12345');
  assert.deepEqual(calls.map((c) => c.method), ['auth.login_with_api_key', 'user.query', 'user.update']);
  assert.deepEqual(calls[1].params, [[['username', '=', 'andrew']]]);
  assert.deepEqual(calls[2].params, [7, { random_password: true }]);
});

for (const [label, over] of [
  ['missing account', { 'user.query': [] }],
  ['built-in account', { 'user.query': [{ ...account, builtin: true }] }],
  ['non-local account', { 'user.query': [{ ...account, local: false }] }],
  ['locked account', { 'user.query': [{ ...account, locked: true }] }],
  ['account without SMB access', { 'user.query': [{ ...account, smb: false }] }],
  ['account with roles (an admin)', { 'user.query': [{ ...account, roles: ['FULL_ADMIN'] }] }],
]) {
  test(`refuses a ${label} and never calls user.update`, async () => {
    const calls = [];
    await assert.rejects(resetPassword(base, fakeSocket(answers(over), calls)), RefusedError);
    assert.ok(!calls.some((c) => c.method === 'user.update'));
  });
}

test('fails when the key is rejected or no password comes back, without leaking the key', async () => {
  await assert.rejects(resetPassword(base, fakeSocket(answers({ 'auth.login_with_api_key': false }))), /key was rejected/);
  await assert.rejects(resetPassword(base, fakeSocket(answers({ 'user.update': { id: 7 } }))), /did not return a password/);
  const error = await resetPassword(base, fakeSocket(answers({ 'user.update': new Error('boom') }))).catch((e) => e);
  assert.match(error.message, /boom/);
  assert.ok(!error.message.includes('KEY-SECRET'));
});

test('gives up when the NAS does not answer', async () => {
  await assert.rejects(
    resetPassword({ ...base, timeoutMs: 40 }, fakeSocket(answers({ 'user.query': 'silence' }))),
    /did not answer in time/,
  );
});

test('sets a chosen password with user.update and returns nothing', async () => {
  const calls = [];
  const result = await resetPassword({ ...base, password: 'Chosen-Passw0rd-Here!' }, fakeSocket(answers({ 'user.update': { id: 7 } }), calls));
  assert.equal(result, null);
  assert.deepEqual(calls.at(-1).params, [7, { password: 'Chosen-Passw0rd-Here!' }]);
  assert.ok(!JSON.stringify(calls).includes('random_password'));
});
