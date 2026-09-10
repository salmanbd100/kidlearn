/** Parental-PIN hashing (FR-AUTH-04). */
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
