// `unstable_doesMiddlewareMatch`, not the `unstable_doesProxyMatch` the v16
// docs name: the rename landed in the documentation ahead of the build, and
// 16.2.9's dist/experimental/testing/server still exports only the old name.
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `DEV_SITE_BASIC_AUTH` is read at module scope, so each case has to load a
 * fresh copy of the module after setting it.
 */
async function proxyWith(
  credential: string | undefined,
  headers: HeadersInit = {},
) {
  vi.resetModules();
  if (credential === undefined) {
    vi.stubEnv("DEV_SITE_BASIC_AUTH", undefined);
  } else {
    vi.stubEnv("DEV_SITE_BASIC_AUTH", credential);
  }
  const { proxy } = await import("./proxy");
  return proxy(new NextRequest("https://dev.kidlearn.net/parent", { headers }));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("dev site basic auth", () => {
  it("challenges an unauthenticated request when the credential is set", async () => {
    const res = await proxyWith("dev:hunter2");

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(
      'Basic realm="kidlearn dev"',
    );
  });

  it("passes a request carrying the matching credential", async () => {
    const res = await proxyWith("dev:hunter2", {
      authorization: `Basic ${btoa("dev:hunter2")}`,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("www-authenticate")).toBeNull();
  });

  it("challenges a request carrying the wrong credential", async () => {
    const res = await proxyWith("dev:hunter2", {
      authorization: `Basic ${btoa("dev:wrong")}`,
    });

    expect(res.status).toBe(401);
  });

  it("does not gate production, where the credential is unset", async () => {
    const res = await proxyWith(undefined);

    expect(res.status).toBe(200);
    expect(res.headers.get("www-authenticate")).toBeNull();
  });
});

/**
 * The cases above call `proxy()` directly, so they all still pass if the matcher
 * stops matching anything — which would un-gate the whole dev site silently.
 * These go through Next's own matching instead.
 */
describe("the paths the gate covers", () => {
  async function matches(url: string) {
    const { config } = await import("./proxy");
    return unstable_doesMiddlewareMatch({ config, url });
  }

  it.each([
    "/",
    "/parent",
    "/select-profile",
    "/world/1",
  ])("runs on %s", async (url) => {
    expect(await matches(url)).toBe(true);
  });

  it.each([
    "/_next/static/chunks/main.js",
    "/_next/image",
    "/favicon.ico",
  ])("does not run on %s", async (url) => {
    expect(await matches(url)).toBe(false);
  });
});
