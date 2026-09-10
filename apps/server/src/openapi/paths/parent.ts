import {
  errorResponse,
  INTERNAL_RESPONSE,
  jsonRequestBody,
  jsonResponse,
  UNAUTHORIZED_RESPONSE,
  VALIDATION_RESPONSE,
} from "../components.js";
import type { RouteDoc } from "../route-doc.js";

// `modules/parent/parent.routes.ts` — `requireParent` guards the whole router.

export const PARENT_ROUTES: RouteDoc[] = [
  {
    method: "post",
    path: "/api/parent/consent",
    operation: {
      operationId: "recordConsent",
      tags: ["Parent Account"],
      summary: "Record COPPA consent",
      description: [
        "Records the parent's consent (FR-AUTH-03) — normally the very first thing a new parent does.",
        "",
        "`accepted` must be the literal `true`. `accepted: false` is not a consent record with a different value — it is an absence of consent, and is rejected as invalid input.",
        "",
        "Until this succeeds, `POST /api/children` answers `403 CONSENT_REQUIRED`.",
      ].join("\n"),
      requestBody: jsonRequestBody("ConsentBody"),
      responses: {
        "200": jsonResponse("Consent recorded.", "ConsentRecordResponse"),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "409": errorResponse(
          "The submitted `version` is not the current consent text. `error.details.currentVersion` carries the version to present and resubmit — this is the mechanism for re-consenting when the policy changes.",
          ["CONFLICT"],
        ),
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "post",
    path: "/api/parent/account/delete-request",
    operation: {
      operationId: "requestAccountDeletion",
      tags: ["Parent Account"],
      summary: "Request account deletion (step 1 of 2)",
      description: [
        "Issues a short-lived confirmation token for `DELETE /api/parent/account` (FR-AUTH-05).",
        "",
        "Needs only an authenticated parent. The token this returns is the guard: it is single-use, expires in 15 minutes, and `DELETE /api/parent/account` does nothing without it — so issuing one is harmless on its own.",
        "",
        "The token is returned in the response body for the MVP. When email confirmation lands, only this operation changes — the `DELETE` contract stays identical.",
      ].join("\n"),
      responses: {
        "200": jsonResponse(
          "A 64-character hex token and its expiry.",
          "DeletionRequestResponse",
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "delete",
    path: "/api/parent/account",
    operation: {
      operationId: "deleteParentAccount",
      tags: ["Parent Account"],
      summary: "Delete the account (step 2 of 2)",
      description: [
        "**Irreversible.** Synchronously erases the parent, every child profile, and all of their data (NFR-SAFE-05/06).",
        "",
        "Guarded by the confirmation token from step one, which is single-use and expires in 15 minutes.",
        "",
        "Note this `DELETE` carries a JSON **request body**. That is legal in OpenAPI 3 but unusual, and some HTTP clients drop bodies on `DELETE`.",
        "",
        "After it succeeds, the caller's session cookie no longer resolves to anything — the better-auth `User` row is gone and its `Session` rows with it.",
      ].join("\n"),
      requestBody: jsonRequestBody("DeleteAccountBody"),
      responses: {
        "200": jsonResponse(
          "The account and all of its data are gone.",
          "DeletedResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": errorResponse(
          "The confirmation token is unknown, already used, expired, or belongs to another account.",
          ["FORBIDDEN"],
        ),
        "500": INTERNAL_RESPONSE,
      },
    },
  },
];
