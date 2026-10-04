import express, { type Express } from "express";
import { describe, expect, it } from "vitest";
import { ApiError } from "../errors/errors.js";
import request from "../testing/request.js";
import { errorHandler, notFoundHandler } from "./error-handler.js";

function buildTestApp(): Express {
  const app = express();
  app.use(express.json());

  app.get("/not-found", () => {
    throw ApiError.notFound("Lesson not found");
  });
  app.get("/conflict", () => {
    throw ApiError.conflict("A child with that name already exists");
  });
  app.get("/forbidden", () => {
    throw ApiError.forbidden();
  });
  app.get("/with-details", () => {
    throw new ApiError(401, "UNAUTHORIZED", "Sign in required", {
      attemptsLeft: 2,
    });
  });
  app.get("/boom", () => {
    throw new Error("boom");
  });
  app.get("/async-boom", async () => {
    await Promise.resolve();
    throw new Error("boom");
  });

  app.post("/echo", (req, res) => {
    res.json({ data: req.body });
  });
  app.get("/after-headers", (_req, res, next) => {
    res.write("partial");
    next(new Error("late failure"));
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildTestApp();

describe("notFoundHandler", () => {
  it("returns a 404 envelope for an unmatched route", async () => {
    const res = await request(app).get("/nothing-here");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });
});

describe("errorHandler with an ApiError", () => {
  it("maps ApiError.notFound to a 404 envelope", async () => {
    const res = await request(app).get("/not-found");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "NOT_FOUND", message: "Lesson not found" },
    });
  });

  it("maps ApiError.conflict to a 409 envelope", async () => {
    const res = await request(app).get("/conflict");

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("maps ApiError.forbidden to a 403 envelope", async () => {
    const res = await request(app).get("/forbidden");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("includes details when the error carries them", async () => {
    const res = await request(app).get("/with-details");

    expect(res.status).toBe(401);
    expect(res.body.error.details).toEqual({ attemptsLeft: 2 });
  });
});

describe("errorHandler with a body the parser rejected", () => {
  it("answers 400 VALIDATION_FAILED for malformed JSON, not a 500", async () => {
    const res = await request(app)
      .post("/echo")
      .set("Content-Type", "application/json")
      .send("{bad");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("answers 413 for a body over the limit, not a 500", async () => {
    const res = await request(app)
      .post("/echo")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ filler: "x".repeat(200_000) }));

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("errorHandler once the response has started", () => {
  it("hands over to Express rather than throwing a second error", async () => {
    // `res.json` after `res.write` would throw ERR_HTTP_HEADERS_SENT inside the
    // handler. The request ends without a JSON envelope instead.
    const res = await request(app)
      .get("/after-headers")
      .catch((error: unknown) => error);

    expect(JSON.stringify(res)).not.toContain("INTERNAL");
  });
});

describe("errorHandler with an unexpected error", () => {
  it("returns a generic 500 envelope that never leaks the message", async () => {
    const res = await request(app).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: "INTERNAL", message: "Something went wrong" },
    });
    expect(JSON.stringify(res.body)).not.toContain("boom");
    expect(res.text).not.toContain("boom");
  });

  it("catches errors thrown from an async handler", async () => {
    const res = await request(app).get("/async-boom");

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL");
    expect(res.text).not.toContain("boom");
  });
});
