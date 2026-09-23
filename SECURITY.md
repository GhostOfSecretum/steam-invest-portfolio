# Security Policy

## Reporting a vulnerability

Please report privately, not in a public issue.

- Preferred: [GitHub private vulnerability reporting](https://github.com/GhostOfSecretum/steam-invest-portfolio/security/advisories/new)
- Alternative: Telegram [@GhostOfSecretum](https://t.me/GhostOfSecretum)

Please include what you did, what happened, and what you expected. A proof of
concept helps a lot. We aim to acknowledge within 72 hours.

Do not test against other people's accounts or data. Testing against your own
account, or a local instance, is fine.

## What the desktop app can and cannot do

The desktop client exists for one reason: Steam's public Web API does not expose
the contents of Storage Units. Reading them requires a connection to the CS2 Game
Coordinator, which requires a Steam login.

Two things are worth stating plainly, because marketing copy in this space
routinely gets them wrong.

**Steam does not issue scoped tokens.** After the QR login, the app holds a
refresh token equivalent to the one a normal Steam client holds. Technically it
grants full account access. Nobody can hand out a "read-only Steam token",
because Steam has no such thing.

**What limits the app is its own code, not the token.** The client reads
inventory and Storage Unit contents. There is no code path that moves, sells,
trades, deletes or renames an item, and no code that sends the Steam token to our
server.

Where secrets live:

| Secret | Location | Protection |
| --- | --- | --- |
| Steam refresh token | User's computer only | OS secure store via Electron `safeStorage` |
| Device token (pairing) | User's computer only | OS secure store via Electron `safeStorage` |
| Item list | Our server | See "Data at rest" below |

If the OS secure store is unavailable, the app refuses to store the token rather
than falling back to plaintext.

Disconnecting Storage Units revokes the refresh token at Valve through
`IAuthenticationService/RevokeToken`, not merely deletes the local copy. If
revocation fails, the app says so and links to Steam's device management page
instead of pretending it succeeded. You can always revoke manually:
Steam → Settings → Security → Manage Devices.

## Data at rest

Inventories and device tokens on the server are encrypted with AES-256-GCM when
`DATA_ENCRYPTION_KEY` is set. Generate a key with:

```bash
openssl rand -hex 32
```

Public market data such as price lists is deliberately left unencrypted: it is
public, it is the bulk of the cache, and encrypting it would cost CPU on every
read for no benefit.

Be clear about what this buys. Encryption protects a leaked copy of the data
directory — a stray backup, a snapshot, a misconfigured file server. It does not
protect against an attacker who already executes code on the host, because the
key is readable there by definition.

The data directory is created `0700` and its files `0600`, and existing files are
tightened on startup.

## Accepted risks

**`adm-zip < 0.6.0`, high severity, reachable through `steam-user` →
`globaloffensive`.** The only offered fix is downgrading `steam-user` to 3.15.0,
which breaks the Game Coordinator connection and therefore the entire Storage
Unit feature. The vulnerability allocates up to 4 GB of memory on a specially
crafted ZIP — a denial of service, in a code path whose archives come from Valve.
We accept this rather than break the feature, and we re-check on every
`steam-user` release.

**In-browser JSX compilation forces `unsafe-eval` and `unsafe-inline` in the
script CSP.** The frontend compiles JSX at runtime with `@babel/standalone`.
Until JSX is precompiled at build time, `script-src` can restrict where scripts
load from but cannot block injected inline code. The remaining CSP directives are
still enforced.

## Build integrity

Release builds are produced by GitHub Actions from a tagged commit and published
to GitHub Releases with SHA-256 checksums. Verify a download before installing:

```bash
shasum -a 256 -c SHA256SUMS-macos.txt
```

Code signing status is tracked in the repository; until Developer ID and Windows
signing certificates are in place, installers are unsigned and the operating
system will warn you. An unsigned build cannot be distinguished from a tampered
one by the OS, so checksums matter more in the meantime.
