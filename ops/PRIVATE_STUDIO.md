# Private studio operations

This release is one private workspace for its owner and trusted team. It does not
offer public registration, customer billing, or isolation between independent
customers. Every signed-in member can access this workspace's jobs and media.

Open https://office.creativeprocess.io/videolab/ and sign in with the credentials
in `data/private/studio-login.txt` on the application host. That file is created
with mode 0600, is ignored by Git, and is never served by the app. Sessions expire
after eight hours, persist across restarts, and are revoked on sign-out. Cookies
are Secure, HttpOnly and SameSite=Strict. Login is limited to five attempts per IP
per 15 minutes; authenticated mutations are limited to 30 per session per minute.

Keep `data/private`, `.env`, the database and user media across application
deployments. Do not regenerate the account file during deployment. To rotate the
owner password, stop the application, replace the password hash using
`passwordHash` from `server/access.ts`, remove session database files, and restart.
Never publish login files, provider credentials, callback secrets or backup keys.

## GPU deployment

The image is built by `.github/workflows/musetalk-image.yml`, with application
worker source, dependencies and public model weights included. The deployed Linux
amd64 digest is recorded in `ops/musetalk/image-manifest.json` and deployment
status. The endpoint runs Python directly; no startup package installation is
required. Minimum workers stays 0, maximum 1, idle timeout 5 seconds. Changing to
a nonzero minimum creates continuous GPU charges.

The app issues hour-long signed links for worker inputs. Ordinary browser media
access requires sign-in; worker upload callbacks use a separate job-specific
token. Keep callback signing configuration stable while requests are active.

## Cost and admission

Enable `RUNPOD_BILLING_GUARD_ENABLED=true`. The app reads account billing every
five minutes and blocks new generation if that check becomes older than ten
minutes. It counts reported account charges plus retained app reservations
against the configured daily/monthly caps. This can count usage conservatively
twice. Other applications on the account can spend independently of this app.
Provider billing can arrive late; the app is not an account-wide hard spending
limit. Configure provider-side spending limits separately where available.

Job `actual_cost_usd` is an execution allocation retained for compatibility, not
the provider invoice. The UI labels it accordingly. Empty billing buckets display
as pending. Startup, idle time, storage and fees belong in provider billing.
Do not replay `submission_unknown` jobs; reconcile the original request first.

## Backup and recovery

Create and verify an encrypted backup:

```bash
node --import tsx ops/backup-studio.ts backup data/backups/release.aes
node --import tsx ops/backup-studio.ts verify data/backups/release.aes
```

The archive contains a consistent SQLite snapshot, cached inputs, renders, the
owner password hash and server configuration. AES-256-GCM authenticates and
encrypts it. The key is `data/private/backup.key`; copy that key separately and
securely off-host, and keep encrypted archives off-host too. Verification restores
only into a temporary directory, checks database integrity and leaves production
untouched. Session tokens are excluded. A same-host backup does not protect
against loss of that host.

For an actual restore, first stop the application and retain the damaged data.
Use the verified archive and original key to restore the database, media, account
and environment; keep database and input paths as documented. Restart only after
an integrity check. A database-only snapshot is also stored at
`data/backups/pre-private-studio.db` from before the access-control deployment.

## Validation

Run the application tests, TypeScript check, worker checks and build. Paid render
validation must use a new directory and must resume its saved job ID after an
interruption. Supply `--login-file data/private/studio-login.txt` or
`--cookie-file data/private/test-session.cookie` to the smoke-test script.
Do not treat matching audio/video durations as a perceptual lip-sync score.
