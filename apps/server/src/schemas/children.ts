/**
 * Request schemas for `/api/children`.
 *
 * The bodies themselves live in `@kidlearn/types` and are re-exported here.
 *
 * They started out in this file, on the reasoning that `packages/types` is for
 * payloads a *second* consumer also parses. File 14 produced that second
 * consumer: the parent profile form runs `safeParse` against the same object this
 * router validates with, so a client-side limit cannot drift from the server's
 * (`backend.md §2`). This file stays the import path for `validate()` and the
 * OpenAPI document, so no other call site had to move.
 *
 * Only `ChildIdParamsSchema` is still declared here — a path-parameter shape is an
 * HTTP detail with no client half.
 */
import type { Language } from "@kidlearn/db";
import {
  ChildProfileCreateSchema,
  ChildProfileUpdateSchema,
} from "@kidlearn/types";
import { z } from "zod";

/**
 * Language mirror, checked rather than trusted.
 *
 * `@kidlearn/types` may not depend on `@kidlearn/db`, so the schema it exports
 * restates Prisma's `Language` by hand as `LOCALES`. Before file 14 this schema
 * was built from `z.nativeEnum(Language)` and so could not drift; now it can, and
 * these assignments make the drift a compile error rather than a wire-format
 * surprise. `paths/children.ts` carries the equivalent assertion for
 * `GradeLevel` against `GRADE_LEVELS`.
 *
 * Note the casing: this file's spec wrote `nursery | kg1 | kg2`, but the enum that
 * shipped in file 03 — and that `document/database-design.md §enums` documents —
 * is `NURSERY | KG1 | KG2`. The database wins, so the API speaks uppercase
 * grades. `Language` really is lowercase `en | bn`.
 */
type MirroredLanguage = z.infer<
  typeof ChildProfileCreateSchema
>["preferredLanguage"];

const _languageMirrorIsExhaustive: [
  Language extends MirroredLanguage ? true : never,
  MirroredLanguage extends Language ? true : never,
] = [true, true];
void _languageMirrorIsExhaustive;

export {
  ChildProfileCreateSchema as CreateChildBodySchema,
  ChildProfileUpdateSchema as UpdateChildBodySchema,
};

export const ChildIdParamsSchema = z.object({ id: z.string().min(1) });

export type CreateChildBody = z.infer<typeof ChildProfileCreateSchema>;
export type UpdateChildBody = z.infer<typeof ChildProfileUpdateSchema>;
