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

test('accepts 14 or more characters that use three of the four types', () => {
  ok('Tr1cky-Harbour-Lamp!');
  ok('k9#Vm2$xQ7!pL4zR');
  ok('lower-UPPER-9-abc'); // lower, upper, number, symbol
  ok('lowerUPPERnumber99'); // lower, upper, number
});

test('refuses fewer than 14 characters', () => {
  bad('Ab1!xY', /at least 14/);
  bad('Abcdef1!ghijk', /at least 14/); // 13 characters
});

test('refuses fewer than three character types, however long', () => {
  bad('alllowercaseonlyletters', /three of/);
  bad('lowerANDUPPERonlyletters', /three of/);
  bad('12345678901234567890', /three of/);
});

test('refuses common passwords, including swapped letters and tacked-on numbers', () => {
  bad('Password123456!', /common/);
  bad('P@ssw0rd2024!!!!', /common/);
  bad('Letmein1Letmein1!', /common/);
});

test('refuses the user name, wherever it appears and in any case', () => {
  bad('Andrew-Lamp-Harbour9!', /user name/);
  bad('Zq9!Lp8vRxANDREWmq', /user name/);
});

test('quiet safety limits: control characters and overlong input', () => {
  bad('Tr1cky-Harbour\u0007-Lamp!', /control/);
  bad('Aa1!'.repeat(40), /at most 128/);
  assert.deepEqual(checkPassword('', { names }), ['Enter a password']);
  assert.deepEqual(checkPassword(undefined, { names }), ['Enter a password']);
});

test('the old extra rules are gone: runs, sequences, edge spaces and short variety are allowed', () => {
  ok('Xk9!aaaaPm2#Lq7z');
  ok('Zq!1234wMx$Lp8vR');
  ok(' Tr1cky-Harbour-Lamp! ');
});
