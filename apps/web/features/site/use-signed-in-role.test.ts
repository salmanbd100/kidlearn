import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const parentApi = vi.hoisted(() => ({ fetchAuthMe: vi.fn() }));
const adminApi = vi.hoisted(() => ({ fetchAdminMe: vi.fn() }));

vi.mock("@/features/parent/parent-api", () => parentApi);
vi.mock("@/features/admin/admin-api", () => adminApi);

const { useSignedInRole } = await import("./use-signed-in-role");

function failure(status: number | undefined) {
  return {
    ok: false,
    error: { code: "FORBIDDEN", message: "no", status },
  };
}

beforeEach(() => {
  parentApi.fetchAuthMe.mockReset();
  adminApi.fetchAdminMe.mockReset();
});

describe("useSignedInRole", () => {
  it("starts unknown, so the page renders before the probe settles", () => {
    parentApi.fetchAuthMe.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSignedInRole());

    expect(result.current).toBe("unknown");
  });

  it("reports a parent without asking the admin endpoint", async () => {
    parentApi.fetchAuthMe.mockResolvedValue({ ok: true, data: {} });

    const { result } = renderHook(() => useSignedInRole());

    await waitFor(() => expect(result.current).toBe("parent"));
    expect(adminApi.fetchAdminMe).not.toHaveBeenCalled();
  });

  it("reports signed out on a 401, with one request", async () => {
    parentApi.fetchAuthMe.mockResolvedValue(failure(401));

    const { result } = renderHook(() => useSignedInRole());

    await waitFor(() => expect(result.current).toBe("signedOut"));
    expect(adminApi.fetchAdminMe).not.toHaveBeenCalled();
  });

  it("asks the admin endpoint when the parent one refuses with a 403", async () => {
    parentApi.fetchAuthMe.mockResolvedValue(failure(403));
    adminApi.fetchAdminMe.mockResolvedValue({ ok: true, data: {} });

    const { result } = renderHook(() => useSignedInRole());

    await waitFor(() => expect(result.current).toBe("admin"));
  });

  it("treats a session neither endpoint accepts as signed out", async () => {
    parentApi.fetchAuthMe.mockResolvedValue(failure(403));
    adminApi.fetchAdminMe.mockResolvedValue(failure(403));

    const { result } = renderHook(() => useSignedInRole());

    await waitFor(() => expect(result.current).toBe("signedOut"));
  });

  it("stays unknown when the API cannot be reached", async () => {
    parentApi.fetchAuthMe.mockResolvedValue(failure(undefined));

    const { result } = renderHook(() => useSignedInRole());

    await waitFor(() => expect(parentApi.fetchAuthMe).toHaveBeenCalled());
    expect(result.current).toBe("unknown");
  });

  it("asks once, without the default retries, so a cold API does not hold the page for a minute", async () => {
    parentApi.fetchAuthMe.mockResolvedValue(failure(401));

    renderHook(() => useSignedInRole());

    await waitFor(() =>
      expect(parentApi.fetchAuthMe).toHaveBeenCalledWith(
        expect.objectContaining({ retries: 0 }),
      ),
    );
  });

  it("treats an admin endpoint that refuses the cookie as signed out", async () => {
    parentApi.fetchAuthMe.mockResolvedValue(failure(403));
    adminApi.fetchAdminMe.mockResolvedValue(failure(401));

    const { result } = renderHook(() => useSignedInRole());

    await waitFor(() => expect(result.current).toBe("signedOut"));
  });

  it("stays unknown when the admin endpoint cannot be reached", async () => {
    parentApi.fetchAuthMe.mockResolvedValue(failure(403));
    adminApi.fetchAdminMe.mockResolvedValue(failure(undefined));

    const { result } = renderHook(() => useSignedInRole());

    await waitFor(() => expect(adminApi.fetchAdminMe).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toBe("unknown");
  });
});
