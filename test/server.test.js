import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { parseUserMap } from '../src/config.js';
import { createApp } from '../src/server.js';
import { RefusedError } from '../src/truenas.js';

const NOW = 1_800_000_000_000;
const SECRET_PASSWORD = 'Sup3rSecretGenerated20';
const config = {
  appName: 'File server password',
  helpUrl: '',
  userHeader: 'remote-user',
  authTimeHeader: 'remote-auth-time',
  maxAuthAgeSeconds: 300,
  cooldownSeconds: 600,
  userMap: parseUserMap('andrew,ash'),
};

async function start(reset) {
  const logs = [];
  const resets = [];
  const handler = createApp(config, {
    now: () => NOW,
    log: (entry) => logs.push(JSON.stringify(entry)),
    reset: async (account) => {
      resets.push(account);
      return reset(account);
    },
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = (user = 'andrew', age = 20) => ({
    'remote-user': user,
    'remote-auth-time': String(NOW / 1000 - age),
    'sec-fetch-site': 'same-origin',
  });
  const token = async (h = headers()) => /name="csrf" value="([^"]+)"/.exec(await (await fetch(`${base}/`, { headers: h })).text())[1];
  const post = (csrf, h = headers()) =>
    fetch(`${base}/reset`, {
      method: 'POST',
      headers: { ...h, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf }).toString(),
    });
  return { base, headers, token, post, logs, resets, close: () => server.close() };
}

test('only a signed-in, listed, recent user sees the form', async () => {
  const t = await start(async () => SECRET_PASSWORD);
  try {
    assert.equal((await fetch(`${t.base}/`)).status, 401);
    assert.equal((await fetch(`${t.base}/`, { headers: t.headers('scott') })).status, 403);
    const stale = await fetch(`${t.base}/`, { headers: t.headers('andrew', 4000) });
    assert.equal(stale.status, 403);
    assert.match(await stale.text(), /Sign in again/);
    const ok = await fetch(`${t.base}/`, { headers: t.headers() });
    assert.equal(ok.status, 200);
    assert.match(await ok.text(), /Reset my file server password/);
    assert.equal((await fetch(`${t.base}/healthz`)).status, 200);
    assert.equal((await fetch(`${t.base}/nope`)).status, 404);
    assert.equal((await fetch(`${t.base}/reset`)).status, 404);
  } finally {
    t.close();
  }
});

test('a reset needs the form token and a same-site post, and shows the password once', async () => {
  const t = await start(async () => SECRET_PASSWORD);
  try {
    assert.equal((await t.post('bad')).status, 403);
    assert.equal((await t.post(await t.token(), { ...t.headers(), 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await t.post(await t.token(), t.headers('scott'))).status, 403);
    assert.equal(t.resets.length, 0);

    const csrf = await t.token();
    const done = await t.post(csrf);
    assert.equal(done.status, 200);
    assert.match(await done.text(), new RegExp(SECRET_PASSWORD));
    assert.equal(done.headers.get('cache-control'), 'no-store');
    assert.match(done.headers.get('content-security-policy'), /script-src 'nonce-/);
    assert.deepEqual(t.resets, ['andrew']);

    const again = await t.post(csrf);
    assert.equal(again.status, 429);
    assert.match(await (await fetch(`${t.base}/`, { headers: t.headers() })).text(), /Please wait/);
    assert.equal(t.resets.length, 1);
    assert.ok(!t.logs.some((line) => line.includes(SECRET_PASSWORD)), 'the password must never be logged');
  } finally {
    t.close();
  }
});

test('a refused or failed reset changes nothing and does not start the cooldown', async () => {
  let mode = 'refuse';
  const t = await start(async () => {
    if (mode === 'refuse') throw new RefusedError('no');
    if (mode === 'fail') throw new Error('Could not reach the file server');
    return SECRET_PASSWORD;
  });
  try {
    assert.equal((await t.post(await t.token())).status, 403);
    mode = 'fail';
    assert.equal((await t.post(await t.token())).status, 502);
    mode = 'ok';
    assert.equal((await t.post(await t.token())).status, 200);
    assert.equal(t.resets.length, 3);
  } finally {
    t.close();
  }
});
