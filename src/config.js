const NAME = /^[a-z_][a-z0-9_.-]{0,31}$/;

// "andrew,ash" or "andrew=nas-andrew": sign-in name = file server account name. Only these accounts can be reset.
export function parseUserMap(text) {
  const map = new Map();
  for (const part of String(text).split(',').map((s) => s.trim()).filter(Boolean)) {
    const [from, to = from] = part.split('=').map((s) => s.trim());
    if (!NAME.test(from) || !NAME.test(to)) throw new Error(`Invalid USER_MAP entry: ${part}`);
    map.set(from, to);
  }
  return map;
}

export function loadConfig(env = process.env) {
  const need = (key) => {
    if (!env[key]) throw new Error(`${key} is required`);
    return env[key];
  };
  const userMap = parseUserMap(need('USER_MAP'));
  if (userMap.size === 0) throw new Error('USER_MAP lists no accounts');
  const number = (key, fallback) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isFinite(value) || value < 0) throw new Error(`${key} must be a non-negative number`);
    return value;
  };
  return Object.freeze({
    port: number('PORT', 8080),
    truenasUrl: env.TRUENAS_URL ?? 'wss://nas.main.internal/api/current',
    truenasApiKey: need('TRUENAS_API_KEY'),
    truenasInsecure: env.TRUENAS_INSECURE === 'true',
    userMap,
    cooldownSeconds: number('COOLDOWN_SECONDS', 600),
    maxAuthAgeSeconds: number('MAX_AUTH_AGE_SECONDS', 300),
    userHeader: (env.USER_HEADER ?? 'remote-user').toLowerCase(),
    authTimeHeader: (env.AUTH_TIME_HEADER ?? 'remote-auth-time').toLowerCase(),
    appName: env.APP_NAME ?? 'File server password',
    helpUrl: env.HELP_URL ?? '',
  });
}
