import type {
  AvatarCharacterResponse,
  ChildProfileResponse,
} from "@kidlearn/types";
import { ChildProfileCreateSchema } from "@kidlearn/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { Providers } from "@/components/Providers";
import type { ApiResult } from "@/lib/api-client";
import { resetI18nForTests } from "@/lib/i18n";

const api = vi.hoisted(() => ({
  listAvatars: vi.fn(),
  listChildCharacters: vi.fn(),
}));

vi.mock("@/lib/parent-api", () => ({
  listAvatars: api.listAvatars,
  listChildCharacters: api.listChildCharacters,
}));

const { ChildProfileForm } = await import("./ChildProfileForm");

const AVATARS: AvatarCharacterResponse[] = [
  {
    id: "char_lion",
    slug: "leo-the-lion",
    name: "Leo the Lion",
    imageUrl: null,
  },
  {
    id: "char_owl",
    slug: "ollie-the-owl",
    name: "Ollie the Owl",
    imageUrl: null,
  },
];

function child(
  overrides: Partial<ChildProfileResponse> = {},
): ChildProfileResponse {
  return {
    id: "child_1",
    firstName: "Ayaan",
    age: 4,
    gradeLevel: "NURSERY",
    preferredLanguage: "en",
    avatarCharacterId: "char_lion",
    createdAt: "2026-07-01T00:00:00.000Z",
    stats: { stars: 0, coins: 0, badges: 0, currentStreak: 0 },
    ...overrides,
  };
}

function created(): ApiResult<ChildProfileResponse> {
  return { ok: true, data: child() };
}

/** What the form is handed as `onSubmit`, recording the payload it was given. */
type SubmitSpy = Mock<
  (values: unknown) => Promise<ApiResult<ChildProfileResponse>>
>;

async function renderForm({
  initial,
  onSubmit = vi.fn(async () => created()) as SubmitSpy,
  onSaved = vi.fn(),
}: {
  initial?: ChildProfileResponse;
  onSubmit?: SubmitSpy;
  onSaved?: (child: ChildProfileResponse) => void;
} = {}) {
  render(
    <Providers locale="en">
      <ChildProfileForm
        initial={initial}
        // The prop is typed to the schema's output; the test's stub is looser so
        // it can record whatever was passed.
        onSubmit={onSubmit as never}
        onSaved={onSaved}
        submitLabel="Create profile"
      />
    </Providers>,
  );
  // The avatar options arrive from the API, so nothing can be selected until they
  // have loaded.
  await waitFor(() =>
    expect(
      screen.getByRole("radio", { name: "Choose Leo the Lion" }),
    ).toBeInTheDocument(),
  );
  return { onSubmit, onSaved };
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Create profile" }));
}

function typeName(value: string) {
  fireEvent.change(screen.getByLabelText("First name"), {
    target: { value },
  });
}

function chooseAvatar(name: string) {
  fireEvent.click(screen.getByRole("radio", { name: `Choose ${name}` }));
}

describe("ChildProfileForm", () => {
  beforeEach(() => {
    resetI18nForTests();
    api.listAvatars.mockReset();
    api.listAvatars.mockResolvedValue({ ok: true, data: AVATARS });
    // The edit form reads the per-child list instead, because only that one
    // knows which earned characters this child may now wear (FR-GAM-05).
    api.listChildCharacters.mockReset();
    api.listChildCharacters.mockResolvedValue({
      ok: true,
      data: {
        characters: AVATARS.map((avatar) => ({
          ...avatar,
          isDefault: true,
          isUnlocked: true,
        })),
      },
    });
  });

  it("refuses to submit without a first name", async () => {
    const { onSubmit } = await renderForm();

    chooseAvatar("Leo the Lion");
    submit();

    await waitFor(() =>
      expect(
        screen.getByText("Please enter your child's first name."),
      ).toBeInTheDocument(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("refuses to submit without an avatar", async () => {
    const { onSubmit } = await renderForm();

    typeName("Ayaan");
    submit();

    await waitFor(() =>
      expect(screen.getByText("Please choose an avatar.")).toBeInTheDocument(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a name past the schema's length limit, quoting that limit", async () => {
    const { onSubmit } = await renderForm();

    // `maxLength` on the input stops a human at 50, but not a paste handler or a
    // pre-filled edit, so the schema is still the thing that decides.
    fireEvent.change(screen.getByLabelText("First name"), {
      target: { value: "a".repeat(51) },
    });
    chooseAvatar("Leo the Lion");
    submit();

    await waitFor(() =>
      expect(
        screen.getByText(
          "That name is too long — please use 50 characters or fewer.",
        ),
      ).toBeInTheDocument(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps age inside the 3–6 range the schema allows", async () => {
    await renderForm();

    const younger = screen.getByRole("button", { name: "Younger" });
    const older = screen.getByRole("button", { name: "Older" });

    // Starts at the floor, so there is nowhere down to go.
    expect(screen.getByText("3 years old")).toBeInTheDocument();
    expect(younger).toBeDisabled();

    fireEvent.click(older);
    fireEvent.click(older);
    fireEvent.click(older);
    expect(screen.getByText("6 years old")).toBeInTheDocument();
    // And nowhere up: a control that cannot express an illegal value beats one
    // that validates afterwards.
    expect(older).toBeDisabled();
  });

  it("submits a payload the shared schema accepts unchanged", async () => {
    const { onSubmit } = await renderForm();

    typeName("  Ayaan  ");
    fireEvent.click(screen.getByRole("button", { name: "Older" }));
    fireEvent.click(screen.getByRole("radio", { name: "KG-1" }));
    fireEvent.click(screen.getByRole("radio", { name: "বাংলা" }));
    chooseAvatar("Ollie the Owl");
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const [payload] = onSubmit.mock.calls[0];

    expect(payload).toEqual({
      // Trimmed by the schema, not by the form.
      firstName: "Ayaan",
      age: 4,
      gradeLevel: "KG1",
      preferredLanguage: "bn",
      avatarCharacterId: "char_owl",
    });
    // The real contract: whatever this form sends, the server's validator accepts.
    expect(ChildProfileCreateSchema.safeParse(payload).success).toBe(true);
  });

  it("offers only the two MVP grades — KG-2 is out of scope", async () => {
    await renderForm();

    expect(screen.getByRole("radio", { name: "Nursery" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "KG-1" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /KG-2/ })).toBeNull();
  });

  it("pre-fills every field from an existing profile", async () => {
    await renderForm({
      initial: child({
        firstName: "Nadia",
        age: 5,
        gradeLevel: "KG1",
        preferredLanguage: "bn",
        avatarCharacterId: "char_owl",
      }),
    });

    expect(screen.getByLabelText("First name")).toHaveValue("Nadia");
    expect(screen.getByText("5 years old")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "KG-1" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "বাংলা" })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Choose Ollie the Owl" }),
    ).toBeChecked();
  });

  /**
   * The avatar picker's two sources (FR-GAM-05). A new profile has nothing
   * unlocked to show, so creation reads the starter set; an existing one reads
   * its own list, which is the only one that knows what has been earned.
   */
  describe("where the avatars come from", () => {
    it("reads the starter set when creating a profile", async () => {
      await renderForm();

      expect(api.listAvatars).toHaveBeenCalledTimes(1);
      expect(api.listChildCharacters).not.toHaveBeenCalled();
    });

    it("reads this child's own list when editing", async () => {
      await renderForm({ initial: child() });

      expect(api.listChildCharacters).toHaveBeenCalledWith("child_1");
      expect(api.listAvatars).not.toHaveBeenCalled();
    });

    it("shows a locked character as an unselectable silhouette", async () => {
      api.listChildCharacters.mockResolvedValue({
        ok: true,
        data: {
          characters: [
            { ...AVATARS[0], isDefault: true, isUnlocked: true },
            {
              id: "char_monkey",
              slug: "mia-the-monkey",
              name: "Mia the Monkey",
              imageUrl: null,
              isDefault: false,
              isUnlocked: false,
            },
          ],
        },
      });

      await renderForm({ initial: child() });

      // Shown, not hidden — a picker listing only what a child already has
      // cannot show them what there is to earn.
      expect(
        screen.getByRole("button", {
          name: "Mia the Monkey — keep learning to unlock",
        }),
      ).toBeInTheDocument();
      // But not a choice: it is outside the radio group entirely, so a keyboard
      // user never arrows onto an option that refuses to take.
      expect(
        screen.queryByRole("radio", { name: "Choose Mia the Monkey" }),
      ).not.toBeInTheDocument();
    });

    it("plays a gentle line rather than an error when a locked one is tapped", async () => {
      api.listChildCharacters.mockResolvedValue({
        ok: true,
        data: {
          characters: [
            { ...AVATARS[0], isDefault: true, isUnlocked: true },
            {
              id: "char_monkey",
              slug: "mia-the-monkey",
              name: "Mia the Monkey",
              imageUrl: null,
              isDefault: false,
              isUnlocked: false,
            },
          ],
        },
      });
      const { onSubmit } = await renderForm({ initial: child() });

      fireEvent.click(
        screen.getByRole("button", {
          name: "Mia the Monkey — keep learning to unlock",
        }),
      );

      // No error text, no selection change, and nothing submitted: a locked
      // character is something to look forward to, not a mistake.
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: "Choose Leo the Lion" }),
      ).toBeChecked();
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it("clears a field's error as soon as the field changes", async () => {
    await renderForm();

    submit();
    await waitFor(() =>
      expect(
        screen.getByText("Please enter your child's first name."),
      ).toBeInTheDocument(),
    );

    typeName("A");

    expect(
      screen.queryByText("Please enter your child's first name."),
    ).toBeNull();
  });

  it("reports the five-profile cap when the server rejects the create", async () => {
    const onSubmit: SubmitSpy = vi.fn(
      async (): Promise<ApiResult<ChildProfileResponse>> => ({
        ok: false,
        // The cap arrives as a plain 409 CONFLICT, not a CHILD_LIMIT_REACHED code.
        error: {
          code: "CONFLICT",
          message: "Profile limit reached (5)",
          status: 409,
        },
      }),
    );
    await renderForm({ onSubmit });

    typeName("Ayaan");
    chooseAvatar("Leo the Lion");
    submit();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "You've reached the maximum of 5 children. Delete a profile to add another.",
      ),
    );
  });

  it("hands the saved profile back to its caller", async () => {
    const { onSaved } = await renderForm();

    typeName("Ayaan");
    chooseAvatar("Leo the Lion");
    submit();

    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith(
        expect.objectContaining({ id: "child_1" }),
      ),
    );
  });

  it("says so plainly when no avatar is available to choose", async () => {
    api.listAvatars.mockResolvedValue({ ok: true, data: [] });
    render(
      <Providers locale="en">
        <ChildProfileForm
          onSubmit={async () => created()}
          onSaved={vi.fn()}
          submitLabel="Create profile"
        />
      </Providers>,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "No avatars are available right now. Please try again in a moment.",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("keeps every control at the 44px parent touch minimum", async () => {
    await renderForm();

    expect(screen.getByLabelText("First name")).toHaveClass("h-11");
    expect(screen.getByRole("button", { name: "Older" })).toHaveClass(
      "size-11",
    );
  });
});
