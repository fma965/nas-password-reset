import { REQUIREMENTS } from './policy.js';

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STYLE = `
:root{color-scheme:light dark;--bg:#f6f7f9;--fg:#1c1f26;--card:#fff;--line:#d9dde3;--accent:#2f6fed;--warn:#8a5a00;--warnbg:#fff4d6}
@media (prefers-color-scheme:dark){:root{--bg:#14161a;--fg:#e8eaee;--card:#1d2026;--line:#323741;--accent:#6b9bff;--warn:#f1c76b;--warnbg:#3a3017}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif;display:grid;min-height:100vh;place-items:center;padding:16px}
main{width:100%;max-width:30rem;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px}
h1{font-size:1.25rem;margin:0 0 12px}p{margin:0 0 12px}.note{background:var(--warnbg);color:var(--warn);border-radius:8px;padding:10px 12px}
button,.btn{font:inherit;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:10px 16px;cursor:pointer;text-decoration:none;display:inline-block}
code{display:block;font:1.15rem ui-monospace,monospace;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px;margin:8px 0 12px;word-break:break-all;user-select:all}
.muted{opacity:.75;font-size:.9rem}
h2{font-size:1rem;margin:20px 0 8px}label{display:block;margin:10px 0 4px;font-weight:600}input[type=password],input[type=text]{width:100%;font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:9px 10px}
ul{margin:8px 0 12px;padding-left:20px}li{margin:2px 0}.error{background:#fde8e8;color:#8a1c1c;border-radius:8px;padding:10px 12px;margin:0 0 12px}
@media (prefers-color-scheme:dark){.error{background:#3d1d1d;color:#f3a6a6}}hr{border:0;border-top:1px solid var(--line);margin:20px 0}.row{margin:10px 0}`;

function shell(title, body, nonce, script = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style nonce="${nonce}">${STYLE}</style></head><body><main>${body}</main>${
    script ? `<script nonce="${nonce}">${script}</script>` : ''
  }</body></html>`;
}


const jellyfinLine = (state) =>
  ({
    ok: '<p>Your Jellyfin password is now the same new password.</p>',
    failed: '<p class="note">Your file server password was changed, but your Jellyfin password could not be. Jellyfin still has your old one. Try again in a few minutes, or ask the person who runs the server.</p>',
    refused: '<p class="note">Your file server password was changed. Your Jellyfin password was not, because that account cannot be changed from here.</p>',
  })[state] ?? '';

const help = (config) => (config.helpUrl ? `<p class="muted"><a href="${esc(config.helpUrl)}">Back to the guides</a></p>` : '');

// state: ready | stale-login | not-allowed | no-user | cooldown | done | refused | failed
export function render(state, ctx) {
  const { config, nonce } = ctx;
  const title = config.appName;
  switch (state) {
    case 'ready': {
      const problems = ctx.problems?.length
        ? `<div class="error" role="alert"><strong>That password was not accepted:</strong><ul>${ctx.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`
        : '';
      return shell(
        title,
        `<h1>${esc(title)}</h1>
<p>You are signed in as <strong>${esc(ctx.user)}</strong>. This sets a new password for the file server account <strong>${esc(ctx.nasUser)}</strong>${ctx.jellyfin ? ' and for your <strong>Jellyfin</strong> account' : ''}.</p>
<p class="note">${ctx.jellyfin ? 'Both passwords change together and become the same. Your old ones stop working straight away.' : 'Your old password stops working straight away.'} The network drive${ctx.jellyfin ? ' and Jellyfin' : ''} will ask for the new one.</p>
${problems}
<h2>Choose your own</h2>
<form method="post" action="/reset" autocomplete="off"><input type="hidden" name="csrf" value="${esc(ctx.token)}"><input type="hidden" name="mode" value="custom">
<label for="password">New password</label><input id="password" name="password" type="password" autocomplete="new-password" required maxlength="${esc(ctx.maxLength)}">
<label for="confirm">Confirm new password</label><input id="confirm" name="confirm" type="password" autocomplete="new-password" required maxlength="${esc(ctx.maxLength)}">
<div class="row"><label><input type="checkbox" id="show"> Show what I type</label></div>
<ul class="muted">${REQUIREMENTS.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
<button type="submit">${ctx.jellyfin ? 'Set my file server and Jellyfin password' : 'Set my password'}</button></form>
<hr>
<h2>Or have one made for you</h2>
<p class="muted">A long random password, shown once. Save it in your password manager.</p>
<form method="post" action="/reset"><input type="hidden" name="csrf" value="${esc(ctx.token)}"><input type="hidden" name="mode" value="random">
<button type="submit">${ctx.jellyfin ? 'Generate one for my file server and Jellyfin' : 'Generate a password for me'}</button></form>
${help(config)}`,
        nonce,
        `document.getElementById('show').onchange=(e)=>{for(const id of ['password','confirm'])document.getElementById(id).type=e.target.checked?'text':'password'}`,
      );
    }
    case 'stale-login':
      return shell(
        title,
        `<h1>Sign in again first</h1><p>To protect your files, a reset needs a fresh sign-in with your passkey.</p>
<p><a class="btn" href="/logout">Sign in again</a></p>${help(config)}`,
        nonce,
      );
    case 'not-allowed':
      return shell(title, `<h1>Not available for your account</h1><p>This page only works for the accounts that have a file server login. Ask the person who runs the server.</p>${help(config)}`, nonce);
    case 'no-user':
      return shell(title, `<h1>Sign in required</h1><p>Open this page again from the guides, so you are signed in first.</p>${help(config)}`, nonce);
    case 'cooldown':
      return shell(title, `<h1>Please wait</h1><p>You reset your password a moment ago. You can reset it again in ${esc(Math.ceil(ctx.seconds / 60))} minute(s).</p>${help(config)}`, nonce);
    case 'done':
      return shell(
        title,
        `<h1>Your new password</h1><p>Use it with the user name <strong>${esc(ctx.nasUser)}</strong>. It is shown <strong>once</strong>: save it in your password manager now.</p>
<code id="pw">${esc(ctx.password)}</code><button type="button" id="copy">Copy</button>
${jellyfinLine(ctx.jellyfin)}
<p class="muted">This page is not stored. Reloading it will not show the password again.</p>${help(config)}`,
        nonce,
        `document.getElementById('copy').onclick=async(e)=>{try{await navigator.clipboard.writeText(document.getElementById('pw').textContent);e.target.textContent='Copied'}catch{e.target.textContent='Select and copy it'}}`,
      );
    case 'done-custom':
      return shell(
        title,
        `<h1>Password changed</h1><p>Your file server password for <strong>${esc(ctx.nasUser)}</strong> is now the one you chose. Use it the next time the network drive asks.</p>${jellyfinLine(ctx.jellyfin)}${help(config)}`,
        nonce,
      );
    case 'refused':
      return shell(title, `<h1>This account cannot be reset here</h1><p>Ask the person who runs the server.</p>${help(config)}`, nonce);
    default:
      return shell(title, `<h1>That did not work</h1><p>The file server could not be reached or refused the change. Nothing was changed. Try again in a few minutes, or ask the person who runs the server.</p>${help(config)}`, nonce);
  }
}
