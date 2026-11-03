# Putting Toque online (free)

Everything in this guide uses **free** plans: Vercel Hobby, Neon Free (through the Vercel Marketplace), cron-job.org and ntfy.sh. Only a custom domain costs money (and it is optional; the `*.vercel.app` address also works).

Estimated time: 30–45 minutes. This is how Toque is published at `https://toque-two.vercel.app`.

## 0. What you need

- A [GitHub](https://github.com) account with the Toque repository.
- A [Vercel](https://vercel.com/signup) account (sign in with GitHub, **Hobby** plan).
- A [cron-job.org](https://console.cron-job.org/signup) account.
- The **ntfy** app on the iPhone; see [ntfy.md](ntfy.md).
- On the computer: Node.js 22+ and `openssl` (already included on macOS).

## 1. Commit author (GitHub noreply email)

Vercel Hobby **blocks the deploy** when the commit author doesn't match a GitHub account linked to Vercel. The error appears as *"couldn't find a Git account for the commit author"*. Use GitHub's **noreply** email in the Toque repository:

1. GitHub → **Settings → Emails**: copy the address `NNNNNNNN+username@users.noreply.github.com` (and, while you're there, turn on *Keep my email addresses private*).
2. In the project folder (this repository only):

   ```bash
   git config user.email "NNNNNNNN+username@users.noreply.github.com"
   git config user.name "Your name"
   ```

3. If you already have unpublished commits with another email, fix the last one with `git commit --amend --reset-author --no-edit`. An empty commit also forces a new deploy: `git commit --allow-empty -m "chore: trigger production deploy"`.

## 2. Import the project into Vercel

1. Vercel → **Add New… → Project** → choose the `toque` repository → **Import**.
2. *Framework Preset*: **Next.js** (detected automatically). Don't change the commands: `vercel.json` already sets the build to `npm run db:migrate && npm run build`.
3. The first deploy **will fail** (there is no database yet, and `db:migrate` refuses to continue without `DATABASE_URL`). That's normal; it runs again in step 5.

What `vercel.json` does:

- `regions: ["fra1"]`: the functions run in Frankfurt, close to Lisbon and to the database.
- `buildCommand`: **applies the migrations on every deploy**, before `next build`. You don't need to run migrations by hand.

The project ends up at `https://<project-name>.vercel.app` (e.g. `https://toque-two.vercel.app`).

## 3. Create the Neon database (Vercel Marketplace)

1. In the project, **Storage** tab → **Create Database** → **Neon** (Serverless Postgres) → **Continue**.
2. Accept the creation of the Neon account linked to Vercel.
3. Plan: **Free**. Region: **AWS Europe Central 1 (Frankfurt)**, `aws-eu-central-1`.
4. Name: `toque`. **Create**.
5. Under *Connect Project*, choose the `toque` project, tick **Production** and **Preview** and, in *Environment Variables Prefix*, type **`DATABASE`**. That way the variable is named exactly `DATABASE_URL`, which is the name Toque reads.
6. In **Settings → Environment Variables**, confirm that `DATABASE_URL` exists (Neon also creates `DATABASE_URL_UNPOOLED`, `DATABASE_PGHOST`…; they can stay).

Without `DATABASE_URL`, Toque would use PGlite (a local file), which only works on the computer; on Vercel the build fails on purpose with *"DATABASE_URL is missing"*.

## 4. Secrets with the script (recommended)

The script `scripts/setup-vercel-env.sh` generates the secrets on your computer and sends them straight to Vercel; they don't end up in files, in Git or in messages. **Run it yourself**; don't paste secrets into chats.

```bash
npm ci
npx vercel login          # once
npx vercel link           # choose the toque project
bash scripts/setup-vercel-env.sh
```

The script asks for the sign-in password (twice, without showing it) and creates in **Production**:

| Variable | Value |
| --- | --- |
| `TOQUE_PASSWORD` | The password you typed. |
| `TOQUE_SESSION_SECRET` | Random; signs the session cookie. |
| `TOQUE_ACTION_SECRET` | Random; signs the "Done" / "Snooze" buttons on notifications. |
| `TOQUE_CRON_SECRET` | Random (hex); protects `/api/tick`. |

At the end it **shows once** the cron's `Bearer …` value: copy it right away into cron-job.org (step 8) or into your password manager.

For the Google Calendar integration, also run `bash scripts/setup-vercel-env.sh --google`; see [google-calendar.md](google-calendar.md).

Running the script again **replaces** the secrets: sessions end (it asks for the password again), the buttons on old notifications stop working and you have to update the header in cron-job.org.

### Other variables (optional)

In **Settings → Environment Variables** (tick *Sensitive* for the secrets):

| Variable | When |
| --- | --- |
| `TOQUE_PUBLIC_URL` | Only with a custom domain, e.g. `https://toque.example.pt` (no trailing `/`). Without it, tags use the address you opened the app from and notifications use the Vercel production domain. |
| `NTFY_TOPIC` | Usually not needed: the topic is chosen in the app's **Settings** (which take priority). See [ntfy.md](ntfy.md). |
| `NTFY_BASE_URL`, `NTFY_TOKEN` | Only for your own ntfy server or one with authentication. |

Don't set `TOQUE_PGLITE_DIR` or `NEXT_PUBLIC_TOQUE_MOCKS` on Vercel; they are only for development and tests.

## 5. Deploy

Changing variables does **not** update the running deploy. After step 4: **Deployments → ⋯ → Redeploy** (or `git push` to the main branch).

In the build log you should see `Migrations applied (Neon).` before `next build`. When it is *Ready*, open `https://toque-two.vercel.app` (or your address), sign in with the password and confirm that the dashboard appears.

On the iPhone: open the address in **Safari** → Share button → **Add to Home Screen**.

If the deploy fails:

| Message | What to do |
| --- | --- |
| *couldn't find a Git account for the commit author* | Commit author with the wrong email; step 1. |
| *DATABASE_URL is missing* | The database isn't connected to the project or the prefix isn't `DATABASE`; step 3. |
| Migration error | See the message in the build log; the previous deploy stays live. |

## 6. Updates

Every `git push` to the main branch deploys and applies new migrations automatically. Just make sure the commits use the noreply email (step 1).

## 7. Custom domain (optional)

1. Project → **Settings → Domains** → **Add** → type, for example, `toque.example.pt`.
2. Vercel shows the DNS record to create:
   - subdomain (`toque.example.pt`): **CNAME** record `toque` → `cname.vercel-dns.com` (use the exact value Vercel gives);
   - root domain (`example.pt`): **A** record `@` → the IP Vercel gives.
3. Create the record in your registrar's panel (PTisp, Amen, Cloudflare…). If you use Cloudflare, set the record to **DNS only** (grey cloud).
4. Wait until Vercel shows **Valid Configuration** (minutes to a few hours). The HTTPS certificate is automatic.
5. Create `TOQUE_PUBLIC_URL` = `https://toque.example.pt` and *Redeploy*.
6. If you use Google Calendar, add the new redirect address in Google Cloud; see [google-calendar.md](google-calendar.md).

**Choose the domain before writing the tags**, because the URL is written on each tag (see [tags-nfc.md](tags-nfc.md)).

## 8. Cron: call `/api/tick` every minute (cron-job.org)

Vercel's Hobby plan only allows crons once a day, so we use cron-job.org (free) to call Toque every minute. That "tick" sends the notifications that are due.

1. [console.cron-job.org](https://console.cron-job.org) → **Create cronjob**.
2. **Common**:
   - *Title*: `Toque tick`
   - *URL*: `https://toque-two.vercel.app/api/tick` (or your domain)
   - *Enable job*: on
   - *Execution schedule*: **Every 1 minute(s)**
3. **Advanced**:
   - *Request method*: **GET**
   - *Headers* → **Add header**: Key `Authorization`, Value `Bearer <TOQUE_CRON_SECRET>` (the word `Bearer`, a space, and the secret, without quotes)
   - *Timeout*: 30 seconds
   - *Treat redirects with HTTP 3xx status code as success*: **off** (a redirect means the address is wrong, for example `http://` or missing `www`)
4. **Notifications** (in the account's or the job's *Settings*): turn on *Notify me when … execution of the job fails* and *… the job will be disabled because of too many failures*.
5. **Create**. Then use **Test run** (or *Perform test run*): the response should be **200**.

Manual check in the terminal:

```bash
curl -i -H "Authorization: Bearer <cron secret>" https://toque-two.vercel.app/api/tick
# HTTP/2 200

curl -i https://toque-two.vercel.app/api/tick
# HTTP/2 401  ← without the secret it must be refused
```

### If the cron fails

See the history in cron-job.org → **History** → click the execution to see the code and the response.

| Code | Likely cause | What to do |
| --- | --- | --- |
| **401** | Missing header or wrong secret | Confirm `Bearer ` + secret, with no extra spaces; confirm it is the value the script showed (if you ran the script again, the secret changed) and that you did a *Redeploy* after changing it. |
| **404** | Wrong URL | It must end in `/api/tick`. |
| **3xx** | Redirect | Use `https://` and the exact domain (with/without `www`) that Vercel serves. |
| **500** | App error | Vercel → project → **Logs**, filter by `/api/tick`. Common cause: `DATABASE_URL` missing (step 3) or the last deploy failed on migrations. |
| **Timeout** | Database "waking up" | Neon Free suspends the database when idle; the first request takes a few seconds. With the cron every minute it rarely happens. If it repeats, raise the *timeout* to 30 s. |

cron-job.org **disables the job** after many failures in a row. After fixing the problem, turn *Enable job* back on.

## 9. Check with a test notification

1. Confirm that you subscribed to the topic in the ntfy app ([ntfy.md](ntfy.md)) and that a test `curl` reaches the iPhone.
2. In Toque, create a **Timer** task with a duration of **1 minute** (turn off the "almost done" warning, which must come before the end) and create that task's tag.
3. Open the tag's URL (`https://…/t/<token>`) on the iPhone; it should show confirmation that the timer started.
4. Within 1–2 minutes (the cron's next "tick") the end notification should arrive on the iPhone.
5. If it doesn't arrive: check the cron-job.org history (step 8), the Vercel **Logs** and whether the topic is right (the one in the app's Settings, if filled in, or `NTFY_TOPIC`). Remember that Toque doesn't send alerts during **quiet hours** (23:00–07:30 by default), configurable in the settings.

After the test, delete the 1-minute task (or change the duration) and write the final tags; see [tags-nfc.md](tags-nfc.md).

## Summary of the free limits

- **Vercel Hobby**: personal, non-commercial use; plenty of headroom for 1 user and 1 cron request per minute (~43,200 requests/month).
- **Neon Free**: 0.5 GB of storage; the database suspends after a few minutes of inactivity and wakes on the next request.
- **cron-job.org**: free, executions up to once per minute.
- **ntfy.sh**: free, no account; generous message limit per day for a personal topic.
