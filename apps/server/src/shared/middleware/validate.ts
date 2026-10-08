import type { RequestHandler, Response } from "express";
import type { ZodTypeAny } from "zod";

type ValidationSchemas = {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
};

/** Express 5 `req.query` is a getter with no setter, so parsed query values are stashed on `res.locals` under this key. */
const VALIDATED_QUERY = "validatedQuery";

/** On failure the `ZodError` goes to the error handler (400 `VALIDATION_FAILED`); the request never reaches the service layer. */
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

export function validatedQuery<TQuery>(res: Response): TQuery {
  // `res.locals` is `Record<string, any>`; this cast narrows it to the schema `validate` parsed.
  return res.locals[VALIDATED_QUERY] as TQuery;
}

export function optionalValidatedQuery<TQuery>(
  res: Response,
): TQuery | undefined {
  // Same boundary as `validatedQuery`, without its promise that the middleware ran.
  return res.locals[VALIDATED_QUERY] as TQuery | undefined;
}
