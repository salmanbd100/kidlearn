/**
 * Parental-PIN hashing (FR-AUTH-04).
 *
 * argon2id, not bcrypt: a 4-digit PIN has only 10,000 possible values, so the
 * only real defence against an attacker who has stolen the `pinHash` column is
 * a memory-hard KDF. argon2id also resists the GPU attack bcrypt does not.
 * (The 5-attempt lockout in `parentSecurityService` covers the online case.)
 *
 * Raw PINs never leave this module: they are not logged, not returned, and not
 * stored — only the digest reaches the database.
 */
import argon2 from "argon2";

export function hashPin(pin: string): Promise<string> {
  return argon2.hash(pin, { type: argon2.argon2id });
}

export async function verifyPin(hash: string, pin: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, pin);
  } catch {
    // `argon2.verify` throws when the stored value is not a digest it can parse
    // (a corrupted or hand-edited column). Fail closed — a malformed hash must
    // never authenticate, and it must not surface as a 500 either.
    return false;
  }
}
