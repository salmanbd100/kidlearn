import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ROUTES } from "@/features/admin/admin-routes";
import MissingAdminPage from "./[...missing]/page";
import AdminError from "./error";
import AdminNotFound from "./not-found";

describe("(admin) boundaries", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("offers a retry when a CMS screen throws", () => {
    const reset = vi.fn();
    render(<AdminError error={new Error("boom")} reset={reset} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("links an unknown CMS URL back into the CMS", () => {
    render(<AdminNotFound />);

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      ADMIN_ROUTES.analytics,
    );
  });

  it("answers an unknown /admin/* URL with the CMS's own 404", () => {
    expect(() => MissingAdminPage()).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});
