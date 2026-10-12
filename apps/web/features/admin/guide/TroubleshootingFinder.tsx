"use client";

import { Input, Label } from "@kidlearn/ui";
import { ChevronRight, Search } from "lucide-react";
import { useState } from "react";

interface Problem {
  symptom: string;
  meaning: string;
  fix: string;
}

const PROBLEMS: Problem[] = [
  {
    symptom: "Edit is greyed out",
    meaning: "The row is in review, approved or published.",
    fix: "Use Back to draft first. A published row leaves children until it is republished.",
  },
  {
    symptom: "New on Topics or Lessons is greyed out",
    meaning: "Nothing is selected in the column to its left.",
    fix: "Select a subject, then a topic.",
  },
  {
    symptom: "“Add the Bangla … before saving”",
    meaning: "A required field is empty in one language.",
    fix: "The form switches to that language's tab — fill it in.",
  },
  {
    symptom:
      "“slug must be lowercase alphanumeric words separated by single hyphens”",
    meaning: "Spaces, capitals or a double hyphen in the slug.",
    fix: "letter-a, not Letter A.",
  },
  {
    symptom: "DUPLICATE_SLUG",
    meaning: "That slug already exists.",
    fix: "Choose another — slugs are permanent.",
  },
  {
    symptom: "INVALID_TRANSITION",
    meaning: "That status move is not allowed.",
    fix: "Use the buttons shown. A rejected row must go back to draft before review.",
  },
  {
    symptom: "UNREGISTERED_ASSET when publishing",
    meaning: "The content links to a file that is not in the media library.",
    fix: "Upload it in Media, then pick it in the editor.",
  },
  {
    symptom: "AI_REVIEW_REQUIRED when publishing",
    meaning:
      "The row, or a clip or image attached to it, came from AI and has no approval yet.",
    fix: "Approve the named job in the AI Queue — approving publishes everything that job made, so review all of it first.",
  },
  {
    symptom:
      "An AI button fails, or says the model could not produce anything usable",
    meaning: "A Gemini error, quota, or lapsed subscription.",
    fix: "Write the content by hand — see Working without Gemini.",
  },
  {
    symptom: "429 RATE_LIMITED on an AI button",
    meaning: "The daily generation cap is reached.",
    fix: "It resets at local midnight. Enter content by hand meanwhile.",
  },
  {
    symptom: "Published, but a child cannot see it",
    meaning: "One of the four visibility conditions is not met.",
    fix: "Check the world, topic and subject are published, and the child's grade is ticked on all three levels.",
  },
  {
    symptom: "The lesson plays without its quiz or activity",
    meaning:
      "The quiz or activity is unpublished, or its id is not on the lesson.",
    fix: "Publish it from its own page, and check the id field on the lesson.",
  },
  {
    symptom: "“Waking the API up…”",
    meaning: "The server was idle.",
    fix: "Wait a few seconds.",
  },
];

export function TroubleshootingFinder() {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = PROBLEMS.filter((problem) =>
    [problem.symptom, problem.meaning, problem.fix]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="guide-trouble-search">
          Search by what you see, or by an error code
        </Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="guide-trouble-search"
            type="search"
            value={query}
            placeholder="e.g. greyed out, slug, AI_REVIEW_REQUIRED"
            className="pl-9"
            aria-describedby="guide-trouble-count"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <p
          id="guide-trouble-count"
          aria-live="polite"
          className="text-muted-foreground text-xs"
        >
          {matches.length === PROBLEMS.length
            ? `${PROBLEMS.length} common problems`
            : `${matches.length} of ${PROBLEMS.length} match`}
        </p>
      </div>

      {matches.length === 0 ? (
        <p className="rounded-(--radius) border border-border border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
          Nothing matches “{query}”. Try a shorter word, or the error code
          exactly as shown.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {matches.map((problem) => (
            <li key={problem.symptom}>
              <details className="group rounded-(--radius) border border-border bg-card">
                <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-(--radius) px-3 py-2 font-medium text-foreground text-sm [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
                  />
                  {problem.symptom}
                </summary>
                <dl className="grid gap-2 border-border border-t px-3 py-3 text-sm sm:grid-cols-2">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-muted-foreground text-xs">Meaning</dt>
                    <dd className="text-foreground">{problem.meaning}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-muted-foreground text-xs">Fix</dt>
                    <dd className="text-foreground">{problem.fix}</dd>
                  </div>
                </dl>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
