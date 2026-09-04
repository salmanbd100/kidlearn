import type { Language, MediaKind } from "@kidlearn/db";
import type { AssetKind, Locale } from "@kidlearn/types";
import {
  errorResponse,
  INTERNAL_RESPONSE,
  jsonRequestBody,
  jsonResponse,
  UNAUTHORIZED_RESPONSE,
  VALIDATION_RESPONSE,
} from "../components.js";
import type { RouteDoc } from "../route-doc.js";

/** `routes/admin/media.ts` — the media library (file 33, FR-CMS-02). */
type _KindsAgree = MediaKind extends AssetKind
  ? AssetKind extends MediaKind
    ? true
    : never
  : never;
type _LanguagesAgree = Language extends Locale
  ? Locale extends Language
    ? true
    : never
  : never;
const _mediaEnumMirrorsAreExhaustive: [_KindsAgree, _LanguagesAgree] = [
  true,
  true,
];
void _mediaEnumMirrorsAreExhaustive;

const ADMIN_FORBIDDEN_RESPONSE = errorResponse(
  "Authenticated, but not an administrator. Every signed-in *parent* lands here — see `GET /api/admin/me` for why a valid session is not enough.",
  ["FORBIDDEN"],
);

const GUARD_RESPONSES = {
  "401": UNAUTHORIZED_RESPONSE,
  "403": ADMIN_FORBIDDEN_RESPONSE,
  "500": INTERNAL_RESPONSE,
};

/** The one paragraph that explains why this resource has three operations. */
const DIRECT_UPLOAD = [
  "**No file byte passes through this API.** The browser asks this endpoint for a signature, `POST`s the file straight to `https://api.cloudinary.com/v1_1/{cloudName}/auto/upload`, and then registers the delivery URL it got back with `POST /api/admin/media`.",
  "",
  "That is not an optimisation. This service runs on a free tier that sleeps and has no disk, so proxying a lesson video through it would be a request that times out on a cold start against a memory ceiling nobody can raise.",
  "",
  "The visible consequence is that an upload is two requests and can half-fail. That trade is deliberate: an upload that succeeded at Cloudinary but failed to register leaves an orphan file in the account, which costs storage and is collectable, whereas the reverse — a row pointing at nothing — is content a child cannot play.",
].join("\n");

const SIGN_DESCRIPTION = [
  "Mints the signed parameter set the browser needs to upload one file (FR-CMS-02).",
  "",
  DIRECT_UPLOAD,
  "",
  "**The API secret is never in the response.** It signs `timestamp` and `folder` server-side and stays there, which is the whole reason this endpoint exists rather than an unsigned upload preset the client could use directly.",
  "",
  "`signature` covers exactly `timestamp` and `folder`. Cloudinary verifies it over the parameters it was computed from, so the upload form must send those two and no other *signed* field — adding one is what produces `Invalid Signature`. The signature also expires (Cloudinary rejects a timestamp much over an hour old), which stops one handed out today from being a permanent upload credential.",
  "",
  "`POST` rather than `GET` despite reading nothing: it mints a time-limited credential, so it must not be cacheable, prefetchable, or reachable from a link. `kind` is the only input, because it decides the folder the signature is computed over.",
].join("\n");

const REGISTER_DESCRIPTION = [
  "Records an upload that has already reached Cloudinary, creating the `MediaAsset` row every owning entity's foreign key points at.",
  "",
  DIRECT_UPLOAD,
  "",
  "**`url` must be a delivery URL for this deployment's own cloud** — `https://res.cloudinary.com/{cloudName}/…`. Anything else is a `400`. This is the security of the endpoint rather than a tidiness check: the client is the only party that knows the URL, since the upload bypassed this server, so without it any address on the internet could be written into a row a child's lesson later plays. (Stated here because Zod refinements are dropped in JSON Schema conversion and the rule is therefore invisible in the schema below.)",
  "",
  "`language` is `null` for a language-neutral asset — an illustration or a photograph. A narration clip must name its locale, because that is what decides whether a Bangla learner hears Bangla (FR-I18N-01). Omitting the field means `null` explicitly rather than unknown.",
  "",
  "There is deliberately **no update and no delete**. An asset is referenced by explicit foreign keys from worlds, lessons, stories, badges and characters, so rewriting a row's URL would silently change what all of them play, and deleting one would break them. Retiring an asset means unlinking it from its owners, which the `/api/admin/content/*` edit endpoints already do.",
].join("\n");

const LIST_DESCRIPTION = [
  "The library, newest first — what the media grid and every asset picker read.",
  "",
  "Both filters are optional and combine: `?kind=audio&language=bn` is how a picker offers only Bangla narration for a prompt field, which is what keeps an author choosing an asset rather than typing a URL.",
  "",
  "Unpaginated, matching the curriculum lists: a picker is browsed by looking at it, and a page boundary would hide an asset that exists.",
].join("\n");

export const ADMIN_MEDIA_ROUTES: RouteDoc[] = [
  {
    method: "post",
    path: "/api/admin/media/sign",
    operation: {
      tags: ["Admin CMS"],
      summary: "Sign a direct upload to Cloudinary",
      description: SIGN_DESCRIPTION,
      requestBody: jsonRequestBody("MediaSignUploadBody"),
      responses: {
        "200": jsonResponse(
          "The signed parameters, plus the cloud name and API key the upload URL and form need.",
          "UploadSignatureResponse",
        ),
        "400": VALIDATION_RESPONSE,
        ...GUARD_RESPONSES,
      },
    },
  },
  {
    method: "post",
    path: "/api/admin/media",
    operation: {
      tags: ["Admin CMS"],
      summary: "Register an uploaded asset",
      description: REGISTER_DESCRIPTION,
      requestBody: jsonRequestBody("MediaRegisterAssetBody"),
      responses: {
        "201": jsonResponse(
          "The created `MediaAsset`. Its `id` is what an owning entity's foreign key is set to.",
          "MediaAssetResponse",
        ),
        "400": errorResponse(
          "The body failed validation, **or** `url` is not a Cloudinary delivery URL for this cloud. `error.details` carries `ZodError.flatten()` output either way, with the host failure reported under `url`.",
          ["VALIDATION_FAILED"],
        ),
        ...GUARD_RESPONSES,
      },
    },
  },
  {
    method: "get",
    path: "/api/admin/media",
    operation: {
      tags: ["Admin CMS"],
      summary: "List media assets",
      description: LIST_DESCRIPTION,
      parameters: [
        {
          name: "kind",
          in: "query",
          required: false,
          description: "Restrict to one kind of asset.",
          schema: { type: "string", enum: ["image", "audio", "video"] },
        },
        {
          name: "language",
          in: "query",
          required: false,
          description:
            "Restrict to one locale. Language-neutral assets (`language: null`) are excluded when this is set — an image is not Bangla.",
          schema: { type: "string", enum: ["en", "bn"] },
        },
      ],
      responses: {
        "200": jsonResponse(
          "Every matching asset, newest first.",
          "MediaAssetListResponse",
        ),
        "400": VALIDATION_RESPONSE,
        ...GUARD_RESPONSES,
      },
    },
  },
];
