# nas-password-reset

A small page that lets a signed-in housemate reset their **own** file server (TrueNAS) password. It has no
dependencies beyond Node.js and is meant to sit behind a reverse proxy that does the sign-in.

## How it works

1. The proxy signs the person in (an OpenID Connect login) and passes their user name and the time of their
   sign-in as request headers (`Remote-User`, `Remote-Auth-Time`). The service trusts those headers, so **it must
   only be reachable through that proxy**.
2. The service checks that the user is on its allowlist (`USER_MAP`) and that the sign-in is recent
   (`MAX_AUTH_AGE_SECONDS`, default 5 minutes), then shows a button.
3. They either **choose their own** password (typed twice) or press **Generate**. Either way the service connects to
   the TrueNAS API with a service key and runs `user.update` for the mapped account: with the chosen `password`, or
   with `random_password: true`, in which case TrueNAS generates the password and the page shows it once.

## Optional: the matching Jellyfin account

Set `JELLYFIN_URL` and `JELLYFIN_API_KEY` and the page offers a ticked box, "Also use it for my Jellyfin account". After the
file server change succeeds, the same password (chosen or generated) is set on the Jellyfin account whose name equals the
sign-in name. Administrator and disabled Jellyfin accounts are refused. If Jellyfin fails, the file server password has
still changed and the page says so. **Jellyfin API keys are not scoped: the key is a full Jellyfin administrator**, which is
why this is off unless you configure it.

## Password rules (a chosen password)

At least 14 characters mixing three of lower case, upper case, numbers and symbols, **or** a passphrase of 20 or more
characters (no mixing needed); at most 128; no space at either end or control characters; at least 8 different
characters; no run of four identical characters; no sequence of four (`1234`, `abcd`, `qwer`, `zxcv`); not the sign-in
name or file server account name; not a common password (a built-in list, also with letter swaps such as `P@ssw0rd`
and numbers added on the end). The checks run on the server; a refused password is never echoed back. TrueNAS may
apply its own rules on top.

## Safeguards

- The account to reset comes from the proxy's `Remote-User` header and the allowlist, never from the request.
- Refuses accounts that are built-in, not local, locked, without SMB access, or that carry any API roles (admins).
- A form token tied to the user, a same-origin check, one reset per account per `COOLDOWN_SECONDS`, one at a time.
- A generated password is only in the response, and a chosen one is never shown again; neither is ever logged. Security headers and a nonce-based CSP on every page.
- Give the TrueNAS key only the `ACCOUNT_READ` and `ACCOUNT_WRITE` roles (a dedicated user in a privilege that has
  just those). Tested: such a key can run `user.update` but not read pools or shares. **It can still reset any
  local account, including an admin's**, so turn on two-factor for the admin accounts and keep the allowlist short.
  On this TrueNAS version a privilege's `local_groups` must hold the group's Unix `gid`, not its entry id.

## Configuration (environment)

| Variable | Default | Meaning |
| --- | --- | --- |
| `TRUENAS_API_KEY` | required | The service key |
| `USER_MAP` | required | `andrew,ash` or `signin-name=nas-account,...`: who can reset which account |
| `TRUENAS_URL` | `wss://nas.main.internal/api/current` | The TrueNAS websocket API |
| `TRUENAS_INSECURE` | `false` | `true` to accept the NAS's self-signed certificate (disables verification process-wide; only talk to the NAS) |
| `JELLYFIN_URL`, `JELLYFIN_API_KEY` | off | Turn on the Jellyfin option (see above) |
| `COOLDOWN_SECONDS` | `600` | Minimum time between resets of one account |
| `MAX_AUTH_AGE_SECONDS` | `300` | How recent the sign-in must be |
| `USER_HEADER`, `AUTH_TIME_HEADER` | `remote-user`, `remote-auth-time` | Header names |
| `APP_NAME`, `HELP_URL` | | Page title and a link back |
| `PORT` | `8080` | |

`GET /healthz` answers `ok`.

## Develop

```sh
npm test
TRUENAS_API_KEY=x USER_MAP=andrew npm start
```

## Release

Tag `vX.Y.Z`: the workflow tests, builds and pushes `ghcr.io/fma965/nas-password-reset:X.Y.Z` (and `latest`).
