/** COPPA consent (FR-AUTH-03). */
import type { Parent } from "@kidlearn/db";
import { CONSENT_VERSION } from "@kidlearn/types";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

export type ConsentRecord = {
  consentGivenAt: Date;
  consentVersion: string;
};

/**
 * Records COPPA consent (FR-AUTH-03, NFR-SAFE-03). Idempotent: re-posting the
 * current version refreshes the timestamp, which is the honest record of the
 * last time the parent actively agreed.
 */
export async function recordParentConsent(
  parent: Parent,
  version: string,
): Promise<ConsentRecord> {
  if (version !== CONSENT_VERSION) {
    throw ApiError.conflict("consent version outdated", {
      currentVersion: CONSENT_VERSION,
    });
  }

  const consentGivenAt = new Date();
  await prisma.parent.update({
    where: { id: parent.id },
    data: { consentGivenAt, consentVersion: CONSENT_VERSION },
  });

  return { consentGivenAt, consentVersion: CONSENT_VERSION };
}
