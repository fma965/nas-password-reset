import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { createCooldown, createCsrf, identify, sameOrigin } from './guard.js';
import { MAX_LENGTH, checkPassword } from './policy.js';
import { render } from './page.js';
import { RefusedError, resetPassword } from './truenas.js';

const MAX_BODY = 2048;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createApp(config, deps = {}) {
  const csrf = deps.csrf ?? createCsrf();
  const cooldown = deps.cooldown ?? createCooldown(config.cooldownSeconds);
  const inFlight = new Set();
  const reset =
    deps.reset ??
    ((username, password) =>
      resetPassword({ url: config.truenasUrl, apiKey: config.truenasApiKey, username, password, insecure: config.truenasInsecure }));
  const log = deps.log ?? ((entry) => console.log(JSON.stringify({ time: new Date().toISOString(), ...entry })));
  const now = deps.now ?? (() => Date.now());

  const send = (res, status, state, ctx = {}) => {
    const nonce = randomBytes(16).toString('base64');
    res.writeHead(status, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    });
    res.end(render(state, { config, nonce, ...ctx }));
  };
  const denied = (res, who) => {
    const status = who.code === 'no-user' ? 401 : 403;
    send(res, status, who.code);
  };

  return async function handle(req, res) {
    const path = new URL(req.url, 'http://localhost').pathname;
    try {
      if (path === '/healthz') {
        res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
        return;
      }
      if (req.method === 'GET' && path === '/') {
        const who = identify(req.headers, config, now());
        if (!who.ok) return denied(res, who);
        const wait = cooldown.remaining(who.user, now());
        if (wait > 0) return send(res, 200, 'cooldown', { seconds: wait });
        return send(res, 200, 'ready', { user: who.user, nasUser: who.nasUser, token: csrf.issue(who.user, now()), maxLength: MAX_LENGTH });
      }
      if (req.method === 'POST' && path === '/reset') {
        if (!sameOrigin(req.headers)) return send(res, 403, 'failed');
        const who = identify(req.headers, config, now());
        if (!who.ok) return denied(res, who);
        const form = new URLSearchParams(await readBody(req));
        if (!csrf.verify(who.user, form.get('csrf'), now())) return send(res, 403, 'failed');
        const wait = cooldown.remaining(who.user, now());
        if (wait > 0) return send(res, 429, 'cooldown', { seconds: wait });
        const mode = form.get('mode') === 'custom' ? 'custom' : 'random';
        let chosen;
        if (mode === 'custom') {
          const password = form.get('password') ?? '';
          const problems = checkPassword(password, { names: [who.user, who.nasUser] });
          if (password !== (form.get('confirm') ?? '')) problems.unshift('The two passwords do not match');
          if (problems.length > 0) {
            // Never echo a password back: the form comes back empty with the reasons.
            return send(res, 422, 'ready', { user: who.user, nasUser: who.nasUser, token: csrf.issue(who.user, now()), maxLength: MAX_LENGTH, problems });
          }
          chosen = password;
        }
        if (inFlight.has(who.user)) return send(res, 429, 'cooldown', { seconds: 60 });
        inFlight.add(who.user);
        try {
          const password = await reset(who.nasUser, chosen);
          cooldown.mark(who.user, now());
          log({ event: 'reset', user: who.user, account: who.nasUser, mode, result: 'ok' });
          return mode === 'custom' ? send(res, 200, 'done-custom', { nasUser: who.nasUser }) : send(res, 200, 'done', { nasUser: who.nasUser, password });
        } catch (error) {
          const refused = error instanceof RefusedError;
          log({ event: 'reset', user: who.user, account: who.nasUser, mode, result: refused ? 'refused' : 'failed', reason: error.message });
          return send(res, refused ? 403 : 502, refused ? 'refused' : 'failed');
        } finally {
          inFlight.delete(who.user);
        }
      }
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    } catch (error) {
      log({ event: 'error', reason: error.message });
      if (!res.headersSent) send(res, 400, 'failed');
    }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const config = loadConfig();
  createServer(createApp(config)).listen(config.port, () =>
    console.log(JSON.stringify({ event: 'listening', port: config.port, accounts: [...config.userMap.values()] })),
  );
}
