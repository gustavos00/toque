# Notifications with ntfy

Toque does not send push notifications directly: it publishes messages to a **topic** on [ntfy.sh](https://ntfy.sh) and the ntfy app on the iPhone shows them. It is free and needs no account.

## 1. Install the app

1. On the iPhone, open the App Store and install **ntfy** (developer: Philipp Heckel).
2. Open the app and, when asked, **allow notifications**.
3. In *Settings → Notifications → ntfy*, confirm that *Lock Screen*, *Notification Centre* and *Banners* are on. If you want the bin alerts to break through Focus mode, also turn on *Time Sensitive Notifications*.

## 2. Choose a random topic

On the public ntfy.sh there are **no passwords**: anyone who knows the topic name can read its notifications and send fake messages to your phone. The topic name is therefore **the only secret**. It must be long and impossible to guess: no `toque`, `home-<your-name>` or the like.

Generate one on Mac/Linux:

```bash
echo "toque-$(openssl rand -hex 16)"
# example: toque-3f9c2a7b1e6d4058a2c7e9b0d1f4a6c8
```

Keep that value: it is the `NTFY_TOPIC` you will set on Vercel (see [deploy.md](deploy.md)). Don't publish it in Git, in screenshots or in messages.

## 3. Subscribe to the topic on the iPhone

1. In the ntfy app, tap **+** (top right corner).
2. In *Topic name*, paste the topic generated above.
3. Leave *Use another server* off (it uses `https://ntfy.sh`), unless you have your own server; in that case use the same address you set in `NTFY_BASE_URL`.
4. Tap **Subscribe**.

## 4. Test with `curl`

In a terminal (replace with your topic):

```bash
curl -d "Toque test 👋" https://ntfy.sh/toque-<your-topic>
```

With a title, priority and tag (this is the same format Toque uses):

```bash
curl \
  -H "Title: Washing machine" \
  -H "Priority: high" \
  -H "Tags: basket" \
  -d "The laundry is ready to hang out." \
  https://ntfy.sh/toque-<your-topic>
```

The notification should appear on the iPhone within a few seconds. If it doesn't:

- confirm that the topic in the app is **exactly** the same (no trailing spaces);
- open the ntfy app once, since on iOS the first delivery may depend on it;
- check the permissions in *Settings → Notifications → ntfy*;
- check whether Focus mode is silencing the app.

## 5. Environment variables used by Toque

| Variable | Required | Purpose |
| --- | --- | --- |
| `NTFY_TOPIC` | yes, unless you set the topic in Settings | The random topic above. |
| `NTFY_BASE_URL` | no | ntfy server. Defaults to `https://ntfy.sh`. |
| `NTFY_TOKEN` | no | Only if you use an ntfy server with authentication (or a paid ntfy.sh account with reserved topics). Sent as `Authorization: Bearer …`. It exists only as an environment variable. |
| `TOQUE_ACTION_SECRET` | recommended | At least 16 characters. Signs the "Done" / "Snooze" buttons on notifications. |
| `TOQUE_PUBLIC_URL` | recommended | Public address of the app, used in the buttons and in the link when you tap the notification. |

### Which value wins

The app's **Settings** win over environment variables:

- **Topic**: the one in Settings, if filled in; otherwise `NTFY_TOPIC`.
- **Server**: the one in Settings, only if you changed it from `https://ntfy.sh`; otherwise `NTFY_BASE_URL`; if that is also empty, `https://ntfy.sh`.
- **Token**: only `NTFY_TOKEN` (there is no field in Settings).

Without a topic (neither in Settings nor in `NTFY_TOPIC`), sending is off: Toque keeps working and the alerts wait. When you configure a topic, it sends only the most recent alert of each task (you don't get an avalanche of old alerts).

### Notification buttons and link

- Without `TOQUE_ACTION_SECRET` (or with fewer than 16 characters), notifications arrive **without buttons** and `/api/actions/…` answers 403.
- The address for the buttons and the link comes from `TOQUE_PUBLIC_URL`; if it is missing, the Vercel production domain is used (`VERCEL_PROJECT_PRODUCTION_URL`, automatic on Vercel). With neither, notifications arrive without buttons and without a link.

## Changing topic

If you suspect the topic was exposed: generate another, update it in Toque's Settings (or in `NTFY_TOPIC` on Vercel, followed by a *Redeploy*), subscribe to the new topic in the app and delete the old one (swipe left in the list).
