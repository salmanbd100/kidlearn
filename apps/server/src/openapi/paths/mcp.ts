import {
  errorResponse,
  INTERNAL_RESPONSE,
  jsonRequestBody,
  jsonResponse,
} from "../components.js";
import type { RouteDoc } from "../route-doc.js";

export const MCP_ROUTES: RouteDoc[] = [
  {
    method: "post",
    path: "/mcp",
    operation: {
      operationId: "sendMcpMessage",
      tags: ["MCP"],
      summary: "Model Context Protocol endpoint",
      description: [
        "One JSON-RPC message per request, answered with one JSON body (file 41, FR-AI-10). Both the 2026-07-28 revision and 2025-era clients are served; the server is stateless, so there is no session to resume and `GET`/`DELETE` answer `405`.",
        "",
        "**Tools.** Read: `get_authoring_guide`, `list_curriculum`, `get_lesson`, `list_characters`, `get_quiz_format_schema`, `get_draft_status`, `list_my_drafts`. Write drafts: `submit_lesson_draft`, `submit_story_draft`, `submit_quiz_questions`. Start server-side media: `request_narration`, `request_illustrations`. Prompts `write_lesson`, `write_story` and `write_quiz` render the briefs KidLearn's own generator uses.",
        "",
        "**A submission is validated against the same schemas as a Gemini generation.** An invalid one comes back as a tool result with `isError: true` listing each failing field — still HTTP `200`, because the protocol call succeeded — and nothing is written. A valid one writes the job and its draft rows in one transaction, straight to `awaiting_review`. A repeated `clientRequestId` returns the first job.",
        "",
        "**Limits.** `MCP_DRAFTS_PER_DAY` drafts per admin per app-timezone day (an `isError` result past it), separate from the Gemini caps; `MCP_RATE_LIMIT_PER_MINUTE` requests per admin (across all their tokens) and the `/api` per-IP limit ahead of authentication. Bodies over 100 KB are refused.",
      ].join("\n"),
      security: [{ adminAccessToken: [] }],
      requestBody: jsonRequestBody("McpJsonRpcRequest"),
      responses: {
        "200": jsonResponse(
          "The JSON-RPC response. Tool failures are in-band (`result.isError`), not HTTP errors.",
          "McpJsonRpcResponse",
        ),
        "202": {
          description:
            "A JSON-RPC notification was accepted; notifications have no response body.",
        },
        "400": errorResponse(
          "The body is not JSON (`VALIDATION_FAILED`, our envelope), or is JSON but not a JSON-RPC message — the MCP SDK answers that one with a JSON-RPC error object rather than our envelope.",
          ["VALIDATION_FAILED"],
        ),
        "401": errorResponse(
          'No token, or one that is unknown, revoked or expired — one answer for all three. Carries `WWW-Authenticate: Bearer` (with `error="invalid_token"` when a token was sent).',
          ["UNAUTHORIZED"],
        ),
        "403": errorResponse(
          'The token is valid but its admin no longer qualifies (their sign-in was deleted, or a Google account is linked to it), or it lacks the `mcp:drafts` scope (then with `WWW-Authenticate: Bearer error="insufficient_scope"`).',
          ["FORBIDDEN"],
        ),
        "413": errorResponse("The body is over 100 KB.", ["VALIDATION_FAILED"]),
        "429": errorResponse(
          "Too many requests from this IP, or from this admin, in the last minute.",
          ["RATE_LIMITED"],
        ),
        "500": INTERNAL_RESPONSE,
      },
    },
  },
];
