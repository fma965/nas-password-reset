// Resets one file server account's password through the TrueNAS API (JSON-RPC over a websocket). Without `password`
// TrueNAS generates one and it is returned; with `password` (already checked by the caller) that one is set and null
// is returned. The API key it uses should hold only the ACCOUNT_WRITE role (plus ACCOUNT_READ). It can only be used
// on the account it was asked for, which the caller has already checked against its allowlist.

export class RefusedError extends Error {}

const call = (ws, pending, nextId) => (method, params = []) =>
  new Promise((resolve, reject) => {
    const id = nextId();
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  });

export async function resetPassword(
  { url, apiKey, username, password: chosen, insecure = false, timeoutMs = 15000 },
  WebSocketImpl = globalThis.WebSocket,
) {
  // The NAS has a self-signed certificate. This process only talks to the NAS (its network policy allows nothing else).
  if (insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const ws = new WebSocketImpl(url);
  const pending = new Map();
  let counter = 0;
  let timer;
  const finish = (error) => {
    clearTimeout(timer);
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  };
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('The file server did not answer in time')), timeoutMs);
  });
  ws.onmessage = (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(`TrueNAS: ${message.error.data?.reason ?? message.error.message}`));
    else entry.resolve(message.result);
  };
  ws.onerror = () => finish(new Error('Could not reach the file server'));
  ws.onclose = () => finish(new Error('The file server closed the connection'));

  const run = async () => {
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      pending.set('open', { resolve, reject });
    }).finally(() => pending.delete('open'));
    const rpc = call(ws, pending, () => ++counter);

    if ((await rpc('auth.login_with_api_key', [apiKey])) !== true) throw new Error('The service key was rejected');

    const found = await rpc('user.query', [[['username', '=', username]]]);
    const account = Array.isArray(found) ? found[0] : undefined;
    if (!account) throw new RefusedError('That file server account does not exist');
    if (account.local === false || account.builtin === true) throw new RefusedError('That account cannot be reset here');
    if (account.locked === true || account.smb === false) throw new RefusedError('That account cannot be reset here');
    if (Array.isArray(account.roles) && account.roles.length > 0) throw new RefusedError('That account cannot be reset here');

    if (typeof chosen === 'string') {
      await rpc('user.update', [account.id, { password: chosen }]);
      return null;
    }
    const updated = await rpc('user.update', [account.id, { random_password: true }]);
    const password = updated?.password;
    if (typeof password !== 'string' || password.length < 8) throw new Error('The file server did not return a password');
    return password;
  };

  try {
    return await Promise.race([run(), timeout]);
  } finally {
    clearTimeout(timer);
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  }
}
