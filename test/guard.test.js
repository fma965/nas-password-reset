import assert from 'node:assert/strict';
import test from 'node:test';
import { parseUserMap } from '../src/config.js';
import { createCooldown, createCsrf, identify, sameOrigin } from '../src/guard.js';

const config = {
  userHeader: 'remote-user',
  authTimeHeader: 'remote-auth-time',
  maxAuthAgeSeconds: 300,
  userMap: parseUserMap('andrew, ash=ash-nas'),
};
const NOW = 1_800_000_000_000;
const fresh = String(NOW / 1000 - 30);

test('parseUserMap reads names and renames, and rejects bad names', () => {
  assert.deepEqual([...parseUserMap('a, b=c')], [['a', 'a'], ['b', 'c']]);
  assert.throws(() => parseUserMap('Bad Name'), /Invalid USER_MAP/);
  assert.throws(() => parseUserMap('a=../etc'), /Invalid USER_MAP/);
  assert.equal(parseUserMap('').size, 0);
});

test('identify accepts a listed, recently signed-in user and maps the account', () => {
  const who = identify({ 'remote-user': ' Ash ', 'remote-auth-time': fresh }, config, NOW);
  assert.equal(who.ok, true);
  assert.equal(who.nasUser, 'ash-nas');
});

test('identify refuses missing, unlisted and stale logins', () => {
  assert.equal(identify({}, config, NOW).code, 'no-user');
  assert.equal(identify({ 'remote-user': 'scott', 'remote-auth-time': fresh }, config, NOW).code, 'not-allowed');
  assert.equal(identify({ 'remote-user': 'andrew', 'remote-auth-time': String(NOW / 1000 - 301) }, config, NOW).code, 'stale-login');
  assert.equal(identify({ 'remote-user': 'andrew' }, config, NOW).code, 'stale-login');
  assert.equal(identify({ 'remote-user': 'andrew', 'remote-auth-time': 'abc' }, config, NOW).code, 'stale-login');
  assert.equal(identify({ 'remote-user': 'andrew', 'remote-auth-time': String(NOW / 1000 + 3600) }, config, NOW).code, 'stale-login');
});

test('csrf tokens are tied to the user, expire and cannot be altered', () => {
  const csrf = createCsrf(Buffer.from('k'.repeat(32)), 1000);
  const token = csrf.issue('andrew', NOW);
  assert.equal(csrf.verify('andrew', token, NOW + 500), true);
  assert.equal(csrf.verify('ash', token, NOW + 500), false);
  assert.equal(csrf.verify('andrew', token, NOW + 1001), false);
  assert.equal(csrf.verify('andrew', token.slice(0, -2) + 'xx', NOW + 500), false);
  assert.equal(csrf.verify('andrew', undefined, NOW), false);
  assert.equal(csrf.verify('andrew', 'nonsense', NOW), false);
});

test('cooldown blocks a second reset inside the window', () => {
  const cooldown = createCooldown(600);
  assert.equal(cooldown.remaining('andrew', NOW), 0);
  cooldown.mark('andrew', NOW);
  assert.equal(cooldown.remaining('andrew', NOW + 60_000), 540);
  assert.equal(cooldown.remaining('ash', NOW + 60_000), 0);
  assert.equal(cooldown.remaining('andrew', NOW + 601_000), 0);
});

test('sameOrigin trusts Sec-Fetch-Site, then falls back to Origin and Host', () => {
  assert.equal(sameOrigin({ 'sec-fetch-site': 'same-origin' }), true);
  assert.equal(sameOrigin({ 'sec-fetch-site': 'cross-site' }), false);
  assert.equal(sameOrigin({ origin: 'https://x.example', host: 'x.example' }), true);
  assert.equal(sameOrigin({ origin: 'https://evil.example', host: 'x.example' }), false);
  assert.equal(sameOrigin({ host: 'x.example' }), false);
});
