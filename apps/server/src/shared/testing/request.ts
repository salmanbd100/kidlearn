import type { Server } from "node:http";
import type { Express } from "express";
import supertest from "supertest";

// `supertest(app)` binds a fresh listener for every request. Under CPU load that
// intermittently surfaces as "socket hang up" on whichever request lost the race
// (it reproduced outside Vitest, against a plain Express app, ~1 in 3000
// requests; one persistent listener gave 0 in 15,000). One server per app,
// shared by every request the file makes, removes the churn.
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
