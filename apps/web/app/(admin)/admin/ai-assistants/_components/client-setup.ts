/** Placeholder shown in every snippet until a token has just been created on this page. */
export const TOKEN_PLACEHOLDER = "klat_YOUR_TOKEN";

export interface ClientSetup {
  id: string;
  name: string;
  /** Where the snippet goes, in the vendor's own words. */
  where: string;
  snippet: string;
  /** The vendor's MCP docs: their UI moves too often to describe here. */
  docsUrl: string;
}

/** Every client here takes a bearer header. ChatGPT and claude.ai connectors need OAuth, which is not available yet. */
export function buildClientSetups(url: string, token: string): ClientSetup[] {
  const header = `Bearer ${token}`;

  return [
    {
      id: "claude-code",
      name: "Claude Code",
      where: "Run once in a terminal.",
      snippet: `claude mcp add --transport http kidlearn ${url} --header "Authorization: ${header}"`,
      docsUrl: "https://docs.claude.com/en/docs/claude-code/mcp",
    },
    {
      id: "claude-desktop",
      name: "Claude Desktop",
      where:
        "Settings → Developer → Edit Config, inside claude_desktop_config.json. Needs Node.js installed.",
      snippet: JSON.stringify(
        {
          mcpServers: {
            kidlearn: {
              command: "npx",
              args: [
                "-y",
                "mcp-remote",
                url,
                "--header",
                `Authorization:${header}`,
              ],
            },
          },
        },
        null,
        2,
      ),
      docsUrl:
        "https://modelcontextprotocol.io/docs/develop/connect-local-servers",
    },
    {
      id: "cursor",
      name: "Cursor",
      where: "~/.cursor/mcp.json, or .cursor/mcp.json in a project.",
      snippet: JSON.stringify(
        {
          mcpServers: {
            kidlearn: { url, headers: { Authorization: header } },
          },
        },
        null,
        2,
      ),
      docsUrl: "https://docs.cursor.com/context/model-context-protocol",
    },
    {
      id: "vscode",
      name: "VS Code",
      where: ".vscode/mcp.json in a workspace, or the user-level mcp.json.",
      snippet: JSON.stringify(
        {
          servers: {
            kidlearn: { type: "http", url, headers: { Authorization: header } },
          },
        },
        null,
        2,
      ),
      docsUrl:
        "https://code.visualstudio.com/docs/copilot/customization/mcp-servers",
    },
  ];
}
