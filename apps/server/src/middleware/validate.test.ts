import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorHandler } from "./error-handler.js";
import { validate, validatedQuery } from "./validate.js";

const CreateChildSchema = z.object({ name: z.string().min(1) });
const ChildParamsSchema = z.object({ id: z.string().uuid() });
const ListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
});

type ListQuery = z.infer<typeof ListQuerySchema>;

function buildTestApp(): Express {
  const app = express();
  app.use(express.json());

  app.post("/children", validate({ body: CreateChildSchema }), (req, res) => {
    res.status(201).json({ data: req.body });
  });
  app.get(
    "/children/:id",
    validate({ params: ChildParamsSchema }),
    (req, res) => {
      res.json({ data: { id: req.params.id } });
    },
  );
  app.get("/children", validate({ query: ListQuerySchema }), (_req, res) => {
    res.json({ data: validatedQuery<ListQuery>(res) });
  });

  app.use(errorHandler);
  return app;
}

const app = buildTestApp();

describe("validate({ body })", () => {
  it("passes a valid body through to the handler", async () => {
    const res = await request(app).post("/children").send({ name: "Ayaan" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { name: "Ayaan" } });
  });

  it("strips unknown keys from the body before the handler runs", async () => {
    const res = await request(app)
      .post("/children")
      .send({ name: "Ayaan", isAdmin: true });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ name: "Ayaan" });
  });

  it("returns a 400 VALIDATION_FAILED envelope with flattened issues", async () => {
    const res = await request(app).post("/children").send({ name: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.message).toBe("Invalid request");
    expect(res.body.error.details.fieldErrors.name).toBeDefined();
  });

  it("reports a missing required field", async () => {
    const res = await request(app).post("/children").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors.name).toBeDefined();
  });
});

describe("validate({ params })", () => {
  it("passes valid params through to the handler", async () => {
    const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    const res = await request(app).get(`/children/${id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { id } });
  });

  it("returns a 400 envelope when a param fails validation", async () => {
    const res = await request(app).get("/children/not-a-uuid");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.details.fieldErrors.id).toBeDefined();
  });
});

describe("validate({ query })", () => {
  it("exposes coerced query values via validatedQuery", async () => {
    const res = await request(app).get("/children?page=3");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { page: 3 } });
  });

  it("applies schema defaults when the query is absent", async () => {
    const res = await request(app).get("/children");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { page: 1 } });
  });

  it("returns a 400 envelope when the query fails validation", async () => {
    const res = await request(app).get("/children?page=zero");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.details.fieldErrors.page).toBeDefined();
  });
});
