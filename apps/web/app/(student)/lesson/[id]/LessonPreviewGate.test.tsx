import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";

// Who `?preview=1` actually gets the preview (file 33, FR-CMS-04).

const LESSON_ID = "33333333-3333-4333-8333-333333333333";

const admin = vi.hoisted(() => ({ fetchAdminMe: vi.fn() }));
vi.mock("@/lib/admin-api", () => admin);

const player = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("@/components/lesson/LessonPlayer", () => ({
  LessonPlayer: (props: Record<string, unknown>) => {
    player.render(props);
    return <p>player</p>;
  },
}));

const guard = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("../../StudentGuard", async () => {
  const actual =
    await vi.importActual<typeof import("../../StudentGuard")>(
      "../../StudentGuard",
    );
  return {
    ...actual,
    StudentGuard: ({ children }: { children: React.ReactNode }) => {
      guard.render();
      return <>{children}</>;
    },
  };
});

const { LessonPreviewGate } = await import("./LessonPreviewGate");

function renderGate() {
  return render(
    <Providers locale="en">
      <LessonPreviewGate lessonId={LESSON_ID} previewLanguage="en" />
    </Providers>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetI18nForTests();
});

describe("LessonPreviewGate", () => {
  it("previews for an admin the API confirms", async () => {
    admin.fetchAdminMe.mockResolvedValue({ ok: true, data: { role: "admin" } });

    renderGate();

    await waitFor(() => expect(player.render).toHaveBeenCalled());
    expect(player.render).toHaveBeenCalledWith(
      expect.objectContaining({ isPreview: true, previewLanguage: "en" }),
    );
    // An admin has no child profile, so the guard would bounce them to
    // `/select-profile` before the player mounted.
    expect(guard.render).not.toHaveBeenCalled();
  });

  it("gives a parent the ordinary recorded player, not the preview", async () => {
    // `/api/admin/me` answers 403 for a signed-in parent — the case that made
    // `?preview=1` a parental-controls bypass when the flag came from the URL.
    admin.fetchAdminMe.mockResolvedValue({
      ok: false,
      error: { code: "FORBIDDEN", message: "Not an admin" },
    });

    renderGate();

    await waitFor(() => expect(player.render).toHaveBeenCalled());
    expect(player.render).toHaveBeenCalledWith(
      expect.not.objectContaining({ isPreview: true }),
    );
    expect(guard.render).toHaveBeenCalled();
  });

  it("gives a signed-out visitor the guarded player too", async () => {
    admin.fetchAdminMe.mockResolvedValue({
      ok: false,
      error: { code: "UNAUTHENTICATED", message: "Sign in" },
    });

    renderGate();

    await waitFor(() => expect(guard.render).toHaveBeenCalled());
    expect(player.render).toHaveBeenCalledWith(
      expect.not.objectContaining({ isPreview: true }),
    );
  });

  it("renders no player at all until the answer lands", () => {
    // Starting in either mode and switching would record a step the preview
    // should not have, or drop one the child is owed.
    admin.fetchAdminMe.mockReturnValue(new Promise(() => {}));

    renderGate();

    expect(player.render).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
