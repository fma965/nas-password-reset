import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPassword } from '../src/policy.js';

const names = ['andrew'];
const ok = (password) => assert.deepEqual(checkPassword(password, { names }), [], `expected "${password}" to be accepted`);
const bad = (password, pattern) => {
  const problems = checkPassword(password, { names });
  assert.ok(problems.length > 0, `expected "${password}" to be refused`);
  if (pattern) assert.ok(problems.some((p) => pattern.test(p)), `expected ${pattern} in ${JSON.stringify(problems)}`);
};

test('accepts strong passwords and long passphrases', () => {
  ok('Tr1cky-Harbour-Lamp!');
  ok('k9#Vm2$xQ7!pL4zR');
  ok('correct horse battery staple');
  ok('purple-river-over-the-hill-again');
});

test('refuses short passwords and weak mixes', () => {
  bad('Ab1!xY', /at least 14/);
  ok('onlylowercaseletters'); // 20 characters or more counts as a passphrase and needs no mixing
  bad('abcdefghijklm', /at least 14/);
});

test('a 14 to 19 character password needs three character types', () => {
  bad('alllowercaseonly', /Mix at least three/);
  bad('lowerANDUPPERonly', /Mix at least three/);
  ok('lower-UPPER-9-abc');
});

test('refuses common passwords, including swapped letters and tacked-on numbers', () => {
  bad('Password123456!', /common/);
  bad('P@ssw0rd2024!!!!', /common/);
  bad('letmeinletmein1!A', /common/);
  bad('1qaz2wsx3edc4rfv', /sequence|common|qwer/);
});

test('refuses runs, sequences and few distinct characters', () => {
  bad('Xk9!aaaaPm2#Lq7z', /four of the same/);
  bad('Zq!1234wMx$Lp8vR', /runs such as/);
  bad('Zq!qwerWMx$Lp8vR', /runs such as/);
  bad('aAaAaAaAaAaAaAaA1', /different characters/);
});

test('refuses the user name, spaces at the ends, control characters and overlong passwords', () => {
  bad('Andrew-Lamp-Harbour9!', /user name/);
  bad(' Tr1cky-Harbour-Lamp!', /space at the start/);
  bad('Tr1cky-Harbour\u0007-Lamp!', /control/);
  bad('Aa1!'.repeat(40), /at most 128/);
  assert.deepEqual(checkPassword('', { names }), ['Enter a password']);
  assert.deepEqual(checkPassword(undefined, { names }), ['Enter a password']);
});
