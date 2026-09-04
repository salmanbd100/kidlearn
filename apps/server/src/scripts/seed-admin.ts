import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { AdminUser } from "@kidlearn/db";
import { z } from "zod";
import { ADMIN_MIN_PASSWORD_LENGTH, auth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";

// Creates or refreshes an administrator (file 31, spec §4.3).

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
  /** False when the run only refreshed an existing admin, which is the idempotent path. */
  isCreated: boolean;
}

/**
 * Idempotent: running twice with the same email leaves exactly one `AdminUser`
 * row and one `credential` account, with the password set to whatever was passed
 * the last time.
 */
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
  // better-auth lower-cases every email it stores, so the lookup has to as well
  // or a capitalised `ADMIN_EMAIL` would create a second user on every run.
  const normalisedEmail = email.toLowerCase();
  const hash = await ctx.password.hash(password);

  const existing = await ctx.internalAdapter.findUserByEmail(normalisedEmail);

  let authUserId: string;
  if (existing) {
    authUserId = existing.user.id;
    const hasCredential = existing.accounts.some(
      (account) => account.providerId === "credential",
    );
    if (hasCredential) {
      await ctx.internalAdapter.updatePassword(authUserId, hash);
    } else {
      // A `User` row that exists without a credential account — e.g. one created
      // by an earlier run that failed between the two writes. Link one rather
      // than leaving an account that can never sign in.
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
      // No verification email is ever sent to an internal account, and an
      // unverified one could be refused by a future `requireEmailVerification`.
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
    // `authUserId` is re-asserted on every run, which is what repairs a row left
    // unlinked by `ON DELETE SET NULL` after an identity was deleted.
    update: { authUserId, name },
    create: { email: normalisedEmail, name, authUserId },
  });

  return { admin, isCreated: before === null };
}

/** `pnpm --filter server seed:admin`. */
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
