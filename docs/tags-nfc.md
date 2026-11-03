# Writing and sticking the NFC tags

Each Toque task has a tag with a unique address, like:

```
https://toque.example.pt/t/AbC123…
```

Holding the iPhone against the tag opens that address and logs the tap. **No signed-in session is needed**: the code at the end of the address (the *token*) is the credential. Treat it like a key: whoever has it can log taps on that task (and only that one).

## 1. Which tags to buy

| Tag | Usable memory | Notes |
| --- | --- | --- |
| **NTAG213** | 144 bytes | Plenty for a Toque URL. The cheapest. |
| NTAG215 | 504 bytes | Also works. |
| NTAG216 | 888 bytes | Also works; only makes sense if you want to store more records. |

All of them work with the iPhone (XS or newer reads tags in the background).

**Metal surfaces** (washing machine, fridge, metal door): a normal tag stuck directly on metal **is not read**, because the metal cancels the antenna. Use one of:

- **on-metal / anti-metal** tags (they have a built-in ferrite layer; search for "NTAG213 anti-metal");
- a normal tag on top of a **ferrite sheet** (sold as rolls/stickers, "ferrite sheet NFC").

On plastic, wood or glass any NTAG21x tag will do. Round stickers of 25–30 mm are a good size.

## 2. Getting the tag's address

In Toque, create the task and open **its tag** (on the task screen). Copy the full address `https://…/t/<token>`. A task can have **more than one tag**, each with its own token and its own action. The washing machine uses two: a **"Start"** tag (on the machine, starts the timer) and a **"Complete"** tag (on the drying rack, marks the laundry as hung out). The address format is the same; only the token changes, so write each address on the right tag.

Always use the final domain (see [deploy.md](deploy.md)); if you change domain you will have to rewrite all the tags.

## 3. Writing with the NFC Tools app (free)

1. Install **NFC Tools** (wakdev) from the App Store.
2. Open the app → **Write**.
3. **Add a record** → **URL / URI**.
4. Paste the tag's full address (make sure it starts with `https://`) and tap **OK**.
5. Tap **Write / X bytes** and hold the top back of the iPhone against the tag until the tick appears.
6. Test: lock and unlock the iPhone, hold it against the tag; an "Open in Safari" notification should appear (see section 5).

Write **a single URL record** per tag. Extra records (text, contacts) may stop the iPhone from opening the link in the background.

## 4. Locking the tag (optional, irreversible)

In NFC Tools → **Other** → **Lock tag** the tag becomes read-only, so nobody can rewrite it with another address.

> ⚠️ **It is irreversible.** A locked tag can never be written again. If you later regenerate the task's token or change domain, you will have to throw the tag away and use a new one. Recommendation: only lock it after using Toque for a few weeks with the final domain.

Don't use NFC Tools' "password" option: on some models the iPhone can no longer read the tag in the background.

## 5. How the iPhone opens the link

- With the iPhone **unlocked** and the screen on, hold the top back of the phone against the tag.
- With the Toque app installed, iOS opens it directly (Universal Link `https://…/t/<token>`) in a small "task · Done / Snooze" panel. The tap is only logged when you choose **Done**.
- Without the app, a minimal "Open the Toque app" page opens in Safari.
- It doesn't work with the screen off, with the camera open, during a call, or in Control Centre/Wallet.

## 6. Writing and reading tags in the app itself

On the app's **NFC tag** screen, **Write tag** writes the tag's `https://…/t/<token>` URL (a single NDEF record) and **Read tag** shows what the tag already contains. No external app is needed.

## 7. Where to stick them

| Task | Where | Why |
| --- | --- | --- |
| Bins (*until done*) | Inside the **front door**, at hand height, or on the bin | You tap it on the way out with the bag; it confirms it was taken out. |
| Washing machine, **"Start"** tag (*timer*) | **Side or top** of the machine, away from the panel and the door (anti-metal tag!) | You tap it when you press "start"; Toque notifies you when it ends. Tapping again while it runs only shows how much time is left. |
| Washing machine, **"Complete"** tag | On the **drying rack** (or the laundry basket) | You tap it after hanging the laundry out: it marks the laundry as handled and stops the "forgotten laundry" reminders. |
| Recurring tasks | Next to the object (filter, plants, litter box…) | You tap it when you finish the task. |

Tips:

- Test the reading in place **before** sticking it down for good; walls with pipes or metal sheets also get in the way.
- Clean the surface with alcohol before sticking.
- A small label or icon on top helps visitors understand what it is for.
- Avoid damp or very hot places (behind the machine, next to the oven).
