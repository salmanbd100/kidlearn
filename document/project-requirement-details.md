# KidLearn — Project Requirement Details (Master Document)

> **Document Type:** Master Requirements Specification
> **Version:** 1.0 | **Date:** June 2026
> **Status:** Authoritative — all design, architecture, and implementation decisions in this repository derive from this document.
> **Sources:** Learning Adventure Functional Requirements v1.0 + `document/key-description.md` (Next-Gen International Educational Platform).

---

## Table of Contents

1. [Purpose & How to Use This Document](#1-purpose--how-to-use-this-document)
2. [Product Vision](#2-product-vision)
3. [Core Product Pillars](#3-core-product-pillars)
4. [User Roles & Permissions](#4-user-roles--permissions)
5. [Functional Requirements](#5-functional-requirements)
   - [5.1 Authentication & Parent Accounts](#51-authentication--parent-accounts-fr-auth)
   - [5.2 Child Profiles](#52-child-profiles-fr-prof)
   - [5.3 Curriculum Structure](#53-curriculum-structure-fr-curr)
   - [5.4 Learning Worlds & Theming](#54-learning-worlds--theming-fr-world)
   - [5.5 Lesson Experience](#55-lesson-experience-fr-lsn)
   - [5.6 Interactive Activities](#56-interactive-activities-fr-act)
   - [5.7 Quiz System](#57-quiz-system-fr-quiz)
   - [5.8 Story Library](#58-story-library-fr-story)
   - [5.9 Gamification & Rewards](#59-gamification--rewards-fr-gam)
   - [5.10 Multilingual Support](#510-multilingual-support-fr-i18n)
   - [5.11 Parent Dashboard & Reports](#511-parent-dashboard--reports-fr-dash)
   - [5.12 Screen Time & Parental Controls](#512-screen-time--parental-controls-fr-time)
   - [5.13 AI Content Generation Pipeline](#513-ai-content-generation-pipeline-fr-ai)
   - [5.14 Admin Content Management](#514-admin-content-management-fr-cms)
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [Technical Architecture](#7-technical-architecture)
8. [Data Model Overview](#8-data-model-overview)
9. [Deployment Strategy (Zero-Cost MVP)](#9-deployment-strategy-zero-cost-mvp)
10. [MVP Scope](#10-mvp-scope)
11. [Phased Roadmap](#11-phased-roadmap)
12. [Assumptions & Resolved Conflicts](#12-assumptions--resolved-conflicts)

---

## 1. Purpose & How to Use This Document

This is the **single master document** for the KidLearn platform ("Learning Adventure"). Every feature, schema, API route, UI screen, and content pipeline must trace back to a requirement ID defined here.

- Requirement IDs follow the pattern `FR-<MODULE>-<NN>` (functional) and `NFR-<MODULE>-<NN>` (non-functional).
- When implementing, reference the ID in plans, PRs, and commits (e.g. `feat: lesson player step flow (FR-LSN-01..05)`).
- If a new requirement emerges, **add it here first**, then implement.
- MVP-scoped requirements are marked **[MVP]**. Unmarked requirements are post-MVP unless stated otherwise.

---

## 2. Product Vision

KidLearn is an international-standard, web-based educational platform for early learners aged **3 to 6** (Nursery, KG-1, KG-2). It delivers safe, fun, gamified, and age-appropriate learning across Language, Mathematics, Science, and Social Skills through animated lessons, interactive activities, stories, and quizzes — designed for focused **30-to-60-minute daily sessions** broken into short micro-activities to prevent screen fatigue.

The platform:

- Is **visual-first and voice-guided** — children who cannot read can use it independently.
- Supports **multiple languages** natively (English and Bangla at launch).
- Gives parents full visibility (progress, reports) and control (screen time, time windows).
- Uses a **generative-AI content pipeline** (lessons, stories, quizzes, narration, illustrations) with mandatory human review, so the curriculum can scale cheaply.
- Launches on **free-tier hosting** with an architecture that scales modularly to higher grades and more languages without rework.

---

## 3. Core Product Pillars

### Pillar A — Age-Appropriate Experience

Minimal text. Navigation via intuitive visual cues, micro-animations, and a friendly mascot/voice companion. Large touch targets. Every instruction is spoken aloud.

### Pillar B — Chunked Learning Flow

A daily learning journey of 30–60 minutes composed of micro-activities (e.g. 1–3 minute video, short activity, 3–5 question quiz, reward ceremony). Children always know what comes next because every lesson follows the same five-step structure (§5.5).

### Pillar C — Dual-Portal System

- **Student Portal:** immersive, distraction-free, gamified. No external links, no ads, no social features.
- **Parent Dashboard:** secured behind a parental gate (PIN code) for analytics, settings, language management, and screen-time limits.

### Pillar D — AI-Powered Content Pipeline

Automated generation of lesson plans, stories, quizzes, narration audio, and illustrations — always gated by human admin review before publication (§5.13).

### Pillar E — Internationalization & Modular Scaling

i18n is built in from day one (interface, narration, quiz text, story text). The data model is grade-agnostic so Grade 1, Grade 2, etc. can be added without altering base code.

---

## 4. User Roles & Permissions

### 4.1 Student (child, ages 3–6)

Students never register themselves — profiles are always created and managed by a parent. A student can:

- Select their profile and character avatar
- Browse and start lessons matched to their grade level and language
- Watch animated lesson videos with audio narration
- Complete interactive activities and quizzes
- Earn stars, coins, and badges; unlock new characters
- Listen to and read stories
- Switch the display language between available options

A student **cannot**: contact other users, access parent settings (PIN-gated), or see content outside their grade level.

### 4.2 Parent

An adult who registers and manages up to 5 child profiles. A parent can:

- Only Google login
- Create, edit, and delete child profiles (max 5)
- View each child's progress, activity history, and weekly reports

### 4.3 Administrator (internal)

- Creates and manages the full curriculum (subjects, topics, lessons)
- Uploads videos, images, and audio files
- Reviews and approves/rejects AI-generated content before publication
- Manages quiz questions and reward badges
- Views platform-wide usage and analytics

---

## 5. Functional Requirements

### 5.1 Authentication & Parent Accounts (FR-AUTH)

| ID         | Requirement                                                                                                                                                   | Scope |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| FR-AUTH-02 | Parents can register/sign in with Google OAuth.                                                                                                               | [MVP] |
| FR-AUTH-03 | Parent consent is required before any child profile can be created (COPPA).                                                                                   | [MVP] |
| FR-AUTH-04 | The parent dashboard and all settings are protected by a parental gate (PIN code) so a child using the device cannot enter parent areas.                      | [MVP] |
| FR-AUTH-05 | Parents can request deletion of their account and all associated data; deletion removes all child profiles, progress, and personal data.                      | [MVP] |
| FR-AUTH-06 | Sessions for the student portal are profile-scoped: switching child profiles does not require parent re-authentication, but entering parent areas does (PIN). | [MVP] |

### 5.2 Child Profiles (FR-PROF)

| ID         | Requirement                                                                                                                          | Scope |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| FR-PROF-01 | A parent can create up to 5 child profiles under one account.                                                                        | [MVP] |
| FR-PROF-02 | Profile creation captures: first name, age, grade level (Nursery / KG-1 / KG-2), preferred display language, and a character avatar. | [MVP] |
| FR-PROF-03 | Content shown to a child (lessons, activities, stories) is filtered to their grade level and language preference.                    | [MVP] |
| FR-PROF-04 | The profile tracks full learning history: completed lessons, quiz results, earned rewards, unlocked characters, and current streaks. | [MVP] |
| FR-PROF-05 | A parent can update any profile detail at any time.                                                                                  | [MVP] |
| FR-PROF-06 | A parent can delete a child's profile, which removes that child's data.                                                              | [MVP] |
| FR-PROF-07 | Only the owning parent can see a child's profile and activity data.                                                                  | [MVP] |

### 5.3 Curriculum Structure (FR-CURR)

Content hierarchy: **Subject → Topic → Lesson**. Every piece of content is tagged with one or more grade levels and exists per-language.

| ID         | Requirement                                                                                                                                                                                                                                                                                                               | Scope                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| FR-CURR-01 | The platform supports four subjects: **Language** (alphabet, phonics, vocabulary, reading readiness, storytelling), **Mathematics** (number recognition, counting, shapes, simple addition/subtraction), **Science** (animals, plants, weather, human body intro), **Social Skills** (sharing, respect, hygiene, safety). | [MVP: subset — see §10] |
| FR-CURR-02 | All content is tagged to grade levels: **Nursery** (ages 3–4), **KG-1** (ages 4–5), **KG-2** (ages 5–6). Only age-appropriate content is shown to each child.                                                                                                                                                             | [MVP: Nursery + KG-1]   |
| FR-CURR-03 | The curriculum data model is grade-agnostic: new grades (Grade 1, Grade 2, …) can be added as data without code changes.                                                                                                                                                                                                  | [MVP — architectural]   |
| FR-CURR-04 | Admins can create, edit, reorder, and archive subjects, topics, and lessons.                                                                                                                                                                                                                                              | [MVP]                   |

### 5.4 Learning Worlds & Theming (FR-WORLD)

| ID          | Requirement                                                                                                          | Scope                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| FR-WORLD-01 | Every lesson is set inside one of three themed worlds that determine its characters, backgrounds, and story setting. | [MVP]                                       |
| FR-WORLD-02 | **Jungle World** hosts animal, letter, and colour lessons.                                                           | [MVP]                                       |
| FR-WORLD-03 | **Ocean World** hosts number, counting, and shape lessons.                                                           | [MVP]                                       |
| FR-WORLD-04 | **Space World** hosts science and problem-solving lessons.                                                           | Phase 2+ (MVP subjects map to Jungle/Ocean) |
| FR-WORLD-05 | World theming is data-driven (assets, palette, mascot per world) so new worlds can be added without code changes.    | [MVP — architectural]                       |

### 5.5 Lesson Experience (FR-LSN)

Every lesson follows the same five-step structure, in order, so children always know what to expect:

| ID        | Step                  | Requirement                                                                                                                | Scope |
| --------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----- |
| FR-LSN-01 | 1. Introduction       | A friendly character greets the child and explains, in simple encouraging spoken language, what they will learn.           | [MVP] |
| FR-LSN-02 | 2. Learning Content   | A short animated video (1–3 minutes) with voice narration delivers the concept, reinforced with on-screen visual examples. | [MVP] |
| FR-LSN-03 | 3. Practice Activity  | The child completes one hands-on interactive activity (one of the four types in §5.6).                                     | [MVP] |
| FR-LSN-04 | 4. Quiz               | The child answers 3–5 simple questions (formats in §5.7) with pictures, audio, and large touch-friendly options.           | [MVP] |
| FR-LSN-05 | 5. Reward Celebration | A celebration screen shows the stars, coins, and badges earned; an animated character celebrates with the child.           | [MVP] |
| FR-LSN-06 | —                     | Lesson progress is saved per step; an interrupted lesson can resume from the last completed step.                          | [MVP] |
| FR-LSN-07 | —                     | Lesson completion, quiz score, and time spent are recorded against the child's profile for dashboard/report use.           | [MVP] |

### 5.6 Interactive Activities (FR-ACT)

Four activity types are used in the practice step. All run as dynamic frontend modules driven by structured JSON definitions (stored as Postgres `JSONB`), so new content requires no code changes.

| ID        | Type                    | Requirement                                                                                                                                                                      | Scope                 |
| --------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| FR-ACT-01 | Drag and Drop           | Child drags an item onto the correct matching target (e.g. the word "Apple" onto a picture of an apple).                                                                         | [MVP]                 |
| FR-ACT-02 | Trace Letters & Numbers | Child traces a letter or number along a dotted guide path with finger (touch) or mouse.                                                                                          | [MVP]                 |
| FR-ACT-03 | Match Objects           | Child connects items in two sets by drawing a line or tapping pairs (e.g. number 3 ↔ three apples).                                                                              | [MVP]                 |
| FR-ACT-04 | Puzzle                  | Child drags picture pieces into position to complete an image.                                                                                                                   | [MVP]                 |
| FR-ACT-05 | Feedback                | Every activity gives immediate feedback: cheerful sound + animation on success, gentle encouraging prompt on a wrong attempt. Children can always retry; there is no fail state. | [MVP]                 |
| FR-ACT-06 | JSON-driven             | Each activity instance is fully described by a versioned JSON payload (type, assets, targets, correct mappings, audio refs) rendered by a generic activity engine.               | [MVP — architectural] |

### 5.7 Quiz System (FR-QUIZ)

Quizzes end every lesson. They are low-pressure and encouraging — never test-like.

| ID         | Requirement                                                                                  | Scope                 |
| ---------- | -------------------------------------------------------------------------------------------- | --------------------- |
| FR-QUIZ-01 | **Multiple Choice:** select one correct answer from 3–4 picture- or text-based options.      | [MVP]                 |
| FR-QUIZ-02 | **Match the Pair:** connect items from two columns by tapping or dragging.                   | [MVP]                 |
| FR-QUIZ-03 | **Drag-and-Drop Answer:** drag the correct answer into a blank in a sentence or picture.     | [MVP]                 |
| FR-QUIZ-04 | **Picture Selection:** select the correct picture from a set in response to a question.      | [MVP]                 |
| FR-QUIZ-05 | Every question has audio so the child hears it read aloud (in the child's language).         | [MVP]                 |
| FR-QUIZ-06 | After submitting all answers, the child sees their score and receives rewards (per §5.9).    | [MVP]                 |
| FR-QUIZ-07 | Quiz definitions are JSON payloads (`JSONB`), same engine pattern as activities (FR-ACT-06). | [MVP — architectural] |
| FR-QUIZ-08 | Per-question responses and accuracy are stored for the parent dashboard and weekly reports.  | [MVP]                 |

### 5.8 Story Library (FR-STORY)

| ID          | Requirement                                                                                    | Scope |
| ----------- | ---------------------------------------------------------------------------------------------- | ----- |
| FR-STORY-01 | A dedicated story library is accessible from the main menu at any time, separate from lessons. | [MVP] |
| FR-STORY-02 | Each story is short, illustrated, and narrated page-by-page in a child-friendly voice.         | [MVP] |
| FR-STORY-03 | Each story has a simple moral or learning theme (sharing, kindness, curiosity, …).             | [MVP] |
| FR-STORY-04 | Stories feature characters from the learning worlds (jungle, ocean, space).                    | [MVP] |
| FR-STORY-05 | Every story is available in all supported languages (text + narration).                        | [MVP] |
| FR-STORY-06 | Stories can be replayed unlimited times.                                                       | [MVP] |
| FR-STORY-07 | Completing a story earns the child a small reward.                                             | [MVP] |
| FR-STORY-08 | MVP launches with a starter library of **20 stories**.                                         | [MVP] |

### 5.9 Gamification & Rewards (FR-GAM)

| ID        | Requirement                                                                                                                                                                                                                                                                                                    | Scope                                                |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| FR-GAM-01 | **Stars** are earned by completing lessons and quizzes.                                                                                                                                                                                                                                                        | [MVP]                                                |
| FR-GAM-02 | **Coins** are earned for correct answers and daily activity.                                                                                                                                                                                                                                                   | [MVP]                                                |
| FR-GAM-04 | **Badges** are earned by reaching milestones. Initial set: Alphabet Hero (all alphabet lessons), Math Champion (all number lessons), Reading Star (10 stories), Animal Expert (20 animals identified), Streak Starter (3-day streak), Week Warrior (7-day streak). Badges are admin-manageable data, not code. | [MVP]                                                |
| FR-GAM-05 | **Character unlocking:** every child starts with one default avatar character; more animal characters unlock progressively as rewards accumulate.                                                                                                                                                              | [MVP]                                                |
| FR-GAM-06 | **Learning streaks:** the platform tracks consecutive days with ≥1 learning activity; the current streak is shown on the child's home screen and milestone streaks trigger special celebration animations.                                                                                                     | [MVP]                                                |
| FR-GAM-07 | Reward grants are recorded with timestamps so they appear in recent activity and weekly reports.                                                                                                                                                                                                               | [MVP]                                                |
| FR-GAM-08 | Rewards have no monetary value and cannot be purchased — they are earned only through learning activity.                                                                                                                                                                                                       | [MVP]                                                |

### 5.10 Multilingual Support (FR-I18N)

| ID         | Requirement                                                                                                                                                                                                                     | Scope                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| FR-I18N-01 | All content — lesson narration, quiz questions, story text/audio, and the app interface — is available in **English and Bangla** in Phase 1.                                                                                    | [MVP]                 |
| FR-I18N-02 | Language can be switched at any time from settings, by parent or child; the child's preference is remembered in their profile.                                                                                                  | [MVP]                 |
| FR-I18N-03 | The i18n architecture (e.g. `i18next` on the frontend, per-language asset references in the database) supports instant toggling of language assets — audio, text, and localized visual cues — without reload-breaking behavior. | [MVP — architectural] |
| FR-I18N-04 | New languages are added as data/asset sets, not code: **Arabic** in Phase 2; **Hindi and Spanish** in Phase 3.                                                                                                                  | Phase 2/3             |
| FR-I18N-05 | Audio narration is generated and stored per language (see FR-AI-04).                                                                                                                                                            | [MVP]                 |

### 5.11 Parent Dashboard & Reports (FR-DASH)

| ID         | Requirement                                                                                                                                                                                                                                                          | Scope |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| FR-DASH-01 | After login (and PIN gate), the parent sees a per-child summary of learning activity.                                                                                                                                                                                | [MVP] |
| FR-DASH-02 | **Learning time:** minutes spent learning today, this week, and this month, per child.                                                                                                                                                                               | [MVP] |
| FR-DASH-03 | **Subject progress:** completion percentage per subject per child, highlighting strong and weak areas.                                                                                                                                                               | [MVP] |
| FR-DASH-04 | **Recent activity:** chronological list of lessons completed, stories read, and badges earned, with dates.                                                                                                                                                           | [MVP] |
| FR-DASH-05 | **Weekly report** generated every week per child containing: total active days, total learning time, count of new letters/words/numbers encountered, lessons and stories completed, quiz accuracy percentage, badges earned, and an encouraging note about progress. | [MVP] |
| FR-DASH-06 | Past weekly reports remain viewable in the dashboard.                                                                                                                                                                                                                | [MVP] |

### 5.12 Screen Time & Parental Controls (FR-TIME)

| ID         | Requirement                                                                                                                        | Scope                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| FR-TIME-01 | A parent can set a **daily time limit** per child individually.                                                                    | [MVP]                 |
| FR-TIME-02 | When the limit is reached, the mascot shows a friendly "time's up" message and the child cannot start a new lesson.                | [MVP]                 |
| FR-TIME-03 | A lesson already in progress when the limit hits is allowed to finish before lockout.                                              | [MVP]                 |
| FR-TIME-04 | A parent can set an **access time window** per child (e.g. 8am–8pm); outside the window the app shows a friendly locked screen.    | [MVP]                 |
| FR-TIME-05 | All screen-time settings are editable by the parent at any time from settings (behind the PIN gate).                               | [MVP]                 |
| FR-TIME-06 | Learning time is measured server-side (activity heartbeats / session events) so limits can't be bypassed by refreshing the client. | [MVP — architectural] |

### 5.13 AI Content Generation Pipeline (FR-AI)

AI generates content at scale; humans gate everything before publication.

| ID       | Requirement                                                                                                                                                                                                                                         | Scope                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| FR-AI-01 | **AI Lesson Generator:** admin selects grade level, subject, topic, and language → AI produces a complete lesson plan: learning objectives, narration script, and a set of quiz questions.                                                          | [MVP]                                                 |
| FR-AI-02 | **AI Story Generator:** admin selects age group, theme, and language → AI produces a complete illustrated story with page-by-page narration text and character descriptions.                                                                        | [MVP]                                                 |
| FR-AI-03 | **AI Quiz Generator:** AI generates quiz questions for any lesson, in all supported formats (§5.7), matched to target age/grade. Output is JSON conforming to the quiz schema (FR-QUIZ-07).                                                         | [MVP]                                                 |
| FR-AI-04 | **AI Audio Narration:** lesson scripts and story text are converted to child-friendly spoken audio (Google Cloud Text-to-Speech, one voice per language), generated separately per supported language.                                                           | [MVP]                                                 |
| FR-AI-05 | **AI Image Generation:** cartoon-style illustrations for lesson backgrounds, story scenes, and character expressions (e.g. Midjourney, Gemini image models), kept consistent with the platform's visual style via curated prompts/character sheets. | [MVP]                                                 |
| FR-AI-06 | **Video/animation generation** for lesson content uses tools such as Google Veo, Runway Gen-3, or Mootion.                                                                                                                                          | [MVP — may launch with a partially manual video step] |
| FR-AI-07 | **Human review gate:** all AI-generated content enters a review queue and must be approved by a human administrator before becoming visible to students. **No AI content is ever published automatically.**                                         | [MVP — hard requirement]                              |
| FR-AI-08 | AI generation requests, outputs, and review decisions (approve / edit-then-approve / reject) are logged for auditability.                                                                                                                           | [MVP]                                                 |
| FR-AI-09 | Character consistency: prompts and reference assets are managed so recurring characters look the same across lessons, stories, and worlds.                                                                                                          | [MVP]                                                 |

### 5.14 Admin Content Management (FR-CMS)

| ID        | Requirement                                                                                                                                                                                                | Scope                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| FR-CMS-01 | Admins manage all content in a dedicated content-management area (subjects, topics, lessons, stories, quizzes, badges).                                                                                    | [MVP]                                     |
| FR-CMS-02 | Admins can upload video, audio, and image files (stored on the media host, §9).                                                                                                                            | [MVP]                                     |
| FR-CMS-03 | Admins can write or edit quiz questions directly.                                                                                                                                                          | [MVP]                                     |
| FR-CMS-04 | Admins can preview any lesson end-to-end before it goes live.                                                                                                                                              | [MVP]                                     |
| FR-CMS-05 | A separate **AI review queue** lists all AI-generated content awaiting review; for each item the admin can read the text, listen to the audio, preview images, then approve, edit-then-approve, or reject. | [MVP]                                     |
| FR-CMS-06 | Approved content is published immediately and becomes available to students; rejected content is logged but never shown to students.                                                                       | [MVP]                                     |
| FR-CMS-07 | Admins can view platform-wide usage and analytics.                                                                                                                                                         | [MVP — basic; detailed analytics Phase 2] |

---

## 6. Non-Functional Requirements

### 6.1 Accessibility (NFR-A11Y)

| ID          | Requirement                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-A11Y-01 | Children must be able to use the platform independently without reading: every instruction is delivered by voice.                           |
| NFR-A11Y-02 | All buttons and interactive elements are large enough for small fingers (generous touch targets; see `document/design.md` for exact sizes). |
| NFR-A11Y-03 | A high-contrast display mode is available for children with visual sensitivities.                                                           |
| NFR-A11Y-04 | An optional dyslexia-friendly font is available.                                                                                            |
| NFR-A11Y-05 | All animations can be paused; respect reduced-motion preferences.                                                                           |
| NFR-A11Y-06 | Full keyboard-only navigation is supported across the platform.                                                                             |

### 6.2 Safety & Privacy (NFR-SAFE)

| ID          | Requirement                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| NFR-SAFE-01 | No social features of any kind: no messaging, chat, comments, or child-to-child contact.                    |
| NFR-SAFE-02 | A child's profile and activity data are visible only to their own parent.                                   |
| NFR-SAFE-03 | Verified parental consent precedes any child-profile creation.                                              |
| NFR-SAFE-04 | No child personal data is shared with third parties or used for advertising. No ads anywhere.  |
| NFR-SAFE-05 | Full account + data deletion on parent request.                                                             |
| NFR-SAFE-06 | Compliance with **COPPA** and **GDPR** (data minimisation, consent records, right to erasure, data export). |
| NFR-SAFE-07 | Student portal contains no external links and no mechanisms that navigate the child off-platform.           |

### 6.3 Performance & Device Targets (NFR-PERF)

| ID          | Requirement                                                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-PERF-01 | **Primary devices are phones and tablets** used by small children; the experience is mobile-first and responsive up to desktop. Both portrait and landscape are handled gracefully. |
| NFR-PERF-02 | Media (video/audio/images) is streamed/served from a CDN-backed media host; lesson screens stay responsive while media loads (skeletons, preloading next step).                     |
| NFR-PERF-03 | Works acceptably on mid-range tablets and modest network connections (content is short-form; assets optimized/compressed).                                                          |
| NFR-PERF-04 | The free-tier deployment (§9) must survive cold starts gracefully (loading states, retries) since free backend hosts sleep.                                                         |

### 6.4 Scalability & Maintainability (NFR-SCALE)

| ID           | Requirement                                                                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-SCALE-01 | The database and system architecture are symmetric/modular: higher grades, new subjects, new worlds, and new languages roll out as **data**, not code rewrites. |
| NFR-SCALE-02 | Activity and quiz engines render from versioned JSON schemas; schema changes are additive and versioned.                                                        |
| NFR-SCALE-03 | The entire system (frontend + backend + shared packages) runs locally with a single command (`pnpm dev` via Turborepo).                                         |

---

## 7. Technical Architecture

### 7.1 Monorepo Layout (current + target)

The repo is a **pnpm + Turborepo** monorepo (pnpm 9, workspace globs `apps/*`, `packages/*`):

```
kidlearn/
├── apps/
│   ├── web/        # Next.js 16 (App Router) + React 19 + Tailwind CSS v4 — student portal, parent dashboard, admin CMS
│   └── server/     # Express 5 + TypeScript (ESM, tsx dev) — REST API: progress, quiz responses, localized asset paths, AI pipeline
├── packages/
│   ├── ui/         # Shared React component library (placeholder — needs package.json before use)
│   ├── types/      # Shared TypeScript types / JSON schemas (placeholder — needs package.json before use)
│   ├── db/         # PLANNED: Prisma schema + client (Supabase/PostgreSQL)
│   └── config/     # Shared TS configs (placeholder — needs package.json before use)
├── document/       # This document, key-description.md, design.md
├── biome.json      # Biome = lint + format (repo-wide; NOT ESLint/Prettier)
├── turbo.json
└── pnpm-workspace.yaml
```

> Note: `key-description.md` mentions shared ESLint config; this repo standardised on **Biome** instead. Biome runs repo-wide from the root (`pnpm lint` / `pnpm format`).

### 7.2 Stack Summary

| Layer             | Technology                                         | Notes                                                                       |
| ----------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| Monorepo tooling  | Turborepo + pnpm workspaces                        | `pnpm dev` runs web + server together                                       |
| Frontend          | Next.js 16 (App Router), React 19, Tailwind CSS v4 | Responsive; phones/tablets primary                                          |
| Backend           | Express 5 + TypeScript (ESM)                       | `apps/server`, port 4000 default, `tsx` in dev                              |
| Database          | Supabase (PostgreSQL, free tier)                   | Single source of truth; relational data + `JSONB` for quiz/activity schemas |
| ORM / migrations  | Prisma                                             | Lives in `packages/db`, consumed by `apps/server`                           |
| i18n              | i18next (frontend) + per-language asset refs (DB)  | FR-I18N-03                                                                  |
| AI — text/quizzes | Gemini text models (free tier) → JSON payloads     | Validated against shared schemas in `packages/types`                        |
| AI — images       | Gemini image models (free tier)                    | FR-AI-05                                                                    |
| AI — video        | Google Veo / Runway Gen-3 / Mootion                | FR-AI-06                                                                    |
| AI — audio        | Google Cloud Text-to-Speech (Standard, free tier)  | FR-AI-04                                                                    |
| Media hosting     | Cloudinary or Uploadthing (free tier)              | Streams images, audio, short video                                          |

### 7.3 Architectural Principles

1. **Content as data.** Lessons, activities, quizzes, badges, worlds, and languages are database rows + JSON payloads + media URLs. The frontend ships generic engines (lesson player, activity engine, quiz engine) that render whatever the data describes.
2. **Shared schemas.** JSON schemas / TypeScript types for activities and quizzes live in `packages/types`, shared by the frontend renderer, the backend validator, and the AI generation prompts — one definition, three consumers.
3. **Server-authoritative progress.** Rewards, streaks, screen time, and completion are computed/recorded server-side; the client reports events.
4. **Review-gated publishing.** Content rows carry a status (`draft → in_review → approved/rejected → published`); student queries only ever see `published`.

---

## 8. Data Model Overview

High-level entities (Prisma schema to be derived from this list):

- **Parent** — auth identity, email, PIN hash, consent record.
- **ChildProfile** — name, age, grade level, language preference, avatar/character, belongs to Parent (≤5 per parent).
- **Subject / Topic / Lesson** — curriculum hierarchy; Lesson carries world tag, grade tags, status, and ordered step content (intro script, video asset refs per language, activity ref, quiz ref).
- **Activity** — type (drag-drop | trace | match | puzzle) + `JSONB` definition + per-language audio/asset refs.
- **Quiz / QuizQuestion** — format (mcq | match-pair | drag-answer | picture-select) + `JSONB` definition + per-language audio.
- **Story / StoryPage** — theme, world, grade tags; per-page illustration + per-language text and narration audio.
- **LessonProgress** — child × lesson: current step, completed_at, score, time spent.
- **QuizResponse** — child × question: answer, correct?, timestamp.
- **RewardLedger** — child, reward type (star | coin | badge), source event, timestamp.
- **Badge** — admin-defined milestone rules + icon.
- **Character** — avatar characters + unlock criteria; **ChildCharacter** join for unlocks.
- **Streak** — child, current count, longest, last activity date.
- **ScreenTimeSetting** — child: daily limit minutes, access window start/end.
- **SessionEvent / LearningTime** — server-recorded activity heartbeats per child (powers FR-TIME-06, FR-DASH-02).
- **WeeklyReport** — child, week, aggregated metrics + note (FR-DASH-05).
- **AIGenerationJob** — type (lesson | story | quiz | audio | image), inputs, raw output, status, reviewer, decision, timestamps (FR-AI-08).
- **MediaAsset** — host URL, kind, language (nullable), linked entity.
- **AdminUser** — internal role for CMS access.

All content entities carry `status` (publishing workflow) and language-scoped child records or asset maps (i18n).

---

## 9. Deployment Strategy (Zero-Cost MVP)

| Service                 | Platform                              | Notes                                            |
| ----------------------- | ------------------------------------- | ------------------------------------------------ |
| Frontend (`apps/web`)   | Vercel or Netlify                     | Global CDN, preview deploys                      |
| Backend (`apps/server`) | Render, Railway, or Fly.io            | Free tier; expect cold starts (NFR-PERF-04)      |
| Database                | Supabase free cluster (PostgreSQL)    | Also candidate for auth + storage if convenient  |
| Media assets            | Cloudinary or Uploadthing (free tier) | AI-generated images, audio, short video snippets |

Environment configuration via `.env` per app (`apps/server/.env.example` is the template). No paid infrastructure for MVP launch; the architecture must allow upgrading any single layer (e.g. paid Postgres) without touching the others.

---

## 10. MVP Scope

The first release validates the core product with real users before expanding.

**Grades:** Nursery and KG-1 (ages 3–5)
**Languages:** English and Bangla

**Content included:**

- Alphabet — letters A–Z
- Numbers — 1–20
- Shapes — circle, square, triangle, rectangle, star
- Colors — red, blue, green, yellow, orange, purple
- Stories — starter library of 20 stories

**Features included:**

- Full five-step lesson experience (FR-LSN-01..07)
- All four activity types + all four quiz formats (FR-ACT, FR-QUIZ)
- Audio narration in English and Bangla (FR-I18N, FR-AI-04)
- Rewards: stars, coins, badges, streaks, character unlocks (FR-GAM)
- Parent account + child profile management, PIN gate (FR-AUTH, FR-PROF)
- Parent dashboard with progress + weekly reports (FR-DASH)
- Screen time controls (FR-TIME)
- AI content pipeline with admin review queue (FR-AI, FR-CMS)

**Explicitly out of MVP scope:** Grade 1+ content, KG-2, Arabic/Hindi/Spanish, teacher dashboards and classrooms, school administration, Space World content, and (potentially late) PDF worksheets / offline downloads / personalised AI stories.

---

## 11. Phased Roadmap

| Phase             | Contents                                                                                                                                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1 (MVP)** | Everything in §10.                                                                                                                                                                                                                                                                  |
| **Phase 2**       | KG-2 grade content; Arabic language; teacher role + virtual classrooms (lesson assignment, class progress); Space World subjects (science); detailed admin analytics; PDF worksheets, offline downloads, and personalised AI stories if not shipped in MVP. |
| **Phase 3**       | Hindi and Spanish languages; Grade 1+ rollout (data-only, per NFR-SCALE-01); school administration features.                                                                                                                                                                        |

---

## 12. Assumptions & Resolved Conflicts

Where the two source documents disagreed, this master document resolves as follows:

1. **Age range:** Functional Requirements say ages 3–6 (Nursery/KG-1/KG-2); key-description says 3–5. **Resolution:** the platform targets ages **3–6** overall; the **MVP targets 3–5** (Nursery + KG-1), with KG-2 in Phase 2.
2. **Lint tooling:** key-description proposes shared ESLint config; the repo uses **Biome** repo-wide. **Resolution:** Biome (per `CLAUDE.md` and `biome.json`).
3. **Package manager:** key-description says npm/yarn workspaces; the repo uses **pnpm 9**. **Resolution:** pnpm + Turborepo.
4. **Shared packages:** repo currently has `packages/{ui,types,config}` placeholders (no `package.json` yet); key-description plans `packages/db` for Prisma. **Resolution:** target layout in §7.1 — each package must gain a `package.json` with `name` + `dev`/`build`/`typecheck` scripts before use.
5. **Daily session length:** key-description's 30–60 minute daily journey is adopted as the design intent (Pillar B); the parent-set screen-time limit (FR-TIME-01) is the enforced bound and may be set below or above it.
6. **Parental gate:** the PIN gate from key-description is adopted as a hard requirement (FR-AUTH-04) even though the Functional Requirements doc didn't specify it — it is necessary for child safety.
7. **Quiz/activity storage:** key-description's "LLM → JSON → Postgres `JSONB` → dynamic frontend modules" pattern is adopted as the architectural foundation for both activities and quizzes (FR-ACT-06, FR-QUIZ-07).
8. **Testing:** no test runner exists in the repo yet; one must be added before feature work begins in earnest (assumption: Vitest for both apps — confirm before setup).

---

_End of Project Requirement Details — KidLearn Master Document v1.0_
