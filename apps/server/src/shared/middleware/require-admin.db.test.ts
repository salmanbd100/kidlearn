import { handleOAuthUserInfo } from "better-auth/oauth2";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../../app.js";
import { auth } from "../../config/auth.js";
import { prisma } from "../../config/prisma.js";
import { seedAdmin } from "../../scripts/seed-admin.js";
import request from "../testing/request.js";

const ADMIN_EMAIL = "reviewer@kidlearn.test";

type OAuthContext = Parameters<typeof handleOAuthUserInfo>[0];
type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/** The step better-auth's `/callback/google` runs once Google has vouched for the profile. */
async function googleSignIn(email: string) {
  // The callback hands this its full endpoint context; the handler reads only `context` on this path.
  const c = { context: await auth.$context } as unknown as OAuthContext;
  return handleOAuthUserInfo(c, {
    userInfo: {
      id: "google-sub-1",
      email,
      emailVerified: true,
      name: "Somebody Else",
    },
    account: { providerId: "google", accountId: "google-sub-1" },
    callbackURL: "/parent",
  });
}

/** Real rows behind the session; only the cookie lookup is skipped. */
function signedInAs(
  user: AuthSession["user"],
  session: AuthSession["session"],
) {
  vi.spyOn(auth.api, "getSession").mockResolvedValue({ user, session });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a Google sign-in on the admin's email", () => {
  it("is not linked onto the admin user, so it gets no session at all", async () => {
    const { admin } = await seedAdmin({
      email: ADMIN_EMAIL,
      password: "a-long-enough-admin-password",
      name: "Reviewer",
    });

    const result = await googleSignIn(ADMIN_EMAIL);

    expect(result.data).toBeNull();
    expect(result.error).toBe("account not linked");
    expect(
      await prisma.account.findMany({
        where: { userId: admin.authUserId ?? "" },
        select: { providerId: true },
      }),
    ).toEqual([{ providerId: "credential" }]);
    expect(
      await prisma.session.count({ where: { userId: admin.authUserId ?? "" } }),
    ).toBe(0);
  });
});

describe("requireAdmin against Postgres", () => {
  async function adminSession() {
    const { admin } = await seedAdmin({
      email: ADMIN_EMAIL,
      password: "a-long-enough-admin-password",
      name: "Reviewer",
    });
    const ctx = await auth.$context;
    const userId = admin.authUserId ?? "";
    const user = await ctx.internalAdapter.findUserById(userId);
    const session = await ctx.internalAdapter.createSession(userId);
    if (!user) throw new Error("seeded admin has no user row");
    return { userId, user, session };
  }

  it("admits a password-only admin", async () => {
    const { user, session } = await adminSession();
    signedInAs(user, session);

    const res = await request(app).get("/api/admin/me");

    expect(res.status).toBe(200);
  });

  it("refuses an admin user that also carries a Google account, linked before linking was disabled", async () => {
    const { userId, user, session } = await adminSession();
    await prisma.account.create({
      data: {
        id: "account-google-1",
        userId,
        providerId: "google",
        accountId: "google-sub-1",
      },
    });
    signedInAs(user, session);

    const res = await request(app).get("/api/admin/me");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});
