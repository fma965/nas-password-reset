import { readFileSync } from 'node:fs';
import { REQUIREMENTS } from './policy.js';

// The version shown in the footer comes from package.json, which is also the release tag.
export const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  } catch {
    return 'unknown';
  }
})();

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STYLE = `
:root{color-scheme:light dark;--bg:#f6f7f9;--fg:#1c1f26;--card:#fff;--line:#d9dde3;--accent:#2f6fed;--warn:#8a5a00;--warnbg:#fff4d6;--ok:#1a7f37;--bad:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#14161a;--fg:#e8eaee;--card:#1d2026;--line:#323741;--accent:#6b9bff;--warn:#f1c76b;--warnbg:#3a3017;--ok:#56d364;--bad:#f3a6a6}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif;display:grid;min-height:100vh;place-items:center;padding:16px}
main{width:100%;max-width:30rem;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px}
h1{font-size:1.25rem;margin:0 0 12px}p{margin:0 0 12px}.note{background:var(--warnbg);color:var(--warn);border-radius:8px;padding:10px 12px}
button,.btn{font:inherit;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:10px 16px;cursor:pointer;text-decoration:none;display:inline-block}
code{display:block;font:1.15rem ui-monospace,monospace;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px;margin:8px 0 12px;word-break:break-all;user-select:all}
.muted{opacity:.75;font-size:.9rem}.back{margin-top:32px}.sub{margin:0 0 16px;opacity:.75}.status{margin:0 0 6px;font-weight:600}.status.ok{color:var(--ok)}.status.bad{color:var(--bad)}.or{display:flex;align-items:center;gap:12px;margin:20px 0;opacity:.6;font-size:.9rem}.or::before,.or::after{content:'';flex:1;border-top:1px solid var(--line)}button.secondary{background:transparent;color:var(--accent);border:1px solid var(--accent)}footer{margin-top:20px;text-align:center;font-size:.8rem;opacity:.6}
h2{font-size:1rem;margin:20px 0 8px}label{display:block;margin:10px 0 4px;font-weight:600}input[type=password],input[type=text]{width:100%;font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:9px 10px}
ul{margin:8px 0 12px;padding-left:20px}li{margin:2px 0}.error{background:#fde8e8;color:#8a1c1c;border-radius:8px;padding:10px 12px;margin:0 0 12px}
@media (prefers-color-scheme:dark){.error{background:#3d1d1d;color:#f3a6a6}}hr{border:0;border-top:1px solid var(--line);margin:20px 0}.row{margin:10px 0}`;

const APP_FOOTER = `Password Reset Procedure v${VERSION}`;

function shell(title, body, nonce, script = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style nonce="${nonce}">${STYLE}</style></head><body><main>${body}<footer>${esc(APP_FOOTER)}</footer></main>${
    script ? `<script nonce="${nonce}">${script}</script>` : ''
  }</body></html>`;
}


const ok = (text) => `<p class="status ok">&#10003; ${text}</p>`;
const bad = (text) => `<p class="status bad">&#10007; ${text}</p>`;

const jellyfinLine = (state) =>
  ({
    ok: ok('Jellyfin password changed'),
    failed: bad('Jellyfin password not changed. Jellyfin still has your old one. Try again in a few minutes, or ask the person who runs the server.'),
    rejected: bad('Jellyfin password not changed. Jellyfin did not accept the new password. Try again, or ask the person who runs the server.'),
    unconfirmed: bad('Jellyfin password could not be checked. Try signing in to Jellyfin with the new password. If it does not work, reset again.'),
    refused: bad('Jellyfin password not changed. That account cannot be changed from here.'),
  })[state] ?? '';

const results = (state) => `${ok('File Server password changed')}${jellyfinLine(state)}`;

const help = (config) => (config.helpUrl ? `<p class="muted back"><a href="${esc(config.helpUrl)}">Back to the guides</a></p>` : '');

// Every page has the same layout: the title, a short line saying what this page is, the content, a link back, the footer.
function page(config, nonce, sub, body, script = '') {
  return shell(config.appName, `<h1>${esc(config.appName)}</h1><p class="sub">${esc(sub)}</p>${body}${help(config)}`, nonce, script);
}

// state: ready | stale-login | not-allowed | no-user | cooldown | done | done-custom | refused | failed
export function render(state, ctx) {
  const { config, nonce } = ctx;
  switch (state) {
    case 'ready': {
      const problems = ctx.problems?.length
        ? `<div class="error" role="alert"><strong>That password was not accepted:</strong><ul>${ctx.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`
        : '';
      return page(
        config,
        nonce,
        'Reset your password',
        `<p>This will reset the password for <strong>${esc(ctx.nasUser)}</strong>.</p>
<p>This password is used for the following services:</p>
<ul><li>File Server (SMB / Network Drive)</li>${ctx.jellyfin ? '<li>Jellyfin (Media Server)</li><li>Seerr (Media Requests)</li>' : ''}</ul>
${problems}
<hr>
<h2>Choose a password</h2>
<form method="post" action="/reset" autocomplete="off"><input type="hidden" name="csrf" value="${esc(ctx.token)}"><input type="hidden" name="mode" value="custom">
<label for="password">New password</label><input id="password" name="password" type="password" autocomplete="new-password" required maxlength="${esc(ctx.maxLength)}">
<label for="confirm">Confirm new password</label><input id="confirm" name="confirm" type="password" autocomplete="new-password" required maxlength="${esc(ctx.maxLength)}">
<div class="row"><label><input type="checkbox" id="show"> Show passwords</label></div>
<ul class="muted">${REQUIREMENTS.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
<button type="submit">Reset Password</button></form>
<div class="or">or</div>
<h2>Generate a password</h2>
<p class="muted">We will make a strong password and show it once.</p>
<form method="post" action="/reset"><input type="hidden" name="csrf" value="${esc(ctx.token)}"><input type="hidden" name="mode" value="random">
<button type="submit" class="secondary">Set Random Password</button></form>`,
        `document.getElementById('show').onchange=(e)=>{for(const id of ['password','confirm'])document.getElementById(id).type=e.target.checked?'text':'password'}`,
      );
    }
    case 'stale-login':
      return page(
        config,
        nonce,
        'Confirm it is you',
        `<p>For your security, confirm it is you with your passkey before you reset your password.</p><p><a class="btn" href="/logout">Confirm with passkey</a></p>`,
      );
    case 'not-allowed':
      return page(config, nonce, 'Not available', '<p>This page is not available for your account.</p><p>Ask the person who runs the server.</p>');
    case 'no-user':
      return page(config, nonce, 'Sign in required', '<p>Open this page again from the guides, so you are signed in first.</p>');
    case 'cooldown':
      return page(config, nonce, 'Please wait', `<p>You changed your password a moment ago.</p><p>Try again in ${esc(Math.ceil(ctx.seconds / 60))} minute(s).</p>`);
    case 'done':
      return page(
        config,
        nonce,
        'Password changed',
        `<p>Your new password for <strong>${esc(ctx.nasUser)}</strong> is shown once. Save it in your password manager.</p>
<code id="pw">${esc(ctx.password)}</code><button type="button" id="copy" class="secondary">Copy</button>
<div class="row">${results(ctx.jellyfin)}</div>
<p class="muted">This password is only shown once. Reloading this page will not show it again.</p>`,
        `document.getElementById('copy').onclick=async(e)=>{try{await navigator.clipboard.writeText(document.getElementById('pw').textContent);e.target.textContent='Copied'}catch{e.target.textContent='Select and copy it'}}`,
      );
    case 'done-custom':
      return page(config, nonce, 'Password changed', results(ctx.jellyfin));
    case 'refused':
      return page(config, nonce, 'Not available', '<p>This account cannot be reset here.</p><p>Ask the person who runs the server.</p>');
    default:
      return page(config, nonce, 'Could not reset', '<p>Nothing was changed.</p><p>Try again in a few minutes, or ask the person who runs the server.</p>');
  }
}
