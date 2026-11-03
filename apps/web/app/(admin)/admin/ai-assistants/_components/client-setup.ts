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

/**
 * Pinned, not `npx -y mcp-remote`: whatever is newest on npm at launch would otherwise receive the token. Bump it
 * deliberately, after reading its changelog.
 */
const MCP_REMOTE = "mcp-remote@0.14.3";

/**
 * Every client here takes a bearer header. ChatGPT and claude.ai connectors need OAuth, which is not available yet.
 * Each snippet points at a user-level config: a project's config file is one `git add .` away from publishing a token.
 */
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
      id: "gemini-cli",
      name: "Gemini CLI",
      where:
        "Run once in a terminal. Sign in to Gemini CLI with your Google account — no API key needed.",
      // --scope user: the CLI defaults to project scope, which only loads in the directory it was run from.
      snippet: `gemini mcp add --scope user --transport http --header "Authorization: ${header}" kidlearn ${url}`,
      docsUrl:
        "https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md",
    },
    {
      id: "claude-desktop",
      name: "Claude Desktop",
      where:
        "Settings → Developer → Edit Config, inside claude_desktop_config.json. Needs Node.js installed.",
      // The header's value goes through `env`: on Windows, Claude Desktop splits an `args` entry at its space.
      snippet: JSON.stringify(
        {
          mcpServers: {
            kidlearn: {
              command: "npx",
              args: [
                "-y",
                MCP_REMOTE,
                url,
                "--header",
                // biome-ignore lint/suspicious/noTemplateCurlyInString: mcp-remote expands `${AUTH_HEADER}` from `env` itself.
                "Authorization:${AUTH_HEADER}",
              ],
              env: { AUTH_HEADER: header },
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
      where:
        "~/.cursor/mcp.json, your user config. Not a project's .cursor/mcp.json, which is easily committed.",
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
      where:
        "The user-level mcp.json (MCP: Open User Configuration). VS Code asks for the token on first use and keeps it out of the file.",
      snippet: JSON.stringify(
        {
          inputs: [
            {
              type: "promptString",
              id: "kidlearn-token",
              description: "KidLearn access token (klat_…)",
              password: true,
            },
          ],
          servers: {
            kidlearn: {
              type: "http",
              url,
              headers: {
                // biome-ignore lint/suspicious/noTemplateCurlyInString: VS Code's own input variable, filled from the prompt above.
                Authorization: "Bearer ${input:kidlearn-token}",
              },
            },
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
