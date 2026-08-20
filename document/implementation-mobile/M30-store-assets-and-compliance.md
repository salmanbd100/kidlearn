# M30 — App Identity, Store Assets & Compliance

> **Estimated effort:** 4–5 hours
> **Depends on:** M28
> **Requirement IDs:** plan §12, NFR-SAFE-01..06
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Everything the two stores ask for that is not code: final app identity (icon, splash, adaptive icon, names), screenshots in EN and BN, store listings, a published privacy policy, the Apple Kids Category answers, Google's Families declarations, the Data Safety form, and the IARC content rating. This is the file most likely to be underestimated and the one most likely to cause a rejection if it is rushed.

## Context & Current State

- Neither developer account exists yet (plan §12). **Start enrolment before this file's work, not after** — Apple's Developer Program ($99/year) and Google Play Console ($25 one-off) both involve identity verification that takes days, and Google adds the 12-tester/14-day closed-test rule for new personal accounts, which M32 absorbs.
- App identity from M01: `name: "KidLearn"`, `slug: "kidlearn"`, `scheme: "kidlearn"`, bundle ID and Android package `net.kidlearn.app`. **These are permanent after first submission** — this is the last moment to change them.
- The compliance shape of this app (plan §12.2):
  - **Apple Kids Category** (guidelines 1.3, 5.1.4): no third-party advertising; no third-party analytics without verifiable parental consent; a parental gate before external links, purchases and any adult-facing area; a privacy policy URL. The PIN gate (M08) satisfies the gate; the "no ads, no analytics" position must be *true*, which is what M29's observability decision determines.
  - **Guideline 4.8** — Sign in with Apple, already implemented in M06/M07 because Google is otherwise the only sign-in.
  - **Google Play Families / Designed for Families**: target age group declaration, Data Safety form, IARC rating questionnaire, ads policy (none).
  - **Account deletion**: both stores require in-app deletion **and** a public web URL. M08 ships the in-app flow over web file 10's endpoints; the URL is this file's job.
- Data actually collected, which is what the declarations must say: the parent's Google/Apple account identity (email, name) for authentication; a **child's first name, age, grade and language**; learning progress and time. A child's first name is personal data and must be declared. M29's `notes/observability.md` states whether any third-party SDK receives anything — the Data Safety form must match it exactly.
- `document/implementation/notes/compliance-consent-deletion.md` already records the project's consent and deletion posture; read it and keep the store answers consistent with it rather than writing a second, subtly different account.
- Localisation: the app ships EN and BN, so listings and screenshots should exist in both. Bangladesh/Bengali is a real target market, not an afterthought.

## Detailed Requirements

1. **Final identity check.** Confirm the app name (store display name may differ from the on-device name), bundle ID and package, scheme, and version/build numbering. Set `version` in `app.config.ts` and use EAS's remote `appVersionSource` (M01's `eas.json`) so build numbers auto-increment. Decide the launch version explicitly (`1.0.0`).
2. **Icon set.** A 1024×1024 master icon with no transparency and no rounded corners (both platforms apply their own masking), an **Android adaptive icon** (separate foreground and background layers, with the critical content inside the safe circle — a full-bleed icon will be cropped), and a monochrome layer for Android 13+ themed icons. Test on a real launcher: adaptive icons look wrong surprisingly often.
3. **Splash screen.** `expo-splash-screen` configured with a background colour from `@kidlearn/tokens` and a centred mark that survives every aspect ratio. Verify on a tall phone, a short phone and a tablet — a splash that is fine on a 19.5:9 phone can crop badly on a 4:3 tablet.
4. **Screenshots.** For each required device size on both stores, in **EN and BN**: the student home, a lesson activity, the reward celebration, a story page, and the parent dashboard. Captured from the app on a real device or simulator at the required resolutions. **No fabricated data** — use the seeded child, and use a plausible child's first name that is not a real child's.
5. **Listings, written in both languages.** App name, subtitle/short description, full description, keywords (iOS), category (Education; Apple's Kids Category age band 5 and under or 6–8 — pick the one matching ages 3–6 and note the choice), support URL, marketing URL if any, and the privacy policy URL. Parent-facing tone (design.md §10): clear, calm, no dark patterns, no claims about learning outcomes that are not evidenced.
6. **Privacy policy — written and published.** Must cover: what is collected (the list above), why, the legal basis, retention, that children have profiles rather than accounts, that consent is recorded, how a parent deletes everything (naming the in-app path and the web URL), third-party processors (Supabase, Cloudinary, Google/Apple auth, plus any crash reporter M29 chose), and a contact address. Published at a stable public URL — the web app (once web file 38 deploys) is the natural home; a static page is fine. **The policy must match reality**, not aspiration: if M29 chose a crash reporter, it is named here.
7. **Account deletion URL.** A public page describing how to delete the account, with the in-app path and a contact route for someone who has lost device access. Google requires the URL specifically; Apple requires the in-app path. Both exist.
8. **Apple App Store Connect setup.** App record, bundle ID registration, Kids Category selection, age rating questionnaire, App Privacy ("Data Types" answers matching the collection list, with **"Data Used to Track You: No"**), Sign in with Apple capability confirmed, and the review notes: a demo Google account or a documented sign-in path, plus the parental PIN for the reviewer — a reviewer who cannot get past the PIN gate will reject the app.
9. **Google Play Console setup.** App record, package registration, store listing, Data Safety form (matching the collection list and M29's decision), **Families policy declarations** and target age group, IARC content-rating questionnaire, ads declaration (none), and the app-access instructions for the reviewer including the PIN.
10. **Reviewer access is a first-class deliverable.** Both stores need a working way in: a test Google account with a seeded child profile, a known PIN, and — because the app depends on a live API — the API must be up during review (M31's dependency on web file 38). Write the instructions as if for someone who has never seen the product, because that is exactly who reads them.
11. **Consistency audit.** The privacy policy, App Privacy answers, Data Safety form, in-app consent copy (M08) and `document/implementation/notes/compliance-consent-deletion.md` must all say the same thing. Read them side by side and fix the drift — an inconsistency here is what turns a routine review into a correspondence.
12. **Deliverable: a record.** `document/implementation-mobile/notes/store-submission.md` — every answer given on both consoles, the URLs, the reviewer credentials location (**not** the credentials themselves; those belong in a password manager, never in the repo), and the asset inventory. Resubmissions and the next release both need this.

## Technical Approach & Suggestions

```
document/implementation-mobile/notes/store-submission.md   # every answer, every URL, the asset inventory
apps/mobile/assets/icon.png                                # 1024x1024 master
apps/mobile/assets/adaptive-icon-foreground.png
apps/mobile/assets/adaptive-icon-monochrome.png
apps/mobile/assets/splash.png
apps/mobile/app.config.ts                                  # icon, splash, version, category metadata
apps/web/app/(legal)/privacy/page.tsx                      # the published policy (web app hosts it)
apps/web/app/(legal)/delete-account/page.tsx               # the deletion URL Google requires
```

Identity and assets in `app.config.ts`, all in one place:

```ts
export default {
  expo: {
    name: "KidLearn",
    slug: "kidlearn",
    scheme: "kidlearn",
    version: "1.0.0",
    orientation: "default",
    icon: "./assets/icon.png",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#FFFDF7",       // kid `--background` from @kidlearn/tokens
    },
    ios: {
      bundleIdentifier: "net.kidlearn.app",
      supportsTablet: true,
      usesAppleSignIn: true,
      infoPlist: {
        // No tracking, so no ATT prompt — and the absence must be true, not just declared.
        NSUserTrackingUsageDescription: undefined,
      },
    },
    android: {
      package: "net.kidlearn.app",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon-foreground.png",
        monochromeImage: "./assets/adaptive-icon-monochrome.png",
        backgroundColor: "#FFFDF7",
      },
    },
  },
};
```

Screenshots are least painful captured from simulators at the exact required sizes, scripted so a re-capture after a UI change is cheap:

```bash
# iOS: boot the required simulator sizes, set the language, capture.
xcrun simctl boot "iPhone 15 Pro Max"
xcrun simctl status_bar booted override --time "9:41" --batteryLevel 100
xcrun simctl io booted screenshot student-home-en.png
# Repeat with the app language switched to Bengali for the -bn set.
```

Hosting the policy in the web app keeps one deploy and one domain (web files 38/38a own the domain), and means the URL survives a mobile-only release. Put both legal pages outside the `(parent)` group so they are reachable without signing in — a reviewer and a prospective parent both need them unauthenticated.

For the Data Safety and App Privacy answers, write the collection list once in the notes file and copy from it into both consoles. Answering the two forms independently from memory is how they end up disagreeing.

## Step-by-Step Plan

1. Enrol in both developer programmes if not already started, and note the expected verification dates. (~30 min of work, days of waiting)
2. Final identity decision: app name, bundle ID, package, launch version. Record them; they are permanent. (~20 min)
3. Produce the icon master, Android adaptive layers and monochrome layer; test on a real launcher and in the iOS app library. (~50 min)
4. Configure and verify the splash on a tall phone, a short phone and a tablet. (~30 min)
5. Capture screenshots for both stores' required sizes in EN and BN from the seeded content. (~60 min)
6. Write both listings in EN and BN. (~45 min)
7. Write and publish the privacy policy and the account-deletion page in the web app, cross-checking `notes/observability.md` and `document/implementation/notes/compliance-consent-deletion.md`. (~60 min)
8. Create the App Store Connect record: Kids Category, age rating, App Privacy answers, Sign in with Apple, reviewer notes with the PIN and demo account. (~45 min)
9. Create the Play Console record: listing, Data Safety, Families declarations, target age group, IARC questionnaire, app-access instructions. (~45 min)
10. Run the consistency audit across policy, both console forms, in-app consent copy and the existing compliance note; fix drift. (~30 min)
11. Write `notes/store-submission.md` with every answer, URL and asset; commit (credentials to the password manager, never the repo). (~30 min)

## Acceptance Criteria

- [ ] App name, bundle ID (`net.kidlearn.app`), package and launch version (`1.0.0`) are final and recorded; the scheme still matches M06's `trustedOrigins` and M07's client.
- [ ] Icon renders correctly as an iOS icon, an Android adaptive icon (content inside the safe circle) and an Android 13+ themed icon, checked on a real launcher.
- [ ] The splash renders correctly on a tall phone, a short phone and a tablet, with the token background colour.
- [ ] Screenshots exist for every required size on both stores, in EN **and** BN, captured from real seeded content with no fabricated data.
- [ ] Store listings are written in both languages, parent-facing in tone, with no unevidenced learning claims.
- [ ] A privacy policy is **published at a public URL** and accurately describes what is collected — including a child's first name — and names every third-party processor, matching `notes/observability.md`.
- [ ] A public account-deletion page exists, and the in-app deletion path (M08) is reachable in two taps from the parent area.
- [ ] Apple: Kids Category selected, age rating completed, App Privacy answers match the collection list, "Data Used to Track You" is **No**, Sign in with Apple is present.
- [ ] Google: Data Safety form, Families declarations, target age group and IARC rating all completed and consistent with Apple's answers.
- [ ] Reviewer instructions on both stores include a working demo account, a seeded child and the parental PIN — a reviewer can get past the gate.
- [ ] The privacy policy, both console forms, the in-app consent copy and `document/implementation/notes/compliance-consent-deletion.md` all agree.
- [ ] `notes/store-submission.md` records every answer, URL and asset; no credential is committed to the repo.

## Out of Scope

- Producing the builds and uploading them — M31.
- The closed test and the production release — M32.
- Marketing beyond the store listing: a website, social accounts, press.
- Localising the app into a third language for market reach. FR-I18N covers EN and BN.
- In-app purchases, subscriptions or ads. None exists, and their absence is what keeps the Kids Category answers simple.
