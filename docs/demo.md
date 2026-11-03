# Public demo

The demo is a separate Toque installation, open to anyone, for trying the app without touching the personal installation. It uses the **same code** (same repository) with `NEXT_PUBLIC_TOQUE_DEMO=1`.

## What the visitor sees

- **Login with the password `demo` already filled in** (and visible): just press **Sign in**. In demo mode the server's `TOQUE_PASSWORD` is ignored; only `demo` gets in.
- A **"Demo"** label in the header of every screen.
- Everything to do with tasks works: creating and editing tasks, creating tags, opening `/t/<token>` (the tap), dashboard and history.

## What is blocked

| Feature | In the interface | On the server |
| --- | --- | --- |
| **ntfy** (notifications) | The *Topic* field appears disabled, with "Unavailable in the demo". | A `PATCH /api/settings` that touches `ntfy` answers **403** `{ "error": "Unavailable in the demo" }`. The engine sends nothing (the notifier is a no-op). |
| **Google Calendar** | The section appears, but **Connect to Google** is disabled. | `/api/google/connect` and `/api/google/callback` redirect to `/definicoes?google=demo`; `resync` and `disconnect` answer **403**. The calendar is a no-op. |

The rest of the settings (quiet hours, defaults) can be changed.

## Data wiped every 5 minutes

The demo database **cleans itself**: the first request made after 5 minutes have passed since the last cleanup deletes **tasks, tags, history, pending notifications and settings** (function `maybeResetDemoData`). No cron or secret is involved; it is lazy, so with no visits nothing runs.

Consequence: a visitor may see the data disappear in the middle of a visit. Don't store anything there.

## Personal data

The demo **has no personal data**: its own empty database, no ntfy topic, no Google connection, and the password is public. The session secrets in demo mode are fixed and public on purpose (they protect nothing that matters); **never** enable `NEXT_PUBLIC_TOQUE_DEMO` on the personal installation.

## How it is published

It is a **second Vercel project** (`toque-demo`), linked to the same repository, with its **own Neon database** (empty):

1. Vercel → **Add New… → Project** → the same repository → name `toque-demo`.
2. **Storage → Create Database → Neon** (Free, Frankfurt), connected only to `toque-demo`, prefix `DATABASE`; see [deploy.md](deploy.md), step 3. **Do not reuse the personal database.**
3. **Settings → Environment Variables** (Production):

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_TOQUE_DEMO` | `1` |
   | `DATABASE_URL` | created by Neon |

   Don't set `NTFY_*`, `GOOGLE_*`, `TOQUE_ENCRYPTION_KEY` or any secrets from the personal installation. Since `NEXT_PUBLIC_*` is embedded in the build, changing this variable requires a **Redeploy**.

4. The build is the same as the main project's (`npm run db:migrate && npm run build`, in `vercel.json`), so migrations run on every deploy.
5. cron-job.org is not needed: without ntfy there are no alerts to send, and the data cleanup does not depend on the cron.

## Tests

```bash
npm run test:e2e:demo
```

It makes its own build with `NEXT_PUBLIC_TOQUE_DEMO=1` in `.next-demo` (so the normal build in `.next` is not disturbed) and serves it on port 4421 with an in-memory PGlite database. It checks the login with `demo`, the disabled fields, the ntfy and Google 403s/redirects, and that tasks, tags and the tap on `/t/<token>` work. The 5-minute cleanup is tested in the unit tests (without waiting 5 real minutes).
