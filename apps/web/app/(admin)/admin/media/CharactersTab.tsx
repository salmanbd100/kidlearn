"use client";

import type { AdminWorld, CharacterSheet } from "@kidlearn/types";
import { Button, Input, Label, Select, Textarea } from "@kidlearn/ui";
import { useCallback, useEffect, useState } from "react";
import {
  createCharacterSheet,
  fetchCharacterSheets,
  fetchWorlds,
  promoteJobCharacters,
  updateCharacterSheet,
} from "@/lib/admin-api";

// The Characters tab on `/admin/media` (file 36, FR-AI-09).

type Draft = {
  name: string;
  worldId: string;
  description: string;
};

const EMPTY_DRAFT: Draft = { name: "", worldId: "", description: "" };

/** The server's floor, restated so the form can refuse before the round trip. */
const DESCRIPTION_MIN = 20;

export function CharactersTab() {
  const [sheets, setSheets] = useState<CharacterSheet[]>([]);
  const [worlds, setWorlds] = useState<AdminWorld[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string>();
  const [editingText, setEditingText] = useState("");
  const [jobId, setJobId] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setStatus("loading");
    const [sheetResult, worldResult] = await Promise.all([
      fetchCharacterSheets(),
      fetchWorlds(),
    ]);

    if (!sheetResult.ok || !worldResult.ok) {
      setStatus("error");
      return;
    }
    setSheets(sheetResult.data);
    setWorlds(worldResult.data);
    setStatus("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(
    action: () => Promise<{ ok: boolean; error?: { message: string } }>,
    successNotice: string,
  ): Promise<boolean> {
    setIsBusy(true);
    setNotice(undefined);
    setError(undefined);

    const result = await action();
    if (!result.ok) {
      setError(result.error?.message ?? "That did not work.");
      setIsBusy(false);
      return false;
    }

    await load();
    setNotice(successNotice);
    setIsBusy(false);
    return true;
  }

  async function handleCreate() {
    const saved = await run(
      () =>
        createCharacterSheet({
          name: draft.name.trim(),
          description: draft.description.trim(),
          worldId: draft.worldId === "" ? null : draft.worldId,
        }),
      `Saved. ${draft.name.trim()} will be described this way in every picture drawn from now on.`,
    );
    if (saved) setDraft(EMPTY_DRAFT);
  }

  async function handleSaveEdit(sheet: CharacterSheet) {
    const saved = await run(
      () => updateCharacterSheet(sheet.id, { description: editingText.trim() }),
      `${sheet.name} rewritten. Pictures already drawn keep the old look — regenerate a page to redraw it.`,
    );
    if (saved) setEditingId(undefined);
  }

  /**
   * Not routed through `run()` because it needs the `created`/`skipped` payload,
   * which `run()`'s boolean result discards — but it owes the same `isBusy` cycle:
   * without it the button's `disabled={isBusy || …}` never engages, and a second
   * click during an un-retried request that reads a job and writes *n* rows starts
   * a second one.
   */
  async function handleImport() {
    setIsBusy(true);
    setNotice(undefined);
    setError(undefined);

    const result = await promoteJobCharacters(jobId.trim());
    if (!result.ok) {
      setError(result.error.message);
      setIsBusy(false);
      return;
    }

    const { created, skipped } = result.data;
    await load();
    setJobId("");
    setIsBusy(false);
    setNotice(
      created.length === 0
        ? `Nothing new — all ${skipped} of that story's characters already have a sheet, and none were overwritten.`
        : `${created.length} saved${skipped === 0 ? "" : `, ${skipped} already had a sheet`}: ${created
            .map((sheet) => sheet.name)
            .join(", ")}.`,
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted-foreground text-sm">
          The character sheets could not be loaded.
        </p>
        <Button type="button" variant="outline" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  const isDraftReady =
    draft.name.trim() !== "" &&
    draft.description.trim().length >= DESCRIPTION_MIN;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground text-sm">
        A sheet&rsquo;s description is prepended, word for word, to every
        illustration prompt that character appears in. That repetition is the
        only thing that makes the same rabbit recognisable on page 3 and page 7
        — an image model remembers nothing between pictures. Write the colours,
        the size, the clothing and whatever makes them unmistakable.
      </p>

      <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-card p-4">
        <h3 className="font-medium text-foreground text-sm">
          Save a story&rsquo;s cast
        </h3>
        <p className="text-muted-foreground text-sm">
          A story generation describes its characters but does not keep them, so
          a rejected story leaves nothing behind. Paste its job id to keep the
          cast. A character whose sheet already exists is left exactly as it is.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="character-job-id">Story generation job id</Label>
            <Input
              id="character-job-id"
              className="w-80 font-mono"
              value={jobId}
              spellCheck={false}
              onChange={(event) => setJobId(event.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={isBusy || jobId.trim() === ""}
            onClick={() => void handleImport()}
          >
            Save as character sheets
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-card p-4">
        <h3 className="font-medium text-foreground text-sm">Add a character</h3>

        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="character-name">Name</Label>
            <Input
              id="character-name"
              className="w-56"
              value={draft.name}
              aria-describedby="character-name-hint"
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
            <p
              id="character-name-hint"
              className="text-muted-foreground text-xs"
            >
              Exactly as it appears in the story text and picture briefs.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="character-world">World</Label>
            <Select
              id="character-world"
              className="w-56"
              value={draft.worldId}
              aria-describedby="character-world-hint"
              onChange={(event) =>
                setDraft({ ...draft, worldId: event.target.value })
              }
            >
              <option value="">Every world</option>
              {worlds.map((world) => (
                <option key={world.id} value={world.id}>
                  {world.name}
                </option>
              ))}
            </Select>
            <p
              id="character-world-hint"
              className="text-muted-foreground text-xs"
            >
              &ldquo;Every world&rdquo; for a figure who recurs across them — a
              narrator, a child.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="character-description">Visual description</Label>
          <Textarea
            id="character-description"
            rows={3}
            value={draft.description}
            placeholder="A small white rabbit with one grey ear, wearing a red scarf, knee-high to a child."
            aria-describedby="character-description-hint"
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
          />
          <p
            id="character-description-hint"
            className="text-muted-foreground text-xs"
          >
            At least {DESCRIPTION_MIN} characters. &ldquo;A rabbit&rdquo; gives
            the model nothing to be consistent about.
          </p>
        </div>

        <div>
          <Button
            type="button"
            disabled={isBusy || !isDraftReady}
            onClick={() => void handleCreate()}
          >
            Save character
          </Button>
        </div>
      </section>

      {notice ? (
        <p
          role="status"
          className="rounded-[var(--radius)] border border-border bg-muted px-3 py-2 text-foreground text-sm"
        >
          {notice}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius)] border border-destructive bg-destructive/10 px-3 py-2 text-destructive text-sm"
        >
          {error}
        </p>
      ) : null}

      {status === "loading" ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : sheets.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No characters yet. Until there is one, every generated illustration is
          drawn from its page brief alone — which is how the same rabbit comes
          back looking different.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sheets.map((sheet) => (
            <li
              key={sheet.id}
              className="flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-card p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-card-foreground text-sm">
                  {sheet.name}
                </span>
                <span className="font-mono text-muted-foreground text-xs">
                  {sheet.slug} ·{" "}
                  {sheet.worldId === null
                    ? "every world"
                    : (worlds.find((world) => world.id === sheet.worldId)
                        ?.name ?? "unknown world")}
                </span>
              </div>

              {editingId === sheet.id ? (
                <>
                  <Textarea
                    aria-label={`Visual description for ${sheet.name}`}
                    rows={3}
                    value={editingText}
                    onChange={(event) => setEditingText(event.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        isBusy || editingText.trim().length < DESCRIPTION_MIN
                      }
                      onClick={() => void handleSaveEdit(sheet)}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(undefined)}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground text-sm">
                    {sheet.description}
                  </p>
                  <div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setNotice(undefined);
                        setError(undefined);
                        setEditingId(sheet.id);
                        setEditingText(sheet.description);
                      }}
                    >
                      Rewrite description
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
