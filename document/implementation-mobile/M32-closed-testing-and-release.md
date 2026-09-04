# M32 — Closed Testing, Review & Production Release

> **Estimated effort:** 3–4 hours of work, spread across ~3 calendar weeks
> **Depends on:** M31
> **Requirement IDs:** plan §12, NFR-SAFE-01..06
> **Status tracking:** update `M00-progress-tracker.md` when starting/finishing

## Goal

Get KidLearn published on both stores and leave behind a runbook for the next release: run Google's mandatory closed test, submit both apps for review, answer whatever review comes back with, promote to production, and verify the live app behaves for a real user who is not you.

## The calendar is the constraint

This file's effort is small; its **duration** is not. Plan around:

- **Google's closed-test rule for new personal developer accounts:** at least **12 testers opted in for 14 continuous days** before production access is granted. Fourteen days is a floor, not an average, and a tester who opts out mid-window can reset progress — recruit 15+ to have slack. Recruitment started in M31 precisely because of this.
- **Apple review:** typically 1–3 days, longer for a first submission and longer again for the Kids Category, where the reviewer checks the parental gate and the privacy answers by hand.
- **Assume one rejection.** A first submission that sails through is luck, not planning. Budget a correspondence round.

Start the closed test the day M31 produces a build. Apple review can run in parallel — the two stores are independent.

## Context & Current State

- M31 put an AAB in Play internal testing and an iOS build in TestFlight, both against the deployed API, with the production smoke test passed on real devices, the OTA channel configured and a `runtimeVersion` policy pinned.
- M30 created both store records with listings, assets, privacy policy URL, Kids Category / Families declarations, Data Safety, IARC rating and reviewer instructions including a demo account and the parental PIN.
- The API is on an **always-on EC2 instance** at `https://api.kidlearn.net` (web file 38), so there is no cold start to absorb and no keep-warm ping to arrange. M29's waking-up state still earns its place — a reviewer on a slow connection will see it — but it is now a slow-network state, not a sleeping-server one, and should be verified under throttling rather than against an idle backend.
- `notes/store-submission.md` and `notes/release-runbook.md` were started in M31 and are completed here.
- The app has no in-app purchases, no ads and no third-party analytics on kid surfaces (M29's decision) — which is what keeps the Kids Category and Families answers simple, and which must remain true through the release.

## Detailed Requirements

1. **Run the closed test.** Promote the M31 build to the Play **closed testing** track, share the opt-in link, and confirm at least 12 testers have actually opted in (the Play Console reports the count — a shared link is not an opt-in). Keep the track live and the count above 12 for 14 continuous days. Log the start date and the earliest possible production date.
2. **Collect and triage tester feedback.** Give testers a short, specific brief: sign in, add a child, complete a lesson, read a story, check the dashboard, try the screen-time limit — and tell us what confused you. Triage into: release blockers (fix and ship a new build), OTA-able fixes (JS-only, ship through the `production` channel), and backlog. Do not let the 14 days pass without using them; this is the only pre-launch feedback from people who are not the author.
3. **Submit to Apple.** Submit the TestFlight build for App Store review with the M30 reviewer notes. Watch for the Kids Category specifics: the reviewer will test the **parental gate** (M08's PIN) and check that no external link or adult area is reachable without it, and will compare the App Privacy answers against the app's actual behaviour.
4. **Submit to Google.** Once the 14-day closed test completes, promote to production review with the Families and Data Safety declarations already in place.
5. **Answer review correspondence properly.** If either store rejects: read the exact guideline cited, fix the actual cause (not the symptom), reply with what changed, and record the exchange in `notes/store-submission.md`. Rejections most likely on this app: guideline 4.8 (Sign in with Apple — already implemented, but a reviewer must be able to *find* it), 1.3/5.1.4 (Kids Category — the gate and the privacy answers), 5.1.1 (data collection justification for a child's first name), and an incomplete Data Safety form on Google's side.
6. **Keep the API up for review.** Coordinate the review window with the deployed server: it must be reachable and not mid-redeploy. The host does not sleep, so the only real risk is a deploy landing while a reviewer is in the app — a `docker compose up -d` is a few seconds of 502 (web file 38a). Freeze deploys to `main` for the review window, or agree a time window with yourself and note it in `notes/release-runbook.md`.
7. **Promote to production on both stores.** Staged rollout on Google (start low, e.g. 20%, and increase once the crash rate holds); phased release on Apple if preferred. Confirm the live listing shows the right assets, the right description in both languages and a working privacy policy link.
8. **Post-release verification, from a stranger's position.** On a device that has never had a development build installed, download from the public store listing and repeat the M31 smoke test end to end. A build that only works on a machine that has seen the dev client is a real failure mode.
9. **Watch the first days.** Play Console Vitals and App Store Connect crash reports (or the reporter M29 chose) for crash-free rate and ANRs; the deployed API's logs for error spikes and for authentication failures that only appear at scale. Decide in advance what would trigger a rollback: pause the staged rollout on Google, or ship an OTA JS fix, or submit an expedited build — and write which lever fits which failure.
10. **Complete `notes/release-runbook.md`** — the durable deliverable. It must let someone (including you, in six months) ship release 1.0.1 without rediscovering anything: the build commands, the submit commands, the tracks, the OTA rule from M31, the version bump policy, the rollback levers, the store account locations (not credentials), the review-notes template, and the list of declarations that must be re-checked when data collection changes.
11. **Update the trackers.** Mark M32 ✅ Done in `M00-progress-tracker.md`, and add a line to `document/implementation/00-progress-tracker.md` or the plan noting that a mobile client now consumes the API — the next person changing an endpoint needs to know there are three clients, not two.

## Technical Approach & Suggestions

```
document/implementation-mobile/notes/release-runbook.md      # completed here — the durable deliverable
document/implementation-mobile/notes/store-submission.md     # + review correspondence, rollout dates
document/implementation-mobile/notes/closed-test.md           # tester list (names only), dates, feedback triage
```

The runbook's skeleton — keep it command-first, because that is what a stressed future reader needs:

```markdown
## Ship a JS-only fix (no native change)
1. Merge the fix. Confirm it touches no native module, permission, SDK version or app.config.ts.
2. pnpm --filter mobile test && pnpm lint && pnpm typecheck
3. eas update --branch production --message "<what changed>"
4. Verify on a device already running the production build (force-quit and relaunch twice).

## Ship a new build (native change, SDK bump, config change)
1. Bump version in app.config.ts if user-visible; build numbers auto-increment (appVersionSource: remote).
2. eas build --profile production --platform android|ios
3. eas submit --platform android|ios
4. Android: staged rollout from 20%. iOS: phased release.
5. Re-run the smoke test from a public store install.

## Rollback
- Google: pause the staged rollout in the Play Console (fastest lever).
- OTA regression: eas update --branch production with the previous commit's bundle.
- Native regression: halt rollout, then submit a fixed build; there is no un-publish that reaches installed users.
```

Track the closed test's window explicitly, because "about two weeks" is how a launch slips:

```markdown
Closed test opened: 2026-__-__     Testers opted in: __ / 12
14 continuous days complete:       2026-__-__  (earliest production submission)
```

For the tester brief, keep it to six steps and one question. A long brief gets skimmed; a specific one gets answered.

When replying to a rejection, quote the guideline number, describe the change in one sentence, and name where the reviewer can see it. Reviewers read many of these; the clear ones move faster.

## Step-by-Step Plan

1. Promote M31's build to Play closed testing, share the opt-in link, and confirm the opted-in count reaches 12+. Record the start date and the earliest production date. (~30 min, then a 14-day wait)
2. Submit the iOS build to App Store review with the M30 reviewer notes — in parallel, not after. (~30 min)
3. Write and send the tester brief; set a reminder to triage feedback mid-window. (~20 min)
4. Triage tester feedback: blockers → new build, JS-only → OTA, rest → backlog. (~45 min, mid-window)
5. Handle Apple review correspondence; fix and resubmit if rejected, recording the exchange. (~variable; budget one round)
6. Coordinate the review window with the deployed API — freeze deploys to `main` so a restart cannot land mid-review. (~20 min)
7. On day 14, promote the Android build to production review. (~20 min)
8. Promote to production on both stores with a staged/phased rollout; check both live listings in EN and BN, including the privacy policy link. (~30 min)
9. Post-release verification from a clean device, downloaded from the public listing: the full smoke test. (~40 min)
10. Watch Vitals, crash reports and API logs for the first days; write the rollback triggers down before you need them. (~30 min plus monitoring)
11. Complete `notes/release-runbook.md`, update both trackers, and note in the repo that the API now has three clients. (~40 min)

## Acceptance Criteria

- [ ] At least **12 testers opted in** on the Play closed-testing track for **14 continuous days**, with the dates recorded.
- [ ] Tester feedback was collected and triaged, with blockers fixed before the production submission.
- [ ] The iOS app passed App Store review, including the Kids Category checks on the parental gate and the privacy answers.
- [ ] The Android app passed Play review with the Families and Data Safety declarations intact.
- [ ] Any rejection was answered by fixing the cited cause, and the correspondence is recorded in `notes/store-submission.md`.
- [ ] The API was reachable throughout both review windows.
- [ ] Both apps are **live in production**, with correct assets, EN and BN listings and a working privacy policy link.
- [ ] The full smoke test passes on a clean device installed from the **public store listing** — not from a development build or a test track.
- [ ] Crash-free rate and API error rates were watched for the first days, with rollback triggers written down in advance.
- [ ] `notes/release-runbook.md` is complete enough for someone else to ship 1.0.1 from it: build and submit commands, the OTA rule, the version policy, rollback levers, and the declarations to re-check when data collection changes.
- [ ] `M00-progress-tracker.md` shows M32 ✅ Done, and the repo records that the API now serves three clients.

## Out of Scope

- New features. The 1.0 scope closed at M28; anything from tester feedback that is not a blocker belongs in a backlog for 1.1.
- Marketing, ASO experiments and paid acquisition.
- Post-launch analytics. Still requires verifiable parental consent on a Kids Category app (M29), and shipping it as a launch afterthought is how a privacy answer becomes untrue.
- Push notifications for streaks or reports — out of scope for the plan (§3.2) and a change to the store declarations.
- Automating releases in CI. The runbook is the right first step; automation earns its place once the manual path is boring.
