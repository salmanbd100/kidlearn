import {
  errorResponse,
  INTERNAL_RESPONSE,
  jsonRequestBody,
  jsonResponse,
  UNAUTHORIZED_RESPONSE,
  VALIDATION_RESPONSE,
} from "../components.js";
import type { RouteDoc } from "../route-doc.js";

// `routes/parent.ts` — `requireParent` guards the whole router.

/** Both PIN routes share the brute-force bookkeeping, so both can lock out. */
const PIN_LOCKED_RESPONSE = errorResponse(
  "The account is in its brute-force cool-off window. Five wrong attempts start it at one minute, doubling to a one-hour cap. The window applies to the account, not the session, and the response does not say how long is left.",
  ["PIN_LOCKED"],
);

export const PARENT_ROUTES: RouteDoc[] = [
  {
    method: "get",
    path: "/api/parent/gate-status",
    operation: {
      tags: ["Parent Account"],
      summary: "Is the parent area open right now?",
      description: [
        "Reports the state of the parental gate without changing it (FR-AUTH-04), so a client can render the right screen on first paint instead of provoking a `403` to find out.",
        "",
        "This is the read-only counterpart to what `requirePinVerified` decides on every gated route. `hasPin` and `isPinVerified` are separate fields because they lead to different screens — no PIN means **setup**, a lapsed grant means the **PIN pad** — the same distinction `PIN_REQUIRED` and `PIN_VERIFICATION_REQUIRED` draw behind a 403.",
        "",
        "Deliberately **not** behind the PIN gate: a gate cannot be asked whether it is shut from the far side of itself. That is also why the operation exists — the only other PIN-gated endpoint is `POST /api/parent/account/delete-request`, which mints a deletion token as a side effect and is therefore useless as a probe.",
        "",
        "Costs no query: it reads the parent and session rows the auth middleware already loaded.",
      ].join("\n"),
      responses: {
        "200": jsonResponse(
          "`pinVerifiedUntil` is `null` whenever `isPinVerified` is false — a lapsed grant is reported as absent rather than as a past timestamp, so no client has to subtract two clocks to interpret it.",
          "GateStatusResponse",
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "post",
    path: "/api/parent/pin",
    operation: {
      tags: ["Parent Account"],
      summary: "Set or change the parental PIN",
      description: [
        "Sets the parental PIN (FR-AUTH-04), or replaces an existing one when `currentPin` proves possession.",
        "",
        "Deliberately **not** behind the PIN gate: a parent with no PIN could never get through it to create their first one. Omit `currentPin` when setting the first PIN; it is required to replace one, because otherwise anyone who found an unattended unlocked session could lock the real parent out of their own dashboard.",
        "",
        "Changing a PIN counts as a PIN attempt, so this endpoint can lock out exactly like `/pin/verify` — it would otherwise be an equally good guessing oracle. A successful change resets both counters.",
        "",
        "**Opens the grant as it stores the PIN**, and returns its expiry. Choosing a PIN is possession of it, so a prompt to type it again immediately would verify nothing — and onboarding walks straight from here to `POST /api/children`, which *is* PIN-gated, so without the grant the first-run flow would deadlock on a gate the parent had just satisfied.",
      ].join("\n"),
      requestBody: jsonRequestBody(
        "SetPinBody",
        'Four digits as a **string** — leading zeros are significant, so `"0042"` and `42` are not the same PIN and the latter is rejected.',
      ),
      responses: {
        "200": jsonResponse(
          "The PIN is set, and this session now holds a 15-minute grant. The response carries only the fact that a PIN exists and when the grant lapses — never the PIN or its hash.",
          "PinStatusResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": errorResponse(
          "`currentPin` was missing on a change, or it was wrong.",
          ["FORBIDDEN"],
        ),
        "429": PIN_LOCKED_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "post",
    path: "/api/parent/pin/verify",
    operation: {
      tags: ["Parent Account"],
      summary: "Verify the PIN and open the parent-area grant",
      description: [
        "Opens a **15-minute** grant on the current session (FR-AUTH-04). `pinVerifiedUntil` is when it lapses; a client should use it to hide the parent area proactively rather than waiting for the next request to fail.",
        "",
        "The grant lives on the session row, so signing out drops it, and it is not transferable between sessions.",
      ].join("\n"),
      requestBody: jsonRequestBody("VerifyPinBody"),
      responses: {
        "200": jsonResponse(
          "The grant is open until `pinVerifiedUntil`.",
          "PinGrantResponse",
        ),
        "400": VALIDATION_RESPONSE,
        "401": UNAUTHORIZED_RESPONSE,
        "403": errorResponse(
          "`PIN_INVALID` — wrong PIN. `PIN_REQUIRED` — this account has no PIN yet, so send the parent to setup rather than showing a wrong-PIN message.",
          ["PIN_INVALID", "PIN_REQUIRED"],
        ),
        "429": PIN_LOCKED_RESPONSE,
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "post",
    path: "/api/parent/consent",
    operation: {
      tags: ["Parent Account"],
      summary: "Record COPPA consent",
      description: [
        "Records the parent's consent (FR-AUTH-03). Not PIN-gated: consent is normally the very first thing a new parent does, before any PIN exists.",
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
      tags: ["Parent Account"],
      summary: "Request account deletion (step 1 of 2)",
      description: [
        "Issues a short-lived confirmation token for `DELETE /api/parent/account` (FR-AUTH-05).",
        "",
        "PIN-gated, unlike the rest of this router: erasing the account is the most destructive action in the product, so it must not be reachable from a session someone left open on the kitchen tablet.",
        "",
        "The token is returned in the response body for the MVP. When email confirmation lands, only this operation changes — the `DELETE` contract stays identical.",
      ].join("\n"),
      responses: {
        "200": jsonResponse(
          "A 64-character hex token and its expiry.",
          "DeletionRequestResponse",
        ),
        "401": UNAUTHORIZED_RESPONSE,
        "403": errorResponse(
          "`PIN_REQUIRED` — no PIN is set on this account, so set one first. `PIN_VERIFICATION_REQUIRED` — a PIN exists but this session has no live grant; call `/pin/verify`. Two codes rather than one because the client's next screen differs.",
          ["PIN_REQUIRED", "PIN_VERIFICATION_REQUIRED"],
        ),
        "500": INTERNAL_RESPONSE,
      },
    },
  },
  {
    method: "delete",
    path: "/api/parent/account",
    operation: {
      tags: ["Parent Account"],
      summary: "Delete the account (step 2 of 2)",
      description: [
        "**Irreversible.** Synchronously erases the parent, every child profile, and all of their data (NFR-SAFE-05/06).",
        "",
        "Guarded by the confirmation token rather than by the PIN gate: the token was itself issued from behind the gate and expires in 15 minutes.",
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
