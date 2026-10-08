import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const activeChild = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/features/children/active-child", () => ({
  useActiveChild: () => ({
    ...activeChild.value,
    refresh: activeChild.refresh,
  }),
}));

const { StudentGuard } = await import("./StudentGuard");

const child = { id: "child_1", firstName: "Mim" };

function renderGuard(value: Record<string, unknown>) {
  activeChild.value = { isWakingUp: false, ...value };
  return render(
    <Providers locale="en">
      <StudentGuard>
        <p>student screen</p>
      </StudentGuard>
    </Providers>,
  );
}

describe("StudentGuard", () => {
  beforeEach(() => {
    resetI18nForTests();
    router.replace.mockReset();
    activeChild.refresh.mockReset();
  });

  it("shows the screen to a signed-in parent with a child selected", () => {
    renderGuard({ status: "ready", child });

    expect(screen.getByText("student screen")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("holds the screen back while the session loads", () => {
    renderGuard({ status: "loading", child: undefined });

    expect(screen.queryByText("student screen")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("sends a signed-out visitor to the bare parent sign-in page without showing the screen", () => {
    renderGuard({ status: "signedOut", child: undefined });

    expect(router.replace).toHaveBeenCalledWith("/parent/login");
    expect(screen.queryByText("student screen")).not.toBeInTheDocument();
  });

  it("sends a ready session with no child to the profile picker", () => {
    renderGuard({ status: "ready", child: undefined });

    expect(router.replace).toHaveBeenCalledWith("/select-profile");
    expect(screen.queryByText("student screen")).not.toBeInTheDocument();
  });

  it("sends a parent whose consent is outdated back to consent, ahead of the profile picker", () => {
    renderGuard({
      status: "ready",
      parent: { hasCurrentConsent: false },
      child: undefined,
    });

    expect(router.replace).toHaveBeenCalledWith("/parent/onboarding/consent");
    expect(screen.queryByText("student screen")).not.toBeInTheDocument();
  });

  it("pulls a child out of a screen once consent is found to be outdated", () => {
    const { rerender } = renderGuard({
      status: "ready",
      parent: { hasCurrentConsent: true },
      child,
    });
    expect(screen.getByText("student screen")).toBeInTheDocument();

    activeChild.value = {
      ...activeChild.value,
      parent: { hasCurrentConsent: false },
    };
    rerender(
      <Providers locale="en">
        <StudentGuard>
          <p>student screen</p>
        </StudentGuard>
      </Providers>,
    );

    expect(router.replace).toHaveBeenCalledWith("/parent/onboarding/consent");
    expect(screen.queryByText("student screen")).not.toBeInTheDocument();
  });

  it("never renders the screen when the session could not be read", () => {
    renderGuard({ status: "error", child });

    expect(screen.queryByText("student screen")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("lets a child retry from the error screen", () => {
    renderGuard({ status: "error", child: undefined });

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(activeChild.refresh).toHaveBeenCalledTimes(1);
  });
});
