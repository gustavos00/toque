# Installing the app on the iPhone

Step by step to install Toque on your iPhone with the company's Apple team, through Xcode. You need a Mac with Xcode and an iPhone with NFC (XS or newer), connected by cable.

## 0. First: publish the server

The app talks to the production server (`https://toque-two.vercel.app`). The server changes (token login, `/api/reminders`, `/api/scan`, `/.well-known`) must be published on Vercel before the app works. Deploy the branch and confirm that `https://toque-two.vercel.app/api/app-info` responds.

To point the app at another server, set `EXPO_PUBLIC_API_URL` before starting it (by default it uses production).

## 1. Prepare the project

```bash
cd mobile
npm install
npx expo prebuild --platform ios
```

`prebuild` creates the `mobile/ios/` folder, which is not committed to git. Run it again whenever you change plugins, permissions or `app.json`.

## 2. Xcode

1. Open `mobile/ios/Toque.xcworkspace` (the `.xcworkspace`, not the `.xcodeproj`).
2. Select the **Toque** target > **Signing & Capabilities**.
3. Under **Team**, choose the company team. Keep "Automatically manage signing".
4. Change the **Bundle Identifier** to one that is unique within that team, for example `com.<company>.toque`. `com.gustavo.toque` may already be taken by another team.
5. Confirm that the **Near Field Communication Tag Reading** and **Associated Domains** capabilities appear (with `applinks:toque-two.vercel.app`). If one is missing, use "+ Capability" to add it.
6. Choose your iPhone as the destination and press Run. On the iPhone, if needed: Settings > General > VPN & Device Management > trust the developer. If iOS asks, turn on Developer Mode.

## 3. Make the tags open the app

For the iPhone to open the app when a tag is tapped (instead of Safari), the server has to say which app the domain belongs to. On Vercel (Settings > Environment Variables, Production environment):

- `TOQUE_APPLE_TEAM_ID`: the team identifier, 10 characters (developer.apple.com > Membership, or Xcode > Team).
- `TOQUE_IOS_BUNDLE_ID`: only if you changed the bundle id in step 2.4.

*Redeploy* and confirm that `https://toque-two.vercel.app/.well-known/apple-app-site-association` returns JSON (until you set the team id it returns 404). If you changed the bundle id, also update `bundleIdentifier` in `mobile/app.json` and run `prebuild` again. iOS caches this file: if it doesn't work right away, delete the app, reinstall it and wait a few minutes.

## 4. Writing and reading a tag

1. Open the app and sign in with the password.
2. In the **Tags** tab, create a tag (or use an existing one), link it to a task and choose "Write to NFC tag".
3. Hold an NFC tag (an NTAG213 will do) against the top of the iPhone and wait for the confirmation.
4. Close the app and tap the tag again: the app should open and log the tap. Check it in Today or History.

## 5. Checking the alerts

1. When you first open the app, accept notifications.
2. Create an "Until done" task with a time a few minutes from now, or a short timer, and read the tag.
3. The alert should arrive on the iPhone, with "Done" and "Snooze" buttons.
4. Alerts are scheduled locally when you open the app and when you return to it; open it from time to time so they stay up to date.
