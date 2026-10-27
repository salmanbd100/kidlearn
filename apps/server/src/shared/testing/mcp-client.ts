import type { AddressInfo } from "node:net";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import type { Express } from "express";

export type McpEra = "legacy" | "modern";

/** A real MCP client over real HTTP against `app`, as an assistant would connect. */
export async function connectMcp(
  app: Express,
  secret: string,
  era: McpEra = "legacy",
  clientInfo = { name: "kidlearn-test", version: "0.0.1" },
): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  // `listen(0)` on a TCP socket always reports an `AddressInfo`, never a pipe name.
  const { port } = server.address() as AddressInfo;

  const client = new Client(clientInfo, {
    ...(era === "modern"
      ? { versionNegotiation: { mode: { pin: "2026-07-28" } } }
      : {}),
  });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${port}/mcp`),
    { requestInit: { headers: { Authorization: `Bearer ${secret}` } } },
  );
  await client.connect(transport);

  return {
    client,
    close: async () => {
      await client.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
