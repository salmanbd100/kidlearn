# 40 — Public Homepage and Guides

> **Estimated effort:** 6–8 hours (about half of it is writing and translating the copy)
> **Depends on:** nothing open. Every route it links to already ships.
> **Requirement IDs:** FR-SITE-01, FR-SITE-02, FR-SITE-03 (added to
> `project-requirement-details.md §5.15` with this file). Touches NFR-SAFE-07 and FR-I18N-01.
> **Source:** design agreed in conversation on 2026-10-07 — homepage takes over `/`, guides are
> curated pages that link out to the full markdown, editorial look, every string translated.
> **Status tracking:** update `00-progress-tracker.md` when starting/finishing

## Goal

KidLearn has no front door. `/` belongs to the `(student)` group and redirects straight to the
profile picker, so a parent arriving from a link, an admin who has never seen the CMS, and an
engineer or recruiter looking at the project all land on "Who's learning today?" with no idea
what they are looking at.

This file adds a small public site: a homepage at `/` and three guides —

| Route | Reader | Job |
| --- | --- | --- |
| `/` | everyone | Say what KidLearn is in one sentence, send a child to learning and a parent to sign-in, point everyone else at their guide |
| `/guide/parents` | a parent | How to set up, add a child, read the dashboard and reports, set screen time, delete their data |
| `/guide/admins` | a content admin | What the CMS is for, how content reaches a child, the review rule, what an admin cannot do |
| `/guide/engineering` | a developer or recruiter | How the system is built and why — architecture, the decisions that shape it, how it is tested and shipped |

The guides are **curated, short, and translated**. They are not a rendering of `document/*.md`;
they summarise it for a reader who is not in the repo and link to the full file on GitHub for
anyone who wants the detail.

**It must not look generated.** The direction is editorial — a printed booklet from a small
studio, not a SaaS landing template. See "Visual direction" for what that rules in and out.

## Context & Current State

- `app/(student)/page.tsx` is a three-line redirect to `STUDENT_ROUTES.selectProfile`. Nothing in
  `apps/web` links to `/` except the root `not-found.tsx` ("Go home"). There is no web manifest,
  so no installed PWA has `/` as its `start_url`.
- Three route groups exist — `(student)`, `(parent)`, `(admin)` — and `frontend.md §3` "Route
  organisation" describes exactly three. A fourth group changes that section.
- Translation is client-side throughout: screens call `useTranslation(<namespace>)`, and
  `LanguageSwitch` changes the browser i18next instance and writes the locale cookie without a
  server round trip. A Server Component that translated with `getI18n(locale)` would not
  re-render on a switch, so **the site follows the same pattern** — `page.tsx` is a Server
  Component that exports `metadata` and renders a `'use client'` screen.
- `@kidlearn/i18n` has four namespaces (`common`, `parent`, `student`, `lesson`); the parity test
  fails if a key exists in one locale and not the other.
- The repository is public: `https://github.com/salmanbd100/kidlearn`. Deep links target
  `blob/main/document/...`.
- NFR-SAFE-07: the Student Portal contains no external links. The homepage will carry external
  links (GitHub). `/` is therefore **not** part of the Student Portal, and no `(student)` screen
  may link to it.

## Requirements

1. **Route group.** Add `app/(site)/` with a `layout.tsx` that wraps its children in
   `<ThemeScope theme="kid">`. Delete `app/(student)/page.tsx`. Add:
   - `app/(site)/page.tsx` → `HomeScreen`
   - `app/(site)/guide/parents/page.tsx` → `ParentGuideScreen`
   - `app/(site)/guide/admins/page.tsx` → `AdminGuideScreen`
   - `app/(site)/guide/engineering/page.tsx` → `EngineeringGuideScreen`

   Each `page.tsx` is a Server Component exporting a static `metadata` (English title and
   description — Next's metadata is not locale-aware here, and the root layout's is English too).
   Screens live beside their page, as the other groups do.

2. **Shared pieces in `features/site/`.** The site is a web-only domain with no server module, so
   the "feature names track the server" rule does not bind. The pieces more than one site page
   uses go here, and nowhere else:
   - `SiteHeader.tsx` — wordmark (links to `/`), guide links, `LanguageSwitch` (`size` that suits
     the editorial layout, not `kid`)
   - `SiteFooter.tsx` — GitHub link, one line on what the project is
   - `GuideLayout.tsx` — the booklet frame every guide uses: hanging title, numbered sections, an
     "On this page" list built from the section ids, a "Read the full document" link per section
     where one exists
   - `site-routes.ts` — `SITE_ROUTES` and `REPO_DOC_URL(path)`, following `student-routes.ts`
   - `Doodle.tsx` — the hand-drawn SVG marks (see Visual direction), `aria-hidden`
   - `diagrams/` — the three engineering diagrams, one component each

3. **Homepage content.** In this order, and no more:
   - Wordmark and a single plain sentence: what it is, for whom, in which languages.
   - Two actions: **Start learning** → `/select-profile`; **Parent sign-in** → `/parent/login`.
     Start learning is the primary one — a child on a shared tablet must reach it with one tap.
   - "Read the guides": three entries, each naming its reader and what they will get out of it in
     one sentence. A typographic list with numerals, not three identical icon cards.
   - A short "What makes it different" passage — three or four plain facts drawn from the
     requirements (no ads and no chat, AI content is always reviewed by a person, English and
     Bangla from day one, progress is computed on the server so it cannot be gamed). Prose or a
     definition list, not a feature grid.
   - Footer.

4. **Parent guide content** — condensed from `user-journey-manual.md §5` and
   `compliance-consent-deletion.md`. Sections: getting started (Google sign-in, consent);
   adding a child; reaching the parent area from the child's screen; the dashboard; weekly
   reports; screen-time limits; language; deleting your account and data. Each section is a short
   paragraph or a few steps, written to a parent, not about one. Link to the relevant manual
   section for more.

5. **Admin guide content** — condensed from `admin-account-guide.md §1, §4` and
   `user-journey-manual.md §6`. Sections: what an admin account is (and that one is created by an
   engineer, not by signing up — link to the guide's Part 1/2, do not reproduce the commands);
   the workspace; building curriculum; media; the AI pipeline; the review queue; the publishing
   lifecycle (`draft → in_review → approved/rejected → published`, rendered as a small diagram);
   what an admin cannot do. The rule that AI content never reaches a child without a human
   approval is stated plainly and early.

6. **Engineering guide content** — the page a recruiter judges the project by. Sections:
   - **At a glance** — the stack in one compact table (web, server, data, auth, AI, media,
     hosting, CI), each row with one line of *why*.
   - **The monorepo** — diagram: `apps/web`, `apps/server`, the six `packages/*`, and the
     planned `apps/mobile`, with arrows for what imports what. Note `packages/ui` is web-only by
     decision (`mobile-app-plan.md §4.2`).
   - **A request, end to end** — diagram: browser → Next.js on Vercel → Express on EC2 behind
     Caddy → Prisma → Postgres; the session cookie and where it is checked.
   - **Content is data** — activities and quizzes as versioned JSONB validated by Zod in
     `packages/types`; generic engines render them; new content ships without a deploy.
   - **The server is the authority** — rewards, streaks, screen time and completion are computed
     server-side; the client reports events.
   - **Publishing and the human gate** — the status machine, the AI pipeline (Gemini text and
     images, Google TTS), why nothing auto-publishes.
   - **Safety by design** — no social features, no external links on the student surface,
     consent before profiles, full deletion.
   - **Quality** — Biome, `tsc`, Vitest across every package with the test count as a dated
     figure, contract tests via `assertContract`, the OpenAPI coverage test, real-database suites,
     the `gates` CI job.
   - **Shipping** — Vercel for the frontend, one EC2 box for both APIs, GitHub Actions; the
     monthly cost, because it is a design constraint and recruiters ask.
   - **Read further** — the full documents, linked.

   Every fact is checked against the code or the current docs when the copy is written, not
   copied from this file. Figures (test counts, cost) carry the date they were read.

7. **Strings.** A new `site` namespace: `packages/i18n/locales/{en,bn}/site.json`, registered in
   `packages/i18n/src/index.ts` as `SITE_NAMESPACE` and added to `ns` in
   `apps/web/shared/lib/i18n.ts`. **Every** user-facing string on all four pages goes through it,
   including the engineering guide and the diagram labels. Proper nouns and code identifiers
   (`Next.js`, `Prisma`, `packages/types`, `draft`) stay in Latin script inside the Bangla copy.
   The Bangla is drafted in this file's branch and flagged in the PR for review by a native
   speaker; the PR is not blocked on that review.

8. **Visual direction.** Built from existing tokens only — `kid` theme semantic colours, the
   decorative brand palette from `design.md §2.1` for doodles and diagram accents, no raw hex.
   - **Type:** Fredoka for the wordmark and page titles only; Nunito for everything else. Body
     at the kid theme's 20px floor, line length capped at ~65ch, generous leading.
   - **Layout:** asymmetric. On wide screens section titles and numerals hang in a left margin
     column and the text runs in a narrower right column; on phones they stack. Lots of
     whitespace; rules (thin lines) between sections rather than boxes.
   - **Marks:** two or three hand-drawn-style SVG doodles (an underline under the headline, a
     star, a squiggle beside a section numeral) — irregular strokes, not geometric icons.
   - **Ruled out:** gradients, glassmorphism, drop-shadowed card grids, emoji as bullets,
     "✨"-style ornament, stock illustrations, centred-everything hero sections, testimonial
     carousels, animated counters, "Get started for free" copy.
   - **Motion:** one fade/translate on the homepage headline via `motion`, skipped when
     `useIsMotionReduced()` is true. Nothing else moves.
   - **Responsive:** mobile-first per the `responsive-design` skill; primary actions keep the
     64px kid touch target because a child taps "Start learning".

9. **Student surface stays closed.** No `(student)` screen links to `/` or any `/guide/*` route.
   Extend `app/(student)/no-external-links.test.tsx` (or add a sibling assertion) so a link to a
   `(site)` route from a student screen fails. The root `not-found.tsx` keeps linking to `/` —
   it is shared by every surface, and the homepage's primary action leads a child straight back.

10. **Docs.** Update `frontend.md §3` "Route organisation" from three groups to four, describing
    `(site)` as public, unauthenticated and theme-scoped `kid`, and record that it is not part of
    the Student Portal (NFR-SAFE-07). The root `CLAUDE.md` does not name the groups; leave it.

## Technical Suggestions

- `GuideLayout` takes `sections: { id, titleKey, bodyKey?, docPath? }[]` and children, so the
  "On this page" list and the section anchors cannot drift apart.
- Long-form copy in i18next: one key per paragraph (`parents.dashboard.p1`), and `<Trans>` only
  where a paragraph needs an inline link or `<code>`. Avoid one key holding a whole section of
  markdown.
- Diagrams as inline SVG React components with `role="img"` and an `aria-label`/`<title>` from the
  `site` namespace; text in the SVG uses `currentColor`/token classes so it survives the
  high-contrast mode the a11y bootstrap script applies.
- External links: `rel="noopener noreferrer"`; mark them visually as leaving the site.
- No new dependency. `motion`, `cva`, `@kidlearn/ui`'s `Button` and `cn` cover it.

## Testing

Per `frontend.md §5`, Vitest + React Testing Library, rendered inside `<Providers>`:

- Each screen renders its title and every section heading in `en`, and its title in `bn`.
- `HomeScreen`: "Start learning" links to `/select-profile`, "Parent sign-in" to `/parent/login`,
  each guide entry to its route.
- `GuideLayout`: every "On this page" entry targets an element with that id.
- `Doodle` and diagrams: decorative marks are `aria-hidden`; diagrams expose an accessible name.
- Reduced motion: with `useIsMotionReduced()` true the homepage headline renders without the
  motion wrapper's initial offset.
- The student-surface link assertion from requirement 9.
- `@kidlearn/i18n` parity passes with the new namespace.

Gates: `pnpm lint`, `pnpm build`, `pnpm typecheck`, `pnpm test` — all run and seen green before
the file is marked done; `gates` green on the PR.

Manual check, recorded in the PR: the four pages at 375px, 768px and 1280px, in `en` and `bn`,
light and high-contrast.

## Acceptance Criteria

- [ ] `/` renders the homepage; `/select-profile` is one tap from it.
- [ ] `/guide/parents`, `/guide/admins`, `/guide/engineering` render with their sections.
- [ ] Switching language on any site page switches every visible string, diagrams included.
- [ ] No string on the four pages is hard-coded; `site` namespace parity passes.
- [ ] No raw hex, no gradient, no card grid; doodles and diagrams use tokens.
- [ ] No `(student)` screen links to a `(site)` route, and a test says so.
- [ ] Every engineering-guide fact was checked against code or current docs; figures are dated.
- [ ] `frontend.md §3` describes four route groups.
- [ ] Lint, build, typecheck, test green locally; `gates` green on the PR.

## Out of Scope

A markdown renderer, search, a docs sidebar framework, versioned docs, analytics, a contact form,
SEO beyond per-page `metadata`, a blog, and any change to the student, parent or admin surfaces
beyond removing the `/` redirect.
