import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { AdminUser } from "@kidlearn/db";
import { z } from "zod";
import { ADMIN_MIN_PASSWORD_LENGTH, auth } from "../config/auth.js";
import { prisma } from "../config/prisma.js";

const SeedEnvSchema = z.object({
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(ADMIN_MIN_PASSWORD_LENGTH),
  ADMIN_NAME: z.string().min(1),
});

export interface SeedAdminOptions {
  email: string;
  password: string;
  name: string;
}

export interface SeedAdminResult {
  admin: AdminUser;
  isCreated: boolean;
}

export async function seedAdmin({
  email,
  password,
  name,
}: SeedAdminOptions): Promise<SeedAdminResult> {
  if (password.length < ADMIN_MIN_PASSWORD_LENGTH) {
    throw new Error(
      `ADMIN_PASSWORD must be at least ${ADMIN_MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  const ctx = await auth.$context;
  // better-auth lower-cases stored emails; without this a capitalised `ADMIN_EMAIL` creates a second user each run.
  const normalisedEmail = email.toLowerCase();
  const hash = await ctx.password.hash(password);

  const existing = await ctx.internalAdapter.findUserByEmail(normalisedEmail);

  let authUserId: string;
  if (existing) {
    // Parents sign in with Google, admins with a password; a credential plus `AdminUser` on a Google identity would pass both guards.
    if (
      existing.accounts.some((account) => account.providerId !== "credential")
    ) {
      throw new Error(
        `${normalisedEmail} already belongs to a Google sign-in. Admin accounts must use a separate email from any parent account.`,
      );
    }

    authUserId = existing.user.id;
    const hasCredential = existing.accounts.some(
      (account) => account.providerId === "credential",
    );
    if (hasCredential) {
      await ctx.internalAdapter.updatePassword(authUserId, hash);
    } else {
      // A `User` without a credential account (earlier run failed between writes): link it rather than leave it unable to sign in.
      await ctx.internalAdapter.linkAccount({
        userId: authUserId,
        providerId: "credential",
        accountId: authUserId,
        password: hash,
      });
    }
  } else {
    const created = await ctx.internalAdapter.createUser({
      email: normalisedEmail,
      name,
      // No verification email is sent to an internal account, and a future `requireEmailVerification` could refuse it.
      emailVerified: true,
    });
    authUserId = created.id;
    await ctx.internalAdapter.linkAccount({
      userId: authUserId,
      providerId: "credential",
      accountId: authUserId,
      password: hash,
    });
  }

  const before = await prisma.adminUser.findUnique({
    where: { email: normalisedEmail },
  });

  const admin = await prisma.adminUser.upsert({
    where: { email: normalisedEmail },
    // Re-asserted every run to repair a row left unlinked by `ON DELETE SET NULL`.
    update: { authUserId, name },
    create: { email: normalisedEmail, name, authUserId },
  });

  return { admin, isCreated: before === null };
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (isDirectRun) {
  const parsed = SeedEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("Cannot seed an admin. Fix these variables:");
    for (const [key, messages] of Object.entries(
      parsed.error.flatten().fieldErrors,
    )) {
      console.error(`  - ${key}: ${messages?.join(", ")}`);
    }
    process.exit(1);
  }

  try {
    const { admin, isCreated } = await seedAdmin({
      email: parsed.data.ADMIN_EMAIL,
      password: parsed.data.ADMIN_PASSWORD,
      name: parsed.data.ADMIN_NAME,
    });
    console.log(
      `${isCreated ? "Created" : "Updated"} admin ${admin.email} (${admin.id}).`,
    );
  } catch (error) {
    console.error("Failed to seed admin:", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
