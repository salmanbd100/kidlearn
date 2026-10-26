import { describe, expect, it } from "vitest";
import { createAccessToken } from "../modules/admin/access-tokens/access-tokens.service.js";
import { seedAdmin } from "../scripts/seed-admin.js";
import { auth } from "./auth.js";
import { prisma } from "./prisma.js";

// The revocation runs in better-auth's own hooks against real session and token rows, which a Prisma stub cannot prove.

const EMAIL = "rotate@example.test";
const OLD_PASSWORD = "old-password-123";
const NEW_PASSWORD = "new-password-456";

async function signIn(): Promise<Headers> {
  const { headers } = await auth.api.signInEmail({
    body: { email: EMAIL, password: OLD_PASSWORD },
    returnHeaders: true,
  });
  const cookie = headers.get("set-cookie")?.split(";")[0] ?? "";
  return new Headers({ cookie });
}

describe("POST /api/auth/change-password", () => {
  it("revokes every other session and every MCP access token", async () => {
    const { admin } = await seedAdmin({
      email: EMAIL,
      password: OLD_PASSWORD,
      name: "Rotating Admin",
    });
    const authUserId = admin.authUserId ?? "";
    const otherDevice = await signIn();
    const caller = await signIn();
    const { token } = await createAccessToken(admin.id, {
      name: "Claude Desktop",
      expiresInDays: 7,
    });

    // Without the opt-in a client sends by default, better-auth would leave other sessions alive.
    await auth.api.changePassword({
      body: { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD },
      headers: caller,
    });

    expect(await auth.api.getSession({ headers: otherDevice })).toBeNull();
    expect(await auth.api.getSession({ headers: caller })).toBeNull();
    expect(await prisma.session.count({ where: { userId: authUserId } })).toBe(
      1,
    );
    const row = await prisma.adminAccessToken.findUniqueOrThrow({
      where: { id: token.id },
    });
    expect(row.revokedAt).not.toBeNull();
  });
});
