# M31 — EAS Production Builds & Store Testing Tracks

> **Estimated effort:** 3–4 hours
> **Depends on:** M29, M30, **web file 38**
> **Requirement IDs:** plan §11, §12, NFR-PERF-04
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Turn the app into signed store builds pointing at the **deployed** API, get them into TestFlight and Play internal testing, and prove on real devices that a parent can sign in, add a child, complete a lesson and see the dashboard against production infrastructure. Also configure the OTA update channel this release will be maintained through.

## Blocking dependency

**Web file 38 (deployment) must be ✅ Done.** A store build cannot point at `localhost` or a LAN IP: it needs a public HTTPS API with a stable hostname. File 38 also sets `WEB_ORIGIN`, the production Google OAuth redirect URI, `BETTER_AUTH_URL` and the Supabase production database — every one of which the mobile sign-in flow depends on. Web file 38a (custom domain) is not strictly required but is strongly preferred: a stable `api.kidlearn.net` avoids re-issuing OAuth configuration and re-building the app if the Render hostname ever changes.

Additionally, M06's server changes must be **deployed**, not merely merged: `expo()` plugin, `kidlearn://` in `trustedOrigins`, the whitelisted mobile callback and the Apple provider all have to be live for a store build to authenticate.

## Context & Current State

- `eas.json` from M01 already has `development`, `preview` and `production` profiles plus a `submit` block, and `appVersionSource: "remote"` so build numbers auto-increment on EAS rather than in the repo.
- M30 fixed the identity (`net.kidlearn.app`, version `1.0.0`), produced the assets, and created both store records with reviewer instructions.
- M29 chose the crash-reporting approach and recorded it; whatever it decided must be what the production build actually does.
- `EXPO_PUBLIC_API_URL` is baked into the bundle **at build time** (M01's note: `EXPO_PUBLIC_*` values are inlined and readable). The production build therefore needs the deployed API URL supplied through EAS, not a local env file.
- Apple credentials: the Developer Program account (M30), plus the Services ID and key for Sign in with Apple that M06's server config expects. EAS can manage the distribution certificate and provisioning profile.
- Android signing: let EAS generate and hold the upload keystore, and enable Play App Signing. **Losing an upload keystore that Play App Signing does not back is unrecoverable** — this is the one irreversible mistake available in this file.
- Free-tier realities: EAS build queues and monthly build limits on the free plan; `eas build --local` on the Mac is the escape hatch for both platforms if the queue is blocking.

## Detailed Requirements

1. **Production environment values.** Set `EXPO_PUBLIC_API_URL` to the deployed API origin as an EAS environment variable (or in the `production` profile's `env` block) so it is baked into store builds. Verify by launching a production build and confirming it talks to the deployed server, not a stale local value — a build that silently kept a LAN IP is a wasted submission.
2. **Deployment prerequisites verified before building.** A short checklist run against the deployed server: `GET /health` responds over HTTPS; `GET /api/auth/google?client=mobile` redirects with the `kidlearn://` callback; the Google console has the production redirect URI; the Apple Services ID and key are configured; `trustedOrigins` includes the scheme. Failing any of these means the build cannot authenticate, so check first rather than after a 20-minute build.
3. **Android production build.** `eas build --profile production --platform android` producing an **AAB**. Let EAS generate the upload keystore, then confirm Play App Signing is enabled in the Play Console so Google holds the app signing key. Record where the keystore lives (EAS) in `notes/store-submission.md`.
4. **iOS production build.** `eas build --profile production --platform ios` producing an IPA with the distribution certificate and provisioning profile EAS manages, `usesAppleSignIn` present, and the bundle ID matching the App Store Connect record.
5. **Submission.** `eas submit --platform android` to Play **internal testing**, `eas submit --platform ios` to **TestFlight**. Internal testing and TestFlight are the two tracks that need no review wait, which is what makes them the right place to find the "it works on my Mac" bugs.
6. **The production smoke test — the real deliverable.** On a **physical Android device** and a **physical iPhone**, installed from the store tracks (not sideloaded), against production infrastructure:
   - sign in with Google; sign in with Apple (iOS);
   - record consent, set a PIN, pass the gate;
   - add a child, activate the profile;
   - complete a full lesson through all five steps and see the reward;
   - read a story to the end;
   - check the dashboard's minutes reflect the session;
   - set a screen-time limit, trip it, and see the lock;
   - sign out and back in;
   - delete a throwaway account and confirm it is gone.
   Anything that fails here is a release blocker, not a note for later.
7. **Cold-start behaviour against the real free tier.** Measure the actual wake time of the sleeping server from a cold app launch and tune M29's escalation copy thresholds to what it really is. This is the first time the number is knowable.
8. **OTA channel configuration.** Configure `expo-updates`: a `production` channel bound to the production build profile, an explicit `runtimeVersion` policy (fingerprint or appVersion) so a JS update can never land on an incompatible native binary, and a documented rule — **JS-only fixes ship OTA; anything touching native code, permissions, SDK versions or `app.config.ts` needs a new build**. Test one OTA update end to end on the internal-testing build before relying on it.
9. **Version and build numbering.** Confirm `1.0.0` with EAS-managed build numbers, and write down the bump policy (patch for OTA-able fixes shipped as builds, minor for features) so the next release does not have to invent one.
10. **Recruit the testers M32 needs.** Google's 12-tester/14-day closed test starts in M32 but the people have to exist. Create the closed-testing track, prepare the tester list and the opt-in link, and start recruiting now — this is the calendar-critical item in the whole plan.
11. **Record everything.** Update `notes/store-submission.md` with build IDs, submission dates, track names, the OTA channel, the runtimeVersion policy, and the smoke-test results with device models.

## Technical Approach & Suggestions

```
apps/mobile/eas.json                                       # production env, channels, submit config
apps/mobile/app.config.ts                                  # runtimeVersion policy, updates config
document/implementation-mobile/notes/store-submission.md    # extended: builds, tracks, OTA, smoke test
document/implementation-mobile/notes/release-runbook.md     # started here, completed in M32
```

Production profile with the API URL baked in and the channel bound:

```json
{
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "android": { "buildType": "apk" },
      "env": { "EXPO_PUBLIC_API_URL": "https://api.kidlearn.net" }
    },
    "production": {
      "autoIncrement": true,
      "channel": "production",
      "env": { "EXPO_PUBLIC_API_URL": "https://api.kidlearn.net" }
    }
  },
  "submit": {
    "production": {
      "android": { "track": "internal" },
      "ios": { "appleId": "…", "ascAppId": "…", "appleTeamId": "…" }
    }
  }
}
```

Pin the runtime so an OTA update cannot land on the wrong native binary:

```ts
// app.config.ts
updates: { url: "https://u.expo.dev/<project-id>" },
// A fingerprint policy ties JS updates to the exact native module set they were
// built against. Without it, an OTA update can reach a binary that lacks a
// module it imports — which crashes on launch, on a device you cannot reach.
runtimeVersion: { policy: "fingerprint" },
```

Verify the baked URL before trusting the build — one command, and it saves a submission cycle:

```bash
# After installing the production build, confirm it is not pointing at a LAN IP.
# The placeholder screen from M01 is gone by now, so check the network layer
# instead: sign in and watch the deployed server's logs for the request.
```

The prerequisite check against the deployed server, worth running as a copy-pasteable block:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://api.kidlearn.net/health
curl -sSI "https://api.kidlearn.net/api/auth/google?client=mobile" | grep -i location
```

Record the smoke test as a table with device model, OS version, pass/fail per step. "It worked" three weeks later is not evidence when a reviewer reports the opposite.

## Step-by-Step Plan

1. Confirm web file 38 is ✅ Done and M06's server changes are deployed; run the prerequisite checklist against the live API. (~30 min)
2. Set the production `EXPO_PUBLIC_API_URL` in EAS and update `eas.json`'s profiles, channels and submit config. (~25 min)
3. Configure `expo-updates` and the `runtimeVersion` policy in `app.config.ts`. (~20 min)
4. Run the Android production build; enable Play App Signing; record where the keystore lives. (~40 min including queue time)
5. Submit to Play internal testing and install on a physical Android device from the track. (~25 min)
6. Run the iOS production build with EAS-managed credentials; submit to TestFlight; install on a physical iPhone. (~45 min including queue and processing)
7. Run the full production smoke test on both devices, recording results per step. Fix any blocker and rebuild. (~60 min)
8. Measure the real cold-start wake time and tune M29's escalation thresholds. (~20 min)
9. Test one OTA update end to end on the internal build (change a string, `eas update --branch production`, confirm it lands and that a native-change attempt is correctly refused by the runtime policy). (~30 min)
10. Create the Play closed-testing track and start recruiting the 12 testers M32 needs. (~25 min)
11. Update `notes/store-submission.md`, start `notes/release-runbook.md`, commit, update the tracker. (~25 min)

## Acceptance Criteria

- [ ] Store builds point at the **deployed** HTTPS API, verified by observing requests reaching the production server from an installed build.
- [ ] The pre-build prerequisite checklist passed against the live API: health, mobile OAuth redirect, Google redirect URI, Apple credentials, `trustedOrigins`.
- [ ] An Android AAB is in Play **internal testing** and installs on a physical device; Play App Signing is enabled and the upload keystore's location is recorded.
- [ ] An iOS build is in **TestFlight** and installs on a physical iPhone, with Sign in with Apple working.
- [ ] The full production smoke test passes on both platforms — sign-in (both providers on iOS), consent, PIN, child creation, a complete lesson with reward, a story, dashboard minutes, a screen-time lock, sign-out/in, and account deletion — with results recorded per device.
- [ ] The real free-tier cold-start wake time is measured and M29's escalation copy matches it.
- [ ] `expo-updates` is configured with a `production` channel and an explicit `runtimeVersion` policy, and one OTA update has been shipped and verified on the internal build.
- [ ] The OTA rule ("JS-only OTA; native, permission, SDK or config changes need a build") is written down.
- [ ] Version `1.0.0` with EAS-managed build numbers, and a written bump policy.
- [ ] The Play closed-testing track exists and tester recruitment has started.
- [ ] `notes/store-submission.md` records build IDs, tracks, dates, OTA configuration and the smoke-test table.

## Out of Scope

- The closed test itself, the production release and the review correspondence — M32.
- Automating builds in CI. Worth doing for a team; for a solo project the EAS CLI is enough, and adding CI now is a second thing to debug during a launch.
- Server deployment or keep-warm — web file 38.
- Feature work. Anything found in the smoke test that is not a blocker goes to a backlog, not into this file.
- Marketing or launch announcements.
