import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { env } from "../../config/env.js";
import { ApiError } from "../errors/errors.js";

export const requireCronSecret: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const header = req.get("authorization") ?? "";
  // RFC 7235 makes `auth-scheme` case-insensitive; a `bearer` scheduler would otherwise get a 401 like a wrong secret. The credential stays byte-exact.
  const separator = header.indexOf(" ");
  const scheme =
    separator === -1 ? "" : header.slice(0, separator).toLowerCase();

  if (scheme !== "bearer" || !isSecret(header.slice(separator + 1))) {
    next(ApiError.unauthorized("A valid job secret is required"));
    return;
  }

  next();
};

/** Constant-time, so timing cannot narrow a wrong secret. `timingSafeEqual` throws on length mismatch, so lengths are compared first (leaking only length). */
function isSecret(candidate: string): boolean {
  const expected = Buffer.from(env.CRON_SECRET, "utf8");
  const received = Buffer.from(candidate, "utf8");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}
