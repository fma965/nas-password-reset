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
.muted{opacity:.75;font-size:.9rem}`;

function shell(title, body, nonce, script = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style nonce="${nonce}">${STYLE}</style></head><body><main>${body}</main>${
    script ? `<script nonce="${nonce}">${script}</script>` : ''
  }</body></html>`;
}

const help = (config) => (config.helpUrl ? `<p class="muted"><a href="${esc(config.helpUrl)}">Back to the guides</a></p>` : '');

// state: ready | stale-login | not-allowed | no-user | cooldown | done | refused | failed
export function render(state, ctx) {
  const { config, nonce } = ctx;
  const title = config.appName;
  switch (state) {
    case 'ready':
      return shell(
        title,
        `<h1>${esc(title)}</h1>
<p>You are signed in as <strong>${esc(ctx.user)}</strong>. This sets a new password for the file server account <strong>${esc(ctx.nasUser)}</strong>.</p>
<p class="note">Your current file server password stops working straight away. Anything connected to the network drive will ask for the new one.</p>
<form method="post" action="/reset"><input type="hidden" name="csrf" value="${esc(ctx.token)}"><button type="submit">Reset my file server password</button></form>
${help(config)}`,
        nonce,
      );
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
<p class="muted">This page is not stored. Reloading it will not show the password again.</p>${help(config)}`,
        nonce,
        `document.getElementById('copy').onclick=async(e)=>{try{await navigator.clipboard.writeText(document.getElementById('pw').textContent);e.target.textContent='Copied'}catch{e.target.textContent='Select and copy it'}}`,
      );
    case 'refused':
      return shell(title, `<h1>This account cannot be reset here</h1><p>Ask the person who runs the server.</p>${help(config)}`, nonce);
    default:
      return shell(title, `<h1>That did not work</h1><p>The file server could not be reached or refused the change. Nothing was changed. Try again in a few minutes, or ask the person who runs the server.</p>${help(config)}`, nonce);
  }
}
