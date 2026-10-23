# nas-password-reset

A small page that lets a signed-in housemate reset their **own** file server (TrueNAS) password. It has no
dependencies beyond Node.js and is meant to sit behind a reverse proxy that does the sign-in.

## How it works

1. The proxy signs the person in (an OpenID Connect login) and passes their user name and the time of their
   sign-in as request headers (`Remote-User`, `Remote-Auth-Time`). The service trusts those headers, so **it must
   only be reachable through that proxy**.
2. The service checks that the user is on its allowlist (`USER_MAP`) and that the sign-in is recent
   (`MAX_AUTH_AGE_SECONDS`, default 5 minutes), then shows a button.
3. Pressing it connects to the TrueNAS API with a service key and runs `user.update` with `random_password: true`
   for the mapped account. TrueNAS generates the password and returns it. The page shows it once.

## Safeguards

- The account to reset comes from the proxy's `Remote-User` header and the allowlist, never from the request.
- Refuses accounts that are built-in, not local, locked, without SMB access, or that carry any API roles (admins).
- A form token tied to the user, a same-origin check, one reset per account per `COOLDOWN_SECONDS`, one at a time.
- The password is only in the response; it is never logged. Security headers and a nonce-based CSP on every page.
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
