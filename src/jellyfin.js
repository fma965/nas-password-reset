// Sets the same password on the matching Jellyfin account. Jellyfin API keys are not scoped (any key acts as a full
// administrator), so this is optional and off unless JELLYFIN_URL and JELLYFIN_API_KEY are set. As an administrator the
// service may set a user's password without knowing the old one.

export class JellyfinRefusedError extends Error {}
// Jellyfin said the password was set but then refused it at sign-in: it was not changed.
export class JellyfinRejectedError extends Error {}

const CLIENT = 'Client="Password reset", Device="Password reset", DeviceId="nas-password-reset", Version="1"';

export async function setJellyfinPassword({ url, apiKey, username, password, timeoutMs = 10000 }, fetchImpl = globalThis.fetch) {
  const headers = { Authorization: `MediaBrowser Token="${apiKey}"`, 'Content-Type': 'application/json' };
  const signal = () => AbortSignal.timeout(timeoutMs);
  const base = url.replace(/\/+$/, '');

  const list = await fetchImpl(`${base}/Users`, { headers, signal: signal() });
  if (!list.ok) throw new Error(`Jellyfin answered ${list.status} when listing users`);
  const users = await list.json();
  const user = Array.isArray(users) ? users.find((u) => String(u.Name ?? '').toLowerCase() === username.toLowerCase()) : undefined;
  if (!user) throw new JellyfinRefusedError('There is no Jellyfin account with that name');
  if (user.Policy?.IsAdministrator === true) throw new JellyfinRefusedError('That Jellyfin account cannot be changed here');
  if (user.Policy?.IsDisabled === true) throw new JellyfinRefusedError('That Jellyfin account cannot be changed here');

  const res = await fetchImpl(`${base}/Users/${encodeURIComponent(user.Id)}/Password`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ NewPw: password, ResetPassword: false }),
    signal: signal(),
  });
  if (!res.ok) throw new Error(`Jellyfin answered ${res.status} when setting the password`);

  // Do not trust the 204: sign in with the new password. Jellyfin answers 401 for a wrong password.
  let login;
  try {
    login = await fetchImpl(`${base}/Users/AuthenticateByName`, {
      method: 'POST',
      headers: { Authorization: `MediaBrowser ${CLIENT}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ Username: user.Name, Pw: password }),
      signal: signal(),
    });
  } catch {
    return 'unconfirmed';
  }
  if (login.status === 401) throw new JellyfinRejectedError('Jellyfin did not accept the new password');
  if (!login.ok) return 'unconfirmed';
  try {
    const { AccessToken: token } = await login.json();
    // End the session the check created; a failure here changes nothing for the person.
    if (token) await fetchImpl(`${base}/Sessions/Logout`, { method: 'POST', headers: { Authorization: `MediaBrowser Token="${token}"` }, signal: signal() });
  } catch {
    // ignored on purpose
  }
  return 'ok';
}
