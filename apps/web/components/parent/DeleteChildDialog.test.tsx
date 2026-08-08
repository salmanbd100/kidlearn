import type { ChildProfileResponse } from "@kidlearn/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import type { ApiResult } from "@/lib/api-client";
import { resetI18nForTests } from "@/lib/i18n";
import { DeleteChildDialog } from "./DeleteChildDialog";

const CHILD: ChildProfileResponse = {
  id: "child_1",
  firstName: "Ayaan",
  age: 4,
  gradeLevel: "NURSERY",
  preferredLanguage: "en",
  avatarCharacterId: "char_lion",
  createdAt: "2026-07-01T00:00:00.000Z",
  stats: { stars: 0, coins: 0, badges: 0, currentStreak: 0 },
};

const deleted: ApiResult<{ deleted: true }> = {
  ok: true,
  data: { deleted: true },
};

function renderDialog({
  onConfirm = vi.fn(async () => deleted),
  onDeleted = vi.fn(),
  onOpenChange = vi.fn(),
} = {}) {
  render(
    <Providers locale="en">
      <DeleteChildDialog
        child={CHILD}
        isOpen
        onOpenChange={onOpenChange}
        onConfirm={onConfirm as never}
        onDeleted={onDeleted}
      />
    </Providers>,
  );
  return { onConfirm, onDeleted, onOpenChange };
}

function confirmButton() {
  return screen.getByRole("button", { name: "Delete profile" });
}

function typeConfirmation(value: string) {
  fireEvent.change(screen.getByLabelText("Type Ayaan to confirm"), {
    target: { value },
  });
}

describe("DeleteChildDialog", () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  it("names what will be lost, not just the profile", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      "This removes Ayaan's profile and all of their progress, stars and badges. It cannot be undone.",
    );
  });

  it("keeps deletion disabled until the name is typed", () => {
    renderDialog();

    // Nothing destructive one tap away, on a device a four-year-old also holds
    // (design.md §1.2).
    expect(confirmButton()).toBeDisabled();

    typeConfirmation("Ayaan");

    expect(confirmButton()).toBeEnabled();
  });

  it("does not accept a near miss", () => {
    renderDialog();

    typeConfirmation("Ayan");
    expect(confirmButton()).toBeDisabled();

    typeConfirmation("ayaan");
    expect(confirmButton()).toBeDisabled();
  });

  it("accepts the name with stray whitespace around it", () => {
    renderDialog();

    // A mobile keyboard's trailing space is not a different name.
    typeConfirmation("  Ayaan ");

    expect(confirmButton()).toBeEnabled();
  });

  it("deletes the profile by id and reports back", async () => {
    const { onConfirm, onDeleted } = renderDialog();

    typeConfirmation("Ayaan");
    fireEvent.click(confirmButton());

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("child_1"));
    expect(onDeleted).toHaveBeenCalledOnce();
  });

  it("shows a localized message when the deletion fails", async () => {
    const onConfirm = vi.fn(
      async (): Promise<ApiResult<{ deleted: true }>> => ({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Child profile not found",
          status: 404,
        },
      }),
    );
    const { onDeleted } = renderDialog({ onConfirm });

    typeConfirmation("Ayaan");
    fireEvent.click(confirmButton());

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "That profile no longer exists.",
      ),
    );
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("closes without deleting when the parent keeps the profile", () => {
    const { onConfirm, onOpenChange } = renderDialog();

    typeConfirmation("Ayaan");
    fireEvent.click(screen.getByRole("button", { name: "Keep profile" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("asks in Bangla when that is the interface language", () => {
    render(
      <Providers locale="bn">
        <DeleteChildDialog
          child={CHILD}
          isOpen
          onOpenChange={vi.fn()}
          onConfirm={async () => deleted}
          onDeleted={vi.fn()}
        />
      </Providers>,
    );

    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Ayaan-এর প্রোফাইল মুছে ফেলবেন?",
    );
    expect(screen.getByRole("button", { name: "প্রোফাইল মুছুন" })).toBeDisabled();
  });
});
