import type { Server } from "node:http";
import type { Express } from "express";
import supertest from "supertest";

// A fresh listener per request intermittently surfaces as "socket hang up" under load (~1 in 3000, reproduced outside Vitest);
// one shared server per app removes the churn.
const servers = new WeakMap<Express, Server>();

export default function request(app: Express): ReturnType<typeof supertest> {
  let server = servers.get(app);
  if (server === undefined) {
    server = app.listen(0);
    // The suite must still exit when a file never closes it.
    server.unref();
    servers.set(app, server);
  }
  return supertest(server);
}
