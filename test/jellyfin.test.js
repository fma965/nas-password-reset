import assert from 'node:assert/strict';
import test from 'node:test';
import { JellyfinRefusedError, setJellyfinPassword } from '../src/jellyfin.js';

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const users = [
  { Id: 'aaa', Name: 'Admin', Policy: { IsAdministrator: true } },
  { Id: 'bbb', Name: 'Andrew', Policy: { IsAdministrator: false } },
  { Id: 'ccc', Name: 'gone', Policy: { IsDisabled: true } },
];
const base = { url: 'http://jellyfin.test:8096/', apiKey: 'JF-SECRET', username: 'andrew', password: 'Tr1cky-Harbour-Lamp!' };

function fakeFetch(answers, calls = []) {
  return async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', headers: init.headers, body: init.body });
    return answers(url, init);
  };
}

test('finds the account by name (any case) and sets the password as an administrator', async () => {
  const calls = [];
  await setJellyfinPassword(base, fakeFetch((url) => (url.endsWith('/Users') ? reply(200, users) : reply(204)), calls));
  assert.equal(calls[0].url, 'http://jellyfin.test:8096/Users');
  assert.equal(calls[1].url, 'http://jellyfin.test:8096/Users/bbb/Password');
  assert.equal(calls[1].method, 'POST');
  assert.equal(calls[1].headers.Authorization, 'MediaBrowser Token="JF-SECRET"');
  assert.deepEqual(JSON.parse(calls[1].body), { NewPw: 'Tr1cky-Harbour-Lamp!', ResetPassword: false });
});

test('refuses administrators, disabled accounts and names that do not exist, and never sets a password then', async () => {
  for (const username of ['admin', 'gone', 'nobody']) {
    const calls = [];
    await assert.rejects(
      setJellyfinPassword({ ...base, username }, fakeFetch(() => reply(200, users), calls)),
      JellyfinRefusedError,
    );
    assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
  }
});

test('reports Jellyfin errors without leaking the key or the password', async () => {
  let error = await setJellyfinPassword(base, fakeFetch(() => reply(401))).catch((e) => e);
  assert.match(error.message, /401/);
  error = await setJellyfinPassword(base, fakeFetch((url) => (url.endsWith('/Users') ? reply(200, users) : reply(500)))).catch((e) => e);
  assert.match(error.message, /500/);
  for (const text of [error.message]) {
    assert.ok(!text.includes('JF-SECRET'));
    assert.ok(!text.includes(base.password));
  }
});
