import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Who is asking, from the headers the gateway sets after the Pocket ID login (a client cannot forge them), and
// whether that login is recent enough. Pure function: easy to test.
export function identify(headers, config, nowMs = Date.now()) {
  const raw = headers[config.userHeader];
  const user = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!user) return { ok: false, code: 'no-user' };
  const nasUser = config.userMap.get(user);
  if (!nasUser) return { ok: false, code: 'not-allowed', user };
  const authTime = Number.parseInt(headers[config.authTimeHeader] ?? '', 10);
  const ageSeconds = Number.isFinite(authTime) ? Math.floor(nowMs / 1000) - authTime : Number.POSITIVE_INFINITY;
  if (!(ageSeconds >= -60 && ageSeconds <= config.maxAuthAgeSeconds)) {
    return { ok: false, code: 'stale-login', user, ageSeconds };
  }
  return { ok: true, user, nasUser, ageSeconds };
}

// A form token tied to the signed-in user, valid for a short time, so another site cannot post a reset for them.
export function createCsrf(secret = randomBytes(32), ttlMs = 15 * 60 * 1000) {
  const sign = (user, exp) => createHmac('sha256', secret).update(`${user}:${exp}`).digest('base64url');
  return {
    issue(user, now = Date.now()) {
      const exp = now + ttlMs;
      return `${exp}.${sign(user, exp)}`;
    },
    verify(user, token, now = Date.now()) {
      if (typeof token !== 'string') return false;
      const [expText, signature] = token.split('.');
      const exp = Number(expText);
      if (!Number.isFinite(exp) || exp < now || !signature) return false;
      const a = Buffer.from(signature);
      const b = Buffer.from(sign(user, exp));
      return a.length === b.length && timingSafeEqual(a, b);
    },
  };
}

// One reset per account per window (in memory: a restart clears it, and there is one replica).
export function createCooldown(seconds) {
  const last = new Map();
  return {
    remaining(user, now = Date.now()) {
      const t = last.get(user);
      return t === undefined ? 0 : Math.max(0, Math.ceil((t + seconds * 1000 - now) / 1000));
    },
    mark(user, now = Date.now()) {
      last.set(user, now);
    },
  };
}

// The form post must come from this site. Browsers send Sec-Fetch-Site; fall back to comparing Origin with Host.
export function sameOrigin(headers) {
  const site = headers['sec-fetch-site'];
  if (site) return site === 'same-origin';
  const origin = headers.origin;
  const host = headers.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
