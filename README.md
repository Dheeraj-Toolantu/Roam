# ROAM 2.0 — Travel Social Network

*Explore Together. Experience More. Remember Forever.*

Mobile-first travel social app built from the **ROAM 2.0 Business Requirements Document** and the UI mock-up.
React Native (Expo SDK 58, expo-router, TypeScript) on **Firebase** (Auth, Cloud Firestore, Storage, Cloud Functions).
One codebase runs on **Android, iOS and Web**.

| | |
|---|---|
| **Live location & Google Maps** | Location detected automatically after sign-in and shown as a place name ("📍 Baga, Goa, India · LIVE"), with reverse geocoding (device geocoder on iOS/Android, Google Geocoder on web). Google Maps on the Live Map (follow-me, live blue dot with accuracy circle, nearby destinations), the active journey (live route), completed journeys, crew trip map, city pages and the City Memory Map. **Opt-in** live location sharing with a crew, visible to trip members only (BR-006) |
| **Journeys** | Start solo/group journeys, GPS tracking with jitter/speed filtering, pause/resume/end, live timer, distance, city & country detection, timeline, edit/exclude, delete location history, "you left the city – end journey?" prompt |
| **Capture** | Camera or upload photo/video → attached to the active journey with time + place; per-post visibility (Only me / Followers / Crew / Public); resumable uploads with retry |
| **ROAM Magic** | In-app cinematic video rendered from real journey data: the 7 BRD scenes (Earth → Country → City → animated route → memories → summary → closing), 3 templates, music choice, save/share; group videos respect member opt-outs |
| **Social** | Feed (public + followers-only + own), likes, comments, save, share, follow/unfollow, report, block, notifications with per-type preferences |
| **Explore** | Destination search, trending destinations, City Hub pages, City Memory Map (city-level only), Live World globe (opt-in, city-level presence), traveller discovery, Smart Trip Planner (rule-based beta) |
| **ROAM CREW** | Create group trips, invite by @username / link / WhatsApp / 8-char code, accept/decline, shared timeline with comments & person filter, group album, group map (journeys explicitly shared with the crew), member & admin management, leave trip |
| **ROAM SPLIT** | Equal / selective / unequal / percentage / personal splits in integer paise, payer & participants, receipts, live allocation preview, idempotent submit, balances, minimum-transfer settlement suggestions, record → receiver confirms, settlement history, budget with alerts, category breakdown, **server-side validation + audit log (Cloud Functions)** |
| **Passport** | Countries, cities, places, distance, globe, 7 achievements with progress, share achievements |
| **Admin** | Analytics counts, reports queue (remove content / suspend / dismiss), user lookup & suspend |

## Quick start (local, no Firebase project needed)

Requirements: Node 20+ and Java 11+ (for the Firebase emulators).

```bash
npm install
npm --prefix functions install
```

```bash
npm run emulators          # Auth, Firestore, Storage, Functions emulators (project demo-roam)
```

In a second terminal:

```bash
npm run web:emulators      # opens the app in the browser against the emulators
```

On a phone with **Expo Go**, set `EXPO_PUBLIC_USE_EMULATORS=1` and `EXPO_PUBLIC_EMULATOR_HOST=<your computer's LAN IP>` in `.env`, then run `npx expo start` and scan the QR code.

## Connect a real Firebase project

1. Create a project at <https://console.firebase.google.com> and enable **Authentication** (Email/Password, plus Google/Apple if wanted), **Cloud Firestore**, and **Storage**. Cloud Functions require the Blaze (pay-as-you-go) plan.
2. Add a **Web app** and copy its config into `.env` (see `.env.example`).
3. Deploy rules, indexes and functions:
   ```bash
   npx firebase login
   npx firebase use --add          # pick your project
   npm run deploy:backend          # firestore rules + indexes, storage rules, functions
   ```
4. Make yourself an admin: in Firestore create a document `admins/<your uid>` (any content).
5. Build the apps with EAS: `npx eas-cli@latest build --platform android` (or `ios`), or deploy the web build with `npm run build:web && npx firebase deploy --only hosting`.

## Google Maps & live location setup

1. In [Google Cloud console](https://console.cloud.google.com/google/maps-apis) enable **Maps SDK for Android**, **Maps SDK for iOS**, **Maps JavaScript API** and **Geocoding API**, and create an API key (or one key per platform).
2. Restrict the key(s): Android package `app.roam.mobile`, iOS bundle `app.roam.mobile`, web HTTP referrers of your domain.
3. Add to `.env`:
   ```
   EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=...        # web + default for native
   GOOGLE_MAPS_ANDROID_API_KEY=...            # optional, Android-only key
   GOOGLE_MAPS_IOS_API_KEY=...                # optional, iOS-only key
   ```
4. Native apps need a development/production build (`npx eas-cli@latest build`), because `app.config.js` writes the keys into the native projects. In Expo Go, Android shows Google Maps and iOS falls back to Apple Maps.

Without a key, maps still load on web but Google shows a "for development purposes only" notice.

How location works:
- **Detection.** After sign-in the app asks for location permission and detects your position.
- **Live updates.** Map screens and crew sharing use a shared, reference-counted live watcher (`src/services/location.ts`); journey tracking feeds the same store.
- **Crew sharing** is off by default and turned on per trip (trip → Map tab, or trip settings). Updates go to `groups/{id}/live/{uid}`, throttled to at most one every 20 s and only after moving 25 m or more, with a 2-minute heartbeat (`src/logic/live.ts`). The entry is deleted when you turn sharing off, leave the trip or sign out. Only members can read it (see `firestore.rules`).

## Tests

```bash
npm test                 # 36 unit tests: split maths (incl. BRD §12.4 example), journey maths, achievements, planner
npm run test:emulator    # 30 security-rule tests + 4 Cloud Functions integration tests on the emulators
npm run test:e2e         # builds the web app and drives 3 users through 22 end-to-end flows in a phone viewport
npm run typecheck && npm run lint
```

The E2E run covers acceptance criteria AC-001 to AC-017 plus live location and Google Maps: sign-up, automatic location detection, the Live Map following simulated movement, opt-in crew live sharing on and off, GPS journey with simulated movement, capture and upload, pause/resume/end, Magic video, crew create/join/timeline/notifications, expenses, server-verified balances and budget alert, settle-up, feed likes, follow, Explore, Passport, a non-member being blocked, and sign-out. Screenshots are written to `e2e/screenshots/`.

> Behind a corporate/egress proxy, firebase-tools ignores `NO_PROXY` for its own emulator traffic. The npm scripts preload `scripts/loopback-no-proxy.cjs`, which sends only localhost traffic direct.

## Architecture

```
src/
  app/                  expo-router screens
    (app)/(tabs)/       Home · Explore · Capture(+) · Journeys · Crew · Profile
    (app)/journey/      start, active/completed journey
    (app)/trip/         ROAM CREW + ROAM SPLIT screens (dashboard, invite, split, add-expense, settle, settings)
    (app)/…             magic, passport, city, memory-map, planner, user, post, notifications, settings, admin
    login, signup, onboarding, profile-setup
  components/           UI kit (theme from the mock-up), maps (SVG route map + globe), MagicPlayer, PostCard…
  logic/                pure, unit-tested business logic (split.ts is shared with Cloud Functions)
  services/             Firestore/Storage access per domain + GPS tracker
  lib/                  firebase init (+ emulator wiring), session/auth context
functions/              Cloud Functions: expense validation, balances, audit log, budget alerts
firestore.rules         access control and privacy rules (tested in tests/emulator/rules.test.ts)
```

**Privacy by design (BRD §5.4, §16.4, BR-005..BR-014):** precise GPS points live in `journeys/{id}/locations`, which only the owner can read, whatever the journey's visibility. Live World and the City Memory Map only ever use city-level data. Joining a crew never shares live location. Group content is members-only. Settlements must be confirmed by the receiver. Expenses are soft-deleted only and audited server-side.

## Not yet implemented / next steps

These are deliberately out of scope for this MVP or need accounts and keys that weren't available:

- **MP4 export of Magic videos.** Videos play in-app from live data; server rendering with FFmpeg/Remotion on Cloud Run is the next step.
- **Background location** while the app is closed (journey tracking and crew live sharing work while the app is open). This needs `expo-task-manager` plus a development build with background-location entitlements. Tracking currently runs while the app is open.
- **Native Google/Apple sign-in** (popup sign-in works on web), **phone OTP**, and **push notifications (FCM)**. These need native credentials and a development build. In-app notifications work today.
- **OCR receipt scanning, AI travel assistant, premium subscriptions.** These are BRD Phase 5.
