import assert from 'node:assert/strict';
import test from 'node:test';
import { JellyfinRefusedError, JellyfinRejectedError, setJellyfinPassword } from '../src/jellyfin.js';

const jellyfinAnswers = (overrides = {}) => (url) => {
  if (url.endsWith('/Users')) return reply(200, users);
  if (url.endsWith('/Password')) return reply(204);
  if (url.endsWith('/AuthenticateByName')) return overrides.login ?? reply(200, { AccessToken: 'SESSION-TOKEN' });
  if (url.endsWith('/Sessions/Logout')) return overrides.logout ?? reply(204);
  throw new Error(`unexpected ${url}`);
};
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
  const result = await setJellyfinPassword(base, fakeFetch(jellyfinAnswers(), calls));
  assert.equal(result, 'ok');
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

test('proves the change by signing in with the new password, then signs that session out', async () => {
  const calls = [];
  await setJellyfinPassword(base, fakeFetch(jellyfinAnswers(), calls));
  const urls = calls.map((c) => c.url.replace('http://jellyfin.test:8096', ''));
  assert.deepEqual(urls, ['/Users', '/Users/bbb/Password', '/Users/AuthenticateByName', '/Sessions/Logout']);
  assert.deepEqual(JSON.parse(calls[2].body), { Username: 'Andrew', Pw: 'Tr1cky-Harbour-Lamp!' });
  assert.ok(!calls[2].headers.Authorization.includes('JF-SECRET'), 'the admin key is not used for the check');
  assert.equal(calls[3].headers.Authorization, 'MediaBrowser Token="SESSION-TOKEN"');
});

test('a password Jellyfin rejects at sign-in is reported as not changed', async () => {
  const error = await setJellyfinPassword(base, fakeFetch(jellyfinAnswers({ login: reply(401) }))).catch((e) => e);
  assert.ok(error instanceof JellyfinRejectedError);
  assert.ok(!error.message.includes(base.password));
});

test('a check that cannot be made is "unconfirmed", never "ok"', async () => {
  assert.equal(await setJellyfinPassword(base, fakeFetch(jellyfinAnswers({ login: reply(403) }))), 'unconfirmed');
  assert.equal(await setJellyfinPassword(base, fakeFetch(jellyfinAnswers({ login: reply(500) }))), 'unconfirmed');
  const throwing = fakeFetch((url) => {
    if (url.endsWith('/AuthenticateByName')) throw new Error('network down');
    return jellyfinAnswers()(url);
  });
  assert.equal(await setJellyfinPassword(base, throwing), 'unconfirmed');
});

test('a failed sign-out of the check session does not change the result', async () => {
  assert.equal(await setJellyfinPassword(base, fakeFetch(jellyfinAnswers({ logout: reply(500) }))), 'ok');
});
