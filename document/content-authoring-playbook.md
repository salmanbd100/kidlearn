# KidLearn — Content Authoring Playbook (AI assistants over MCP)

How to fill KidLearn with lessons, quizzes and stories for Nursery, KG-1 and KG-2 using the
**AI subscriptions you already pay for** — Claude and Google (Gemini, NotebookLM) — through the
MCP server from `implementation/41-mcp-content-authoring.md`. No API key is needed for any of
them. It covers what to set up once, what to write, the prompts to paste, and how to review it.

Each tool does the job it is best at:

| Tool | Reaches `/mcp`? | Use it for |
| --- | --- | --- |
| **NotebookLM** | No | Research grounded in real sources — a lesson brief per topic (§6.0) |
| **Claude Desktop** | Yes (§2.2) | Writing and submitting drafts |
| **Gemini CLI** | Yes (§2.3) | Writing and submitting drafts — same tools, same queue |
| **Gemini app** | No | Making the pictures (§6.7) |

The Gemini *app* and NotebookLM have no MCP client, so they never submit anything — their
output is pasted into Claude or Gemini CLI, which submit through the tools.

Upload this file to the Claude Project (§2.4) and the NotebookLM notebooks (§2.5) as a source,
so each tool can read the plan too. Gemini CLI reads it from `GEMINI.md` (§2.3).

---

## 1. What the assistant can and cannot do here

Read this before planning a week of work. It decides where your hours go.

| The assistant writes over MCP | You do by hand in the CMS |
| --- | --- |
| Lesson title, intro, narration script, learning objectives (en + bn) | Create **subjects and topics** — MCP cannot (§3) |
| 3–5 quiz questions per lesson, or a quiz for an existing lesson | Replace **every quiz audio and image placeholder** — approval is blocked until you do |
| 6–8 page stories with character sheets and illustration prompts | Story page illustrations and narration audio |
| Fixes to a rejected draft, using the reviewer's reason | Activities (drag-drop, trace, match, puzzle) — `ActivityEditor` |
| A production sheet: every recording and picture a draft needs | Approve / reject in the AI Queue |

**The asset bottleneck.** Every quiz question has `promptAudio` in English *and* Bangla, and
`picture_select` options need images. The assistant writes placeholder URLs
(`https://placeholder.kidlearn.invalid/...`); the AI Queue refuses to approve a job while a
question still points at one (`review/blockers.ts`). `request_narration` and
`request_illustrations` need a Google TTS key and a server-side `GEMINI_API_KEY` respectively —
a Gemini app subscription is not that key, so without them neither works, and narration never covers quiz prompts anyway.

So one 4-question lesson means roughly **8 short voice recordings + 4–12 pictures**. That is the
real cost of a lesson, not the writing. The plan below is sized for it:

- Record audio yourself (Voice Memos / QuickTime → `.m4a`, accepted). A real, warm voice is
  better for a 3-year-old than TTS anyway.
- Make pictures in the Gemini app (§6.7) and upload as **PNG** — the media library rejects SVG.
- **Reuse pictures.** Every prompt below tells the assistant to use one shared slug per object
  (`image/shared/apple.png`), so an apple is drawn and uploaded once and picked from the media
  library in every lesson after that.

> If you ever want to cut the manual work: Google Cloud Text-to-Speech has a free monthly tier
> and would narrate lesson intros and story pages from the CMS button. It does not cover quiz
> prompts. Optional — nothing below depends on it.

---

## 2. One-time setup

### 2.1 Turn on MCP and get a token

1. API env: `MCP_ENABLED=true` (production: the SSM parameter — `runbook.md` "AI assistants over MCP").
2. CMS → **AI assistants** → create one token per assistant, named after it
   (`Claude Desktop — <machine>`, `Gemini CLI — <machine>`), **30 days** (the maximum). It is
   shown once — copy it straight into the config below. Separate tokens let you revoke one
   assistant without breaking the other.
3. Note your daily cap on the same page (`MCP_DRAFTS_PER_DAY`, default 30). You will not get
   near it; your bottleneck is review and assets.

### 2.2 Connect Claude Desktop

Needs Node.js installed (`node -v`). Claude Desktop → **Settings → Developer → Edit Config**,
paste the snippet the AI assistants page shows for Claude Desktop (it uses `mcp-remote`),
save, **quit and reopen** Claude Desktop. In a new chat, the tools menu should list `kidlearn`
with 12 tools.

Test it: *"Call kidlearn get_authoring_guide and summarise the rules in five bullets."*

When the token expires, create a new one and replace it in the config. Revoke the old one.

### 2.3 Connect Gemini CLI

Gemini CLI runs on your Google account's Gemini plan — sign in with Google when it asks, and
do **not** set `GEMINI_API_KEY` in that terminal, or it bills the API key instead.

1. Install: `npm install -g @google/gemini-cli` (needs Node.js), then run `gemini` once and
   choose **Sign in with Google**.
2. Copy the **Gemini CLI** command from CMS → AI assistants and run it in a terminal. It has
   this shape:

   ```bash
   gemini mcp add --scope user --transport http \
     --header "Authorization: Bearer klat_YOUR_TOKEN" \
     kidlearn https://api.kidlearn.net/mcp
   ```

   `--scope user` writes it to `~/.gemini/settings.json`, so it loads in every directory. The
   result is the same as adding this by hand:

   ```json
   {
     "mcpServers": {
       "kidlearn": {
         "httpUrl": "https://api.kidlearn.net/mcp",
         "headers": { "Authorization": "Bearer klat_YOUR_TOKEN" }
       }
     }
   }
   ```

   `httpUrl`, not `url` — Gemini CLI reads `url` as an SSE endpoint, which `/mcp` is not.
   Leave `trust` off: Gemini CLI then asks before every tool call, which is your last look
   at a submission before it lands in the queue.
3. Check: `gemini mcp list` in the shell, or `/mcp` inside Gemini CLI — `kidlearn`, connected,
   12 tools.
4. Make a folder `~/kidlearn-content/`, put a copy of this file in it, and save §6.1 as
   `GEMINI.md` there. Gemini CLI loads `GEMINI.md` from the folder it starts in — that is its
   Claude Project. Always start it with `cd ~/kidlearn-content && gemini`.

Test it: *"Call kidlearn get_authoring_guide and summarise the rules in five bullets."*

Start a fresh session per lesson (`/clear`, or quit and restart), for the same reason as in
Claude.

### 2.4 Create a Claude Project

Create a Project called **KidLearn Content Studio**. Paste §6.1 into its instructions and upload
this file. Start **every** content chat inside this project — it keeps the rules loaded without
spending a message on them.

Start a **new chat per lesson or story**. Long chats use your plan's usage allowance much
faster, because every message re-reads the whole conversation.

### 2.5 Set up NotebookLM and a Gemini Gem

**NotebookLM — one notebook per subject** (Language, Mathematics, Science). Add as sources:
this file, and the real material you want lessons to follow — the NCTB pre-primary textbooks
(Bangla and English), early-years phonics or numeracy guides, and any lesson notes of your own.
NotebookLM answers only from its sources and cites them, which is what makes its briefs
trustworthy. Do not use its Audio Overviews for children — they are a two-host podcast, not
narration.

**Gemini app — a Gem called KidLearn Pictures.** Gemini → Gems → New Gem, and paste the style
block from §6.7 as its instructions, so every picture comes out in the same style.

### 2.6 Which assistant writes what

Both Claude and Gemini CLI submit into the same AI Queue, and each job records which assistant
sent it. Use whichever writes better for the piece in front of you — and keep score: for the
first two weeks, write a few lessons with each and note which drafts you reject. Then settle
on one per content type (for example, Bangla-heavy lessons with one, stories with the other)
from what you saw, not from impressions.

---

## 3. Curriculum to create in the CMS first

MCP tools only *read* subjects and topics, they never create them. Create these in
CMS → Curriculum before writing any content, each with its Bangla name.

The seed gives the four subjects grades **Nursery and KG-1 only** — edit Language, Mathematics
and Science and **add KG-2**, or KG-2 content sits under subjects that do not claim it.

| Subject | Topic (en) | Topic (bn) | Slug | Grades |
| --- | --- | --- | --- | --- |
| Language | Alphabet *(seeded)* | বর্ণমালা | `alphabet` | N, KG1, KG2 |
| Language | Bangla Letters | বাংলা বর্ণ | `bangla-letters` | N, KG1, KG2 |
| Language | Words Around Me | চারপাশের শব্দ | `words-around-me` | N, KG1, KG2 |
| Mathematics | Numbers and Counting | সংখ্যা ও গণনা | `numbers-counting` | N, KG1, KG2 |
| Mathematics | Shapes | আকার | `shapes` | N, KG1, KG2 |
| Mathematics | Compare and Pattern | তুলনা ও নকশা | `compare-pattern` | N, KG1, KG2 |
| Science | My Body | আমার শরীর | `my-body` | N, KG1, KG2 |
| Science | Animals | প্রাণী | `animals` | N, KG1, KG2 |
| Science | Nature and Weather | প্রকৃতি ও আবহাওয়া | `nature-weather` | N, KG1, KG2 |

Publish the topics (student queries show `published` only). Social Skills is not a lesson
subject in this plan — it is carried by the stories (§5).

---

## 4. The lesson plan — 27 lessons, phase 1

One lesson per topic per grade. Each row is a ready **lesson focus** — paste it into §6.3.
The "then" column is how the topic continues once phase 1 is live and tested.

### How the grades differ

Put the matching row into every prompt; it is what makes a Nursery lesson feel different from a
KG-2 one.

| | Nursery (3–4) | KG-1 (4–5) | KG-2 (5–6) |
| --- | --- | --- | --- |
| One idea per lesson | 1 new thing | 1–2 related things | a small skill (compare, sort, sound out) |
| Sentence length (spoken) | ≤ 6 words | ≤ 8 words | ≤ 10 words |
| Narration | ~60–80 words, lots of repetition | ~80–100 words | ~100–120 words |
| Quiz questions | **3** | **4** | **4–5** |
| Formats | `picture_select`, `mcq` with picture options, one 2-pair `match_pair` | all four, 3 options | all four, `drag_answer` with a short sentence, up to 4 options |
| Number range | 1–3 / 1–5 | 1–10 | 1–20, add/take within 5–10 |
| Joy | a sound to copy, clapping, peekaboo | a "can you find…?" game, silly mix-ups | a small challenge, "you are a detective" |

### Language

| Topic | Nursery | KG-1 | KG-2 | Then |
| --- | --- | --- | --- | --- |
| Alphabet | Letter A: its sound and things that start with A, like apple and ant | Letters A to E and the first sound of each | Beginning sounds: which picture starts with the /b/ sound | one letter (N) / five letters (KG1) at a time; KG2 ending sounds, then cat–hat–bat words |
| Bangla Letters | স্বরবর্ণ অ আর আ — আম আর আনারস দিয়ে চেনা | স্বরবর্ণ ই, ঈ, উ, ঊ — প্রতিটির সাথে একটি চেনা শব্দ | ব্যঞ্জনবর্ণ ক, খ, গ — কোন ছবির শুরু কোন বর্ণে | the remaining স্বরবর্ণ, then ব্যঞ্জনবর্ণ in groups of three |
| Words Around Me | Fruits I know: mango, banana, apple | Rhyming words: cat and hat, sun and fun | Opposites: big and small, hot and cold, up and down | colours, family words, actions (run, jump, sleep) |

### Mathematics

| Topic | Nursery | KG-1 | KG-2 | Then |
| --- | --- | --- | --- | --- |
| Numbers and Counting | Counting 1, 2, 3 with fruits | Counting objects and matching them to the numbers 1 to 10 | One more and one less with numbers up to 20 | N 4–5; KG1 counting backwards from 10; KG2 adding within 5, then 10 |
| Shapes | Circle and square in things around us | Triangle, rectangle and star | Ball, box and can: shapes we can hold (sphere, cube, cylinder) | N triangle; KG1 sorting shapes; KG2 shapes inside pictures |
| Compare and Pattern | Big and small | Colour patterns: red, blue, red, blue — what comes next | More, fewer and the same | N long/short; KG1 shape patterns; KG2 tallest to shortest |

### Science

| Topic | Nursery | KG-1 | KG-2 | Then |
| --- | --- | --- | --- | --- |
| My Body | My face: eyes, nose, mouth and ears | My five senses | Healthy habits: washing hands and brushing teeth | N hands/feet; KG1 what each sense tells us; KG2 food that helps us grow |
| Animals | Animal sounds: cow, cat and duck | Animal homes: nest, burrow, pond and hive | Animal babies: kitten, calf, chick and duckling | N farm animals; KG1 sea animals; KG2 what animals eat |
| Nature and Weather | Sunny day and rainy day | Day and night | How a seed grows into a plant | N wind; KG1 seasons; KG2 what plants need |

**Order to write them in:** do all 9 Nursery lessons first, then KG-1, then KG-2. Nursery
lessons share the most pictures with later grades (fruit, animals, shapes), so you build the
image library once, early.

---

## 5. Stories — 6, phase 1

Stories are where Social Skills lives. Set them in the two seeded worlds and **reuse the world's
existing characters** (`list_characters`) so the illustrations stay consistent.

| World | Theme (paste as `theme`) | Grades | Ties to |
| --- | --- | --- | --- |
| Jungle | Taking turns on the swing makes playtime fun for everyone | N, KG1 | sharing |
| Jungle | Trying again after a fall, until you can climb the little tree | KG1, KG2 | perseverance |
| Jungle | Counting bananas one by one for a picnic with friends, up to five | N, KG1 | Numbers and Counting |
| Ocean | Saying sorry after bumping into a friend, and making up | N, KG1 | feelings |
| Ocean | Helping a lost little crab find its way home | KG1, KG2 | Animals: homes |
| Ocean | A rainy day under the sea: what changes above the water | KG1, KG2 | Nature and Weather |

Each story is 6–8 pages, so 6–8 illustrations. Keep it to **one story per week** until the
picture pipeline (§6.7) is comfortable.

---

## 6. The prompts

Replace `{{…}}`. Paste one prompt per new chat — inside the Claude Project, or in a fresh Gemini
CLI session started in `~/kidlearn-content/`. §6.1–6.6 work unchanged in either assistant.

### 6.0 Lesson brief (NotebookLM)

Optional, but it makes §6.3 far better. Run in the subject's notebook, then paste the answer
into §6.3's `Brief:` line.

```text
Write a short lesson brief for KidLearn, ages 3–6, from these sources only.

Topic: {{Shapes}}
Grade: {{KG1}}
Lesson focus: {{Triangle, rectangle and star}}

Give me, in under 200 words:
- the one thing the child should be able to do after the lesson;
- the words to teach, in English and Bangla, as a Bangladeshi parent would say them;
- three everyday examples a child in Bangladesh sees at home or outside;
- one common mistake children this age make with it;
- which source each point comes from.
```

### 6.1 Project instructions (paste once into the Claude Project, and save as `GEMINI.md`)

```text
You are the content writer for KidLearn, a learning app for children aged 3–6 in Nursery,
KG-1 and KG-2. Children cannot read yet: everything you write is read aloud to them, in
English and in Bangla.

Always work through the kidlearn MCP tools:
- Call get_authoring_guide at the start of every chat and follow it exactly.
- Find every id with list_curriculum or list_characters. Never invent an id.
- Before writing quiz questions, call get_quiz_format_schema for each format you will use.
- Submit with submit_lesson_draft, submit_story_draft or submit_quiz_questions. If the tool
  returns validation errors, fix only those fields and submit again.
- Always pass a clientRequestId in the form {{subject}}-{{topic-slug}}-{{grade}}-{{nn}}, e.g.
  math-shapes-kg1-01. Reuse the same id when you retry the same piece of content.

How to write so children love it:
- Talk to one child, warmly: "Hello, friend!", "You did it!". The mascot is their friend.
- Make it playful: a sound to copy, something to clap or point at, a small surprise or a
  silly mix-up the child gets to fix. Repeat the key word three times or more.
- Use things a small child sees every day: food, toys, animals, family, home, weather.
- Never scary, never sad for long, never a lecture. A wrong answer is "Let's try again!".
- Bangla must sound like a Bangladeshi parent talking to their child, not a translation.
  Use simple চলিত ভাষা, never সাধু ভাষা.

Pictures and audio (very important — a person makes every one by hand):
- Every image URL is https://placeholder.kidlearn.invalid/image/shared/<object>.png, where
  <object> is a short English noun for the picture: apple, cat, red-circle, three-bananas.
  The same object always uses the same name, in every lesson, so one picture is reused.
- Every audio URL is
  https://placeholder.kidlearn.invalid/audio/<en|bn>/<clientRequestId>-q<n>.m4a
- Every image needs alt text in both languages, describing exactly what to draw.
- Use as few distinct pictures as the question allows. Prefer objects already used before.

Before you submit anything, check it against the grade table I give you and tell me in one
line what you checked. After a successful submit, give me the jobId and a production sheet:
every audio clip (file name + the exact words to record, in each language) and every
picture (file name + what to draw).
```

### 6.2 Start of session — what exists

```text
List the KidLearn curriculum: every subject and topic with its id, its grade levels and how
many lessons it has, and the worlds. Then list my drafts that are awaiting review or were
rejected. Show it as one short table. Do not write anything yet.
```

### 6.3 One lesson (the prompt you will use most)

```text
Write one KidLearn lesson and submit it as a draft.

Subject: {{Mathematics}}
Topic: {{Shapes}}
Grade: {{KG1}}
Lesson focus: {{Triangle, rectangle and star}}
World: {{Jungle}} (use its characters as the mascot's friends where it fits)
Languages: en, bn
clientRequestId: {{math-shapes-kg1-01}}
Brief: {{paste the §6.0 NotebookLM brief, or delete this line}}

Grade rules for {{KG-1}}:
{{paste the KG-1 column from §4 "How the grades differ"}}

Steps:
1. Call get_authoring_guide and list_curriculum, find the ids.
2. Call get_quiz_format_schema for each format you will use.
3. Show me the lesson in plain text first: titles, intro, narration and each question with
   its correct answer, in both languages. Then check it against the grade rules and against
   "could a {{4}}-year-old enjoy this?". Improve anything that fails.
4. Submit with submit_lesson_draft. Fix any validation errors and resubmit.
5. Give me the jobId and the production sheet.
```

> Step 3 shows you the lesson before it is submitted. If something feels off, say so then — a
> fix before submitting costs one message; a reject costs a whole cycle.

### 6.4 Quiz for an existing lesson

Use when you authored a lesson by hand, or a lesson's quiz was too easy or too hard.

```text
Write {{4}} quiz questions for the existing lesson {{lesson title or id}} and submit them with
submit_quiz_questions. clientRequestId: {{lang-alphabet-kg1-01-quiz}}.

1. Call get_lesson and read what it taught. Every question must be answerable from that alone.
2. Use at least three different formats. Fetch each format's schema first.
3. Questions get gently harder: the first one should feel easy and give an early win.
4. Show me the questions in plain text, then submit, then give me the production sheet.
```

### 6.5 One story

```text
Write one KidLearn story and submit it with submit_story_draft.

World: {{Jungle}}
Grades: {{NURSERY, KG1}}
Theme: {{Taking turns on the swing makes playtime fun for everyone}}
Pages: {{7}}
Languages: en, bn
clientRequestId: {{story-jungle-turns-01}}

1. Call list_characters for this world. Use its existing characters, copying their
   visualDescription exactly, and add at most one new character.
2. Each page: 1–3 short sentences. Give it a rhythm the child can join in with — a repeated
   line ("Whoosh, up and down!") on at least three pages.
3. The problem appears by page 3, is solved by the characters themselves, and the story ends
   happily with everyone together. Show the moral, never say "you should".
4. Every illustrationPrompt names the characters on the page, describes one clear scene,
   and ends with "bright flat cartoon style, soft colours, full scene".
5. Show me the story in plain text, then submit, then give me the production sheet: one row
   per page with the illustration prompt, and the narration text per language.
```

### 6.6 Fix a rejected draft

```text
Call get_draft_status for job {{jobId}}. Read the reviewer's rejection reason, then write a
corrected version that fixes exactly that and keeps everything else that was good. Show me
what you changed, then submit it with a new clientRequestId ({{old id}}-v2).
```

### 6.7 Make the pictures (PNG)

Use the **KidLearn Pictures** Gem in the Gemini app (§2.5). Its image model draws far better
illustrations than an assistant writing SVG by hand. Paste this block as the Gem's instructions
once:

```text
You draw pictures for KidLearn, a learning app for children aged 3–6. Every picture, so
they all match: flat cartoon, thick soft outlines, bright friendly colours, one object
centred, plain light background, square, no text, no letters unless the picture IS a
letter. Never scary, never branded. Draw exactly what the description says — the count,
the colour and the object are what the child is being asked about.
```

Then, in the Gem, one message per picture, straight from the production sheet's picture rows:

```text
{{three-bananas}}: {{three yellow bananas side by side}}
```

Check each picture against its row before downloading — a quiz about counting three bananas
fails if four are drawn. Download it, rename it to the sheet's file name (`three-bananas.png`)
and skip any name already uploaded. Before your first batch, check one download for a visible
Gemini watermark; if your plan adds one, crop it out or use the fallback below.

**Fallback — Claude.** For simple shapes, letters and numbers, where a vector drawing is exact
(`red-circle`, `letter-a`), Claude can draw them: in the Claude Project, with file creation
turned on (Settings → Capabilities), ask it to draw each row as SVG in the style above, convert
each to a 1024×1024 PNG with code, and give you the files.

Upload the PNGs in CMS → Media, then pick them in the question editor.

Keep a running list of uploaded picture names (a note, or the media library's search) — it is
what keeps you from drawing an apple twice.

### 6.8 Record the audio

No prompt needed: read each line of the production sheet into Voice Memos, one file per line,
named as the sheet says. Quiet room, phone 20 cm away, smile while you speak — it is audible.
Record all English lines, then all Bangla lines; it is faster than switching.

---

## 7. Reviewing in the AI Queue

Open the job and check, in this order. Reject with a specific reason — the assistant reads it (§6.6).

1. **Read it aloud.** Both languages. If you stumble, a child's parent will too.
2. **Safety.** Nothing scary, sad, dangerous, religious, branded or tied to one festival.
3. **Bangla.** Natural চলিত, the way you would say it to a child. Not a word-for-word copy.
4. **Correct answers.** Every quiz answer is right and answerable from the lesson.
5. **Grade fit.** Sentence length, number range and question count match §4.
6. **Joy.** Is there one moment a child would laugh, clap or shout the answer? If not, reject
   with "needs a playful moment — a sound, an action or a silly mix-up".
7. **Assets.** Replace every placeholder in the question editor (audio en + bn, images).
   Approve stays blocked until the last one is gone.
8. **Activity.** Add one in the lesson editor if the lesson needs a hands-on step: Nursery —
   `match`; KG-1 — `drag_drop`; KG-2 — `puzzle` or `trace` for letters and numbers.
9. **Approve**, then play it on a phone or tablet as a child would.

---

## 8. Weekly rhythm

| Week | Write | Assets | Goal |
| --- | --- | --- | --- |
| 1 — pilot | 3 Nursery lessons (one per subject) + 1 story | everything, to learn the pipeline | Play them with a real child. Fix the §6.1 instructions from what you see |
| 2 | remaining 6 Nursery lessons | builds most of the shared picture library | Nursery complete |
| 3 | 9 KG-1 lessons + 1 story | mostly reused pictures, new audio | KG-1 complete |
| 4 | 9 KG-2 lessons + 1 story | | KG-2 complete — 27 lessons, phase 1 done |
| 5+ | the "Then" column, 2–3 stories a week | | |

A sustainable day: **3 lessons written, reviewed and asset-complete.** Writing takes minutes;
the recording and pictures take the hour.

Claude and Gemini plans both have usage allowances that reset over time. If you hit one,
switch to the other assistant — the prompts are the same — or to recording and uploading
assets, which uses neither.

### Watch for after launch

- A lesson children skip or fail repeatedly (CMS → Analytics) — rewrite its quiz with §6.4.
- A topic finished fast — write its "Then" lessons next.
- A picture used in five or more lessons — it is your mascot material; make it beautiful.
