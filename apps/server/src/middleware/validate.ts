import type { RequestHandler, Response } from "express";
import type { ZodTypeAny } from "zod";

type ValidationSchemas = {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
};

/**
 * Key under which `validate({ query })` stashes the parsed query string.
 * Express 5 exposes `req.query` as a getter with no setter, so parsed values
 * cannot be written back onto the request the way `body` and `params` can.
 */
const VALIDATED_QUERY = "validatedQuery";

/**
 * Validates the request at the route boundary. On success the parsed (typed,
 * unknown-key-stripped) values replace `req.body` and `req.params`; the parsed
 * query is available via `validatedQuery(res)`. On failure the `ZodError` is
 * forwarded to the error handler, which returns a 400 `VALIDATION_FAILED`
 * envelope — the request never reaches the service layer.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        res.locals[VALIDATED_QUERY] = schemas.query.parse(req.query);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Reads the query values parsed by `validate({ query })`. Call it only on
 * routes that ran that middleware — the schema type is supplied by the caller.
 */
export function validatedQuery<TQuery>(res: Response): TQuery {
  // `res.locals` is typed `Record<string, any>` by @types/express, so this cast
  // narrows an external-library boundary. The value was written by `validate`
  // after a successful parse of the schema the caller is naming here.
  return res.locals[VALIDATED_QUERY] as TQuery;
}

/** The same read, for a helper that cannot see its own route's middleware. */
export function optionalValidatedQuery<TQuery>(
  res: Response,
): TQuery | undefined {
  // Same external-library boundary as `validatedQuery`, minus its promise that
  // the middleware ran.
  return res.locals[VALIDATED_QUERY] as TQuery | undefined;
}
