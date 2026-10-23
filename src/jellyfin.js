// Sets the same password on the matching Jellyfin account. Jellyfin API keys are not scoped (any key acts as a full
// administrator), so this is optional and off unless JELLYFIN_URL and JELLYFIN_API_KEY are set. As an administrator the
// service may set a user's password without knowing the old one.

export class JellyfinRefusedError extends Error {}

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
}
