import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Basic-auth gate for the dev deployment (file 38 req 4).
 *
 * Caddy fronts only the two API hostnames now that the frontend is on Vercel, so
 * its `basic_auth` cannot cover `dev.kidlearn.net`, and Vercel's own Password
 * Protection is a paid feature. Set only in the dev Vercel project; production
 * leaves it unset and this returns immediately, so the gate does not exist there.
 *
 * Deliberately not `NEXT_PUBLIC_` — that prefix would inline the credential into
 * the client bundle, which is the one thing this must not do.
 *
 * The comparison is not constant-time and does not need to be. This keeps an
 * unreviewed-content build out of casual reach; it is not a security boundary.
 * The boundary is that dev holds no production data.
 */
const CREDENTIAL = process.env.DEV_SITE_BASIC_AUTH;

// Buffer, not btoa: btoa throws on any character outside Latin-1, which would
// turn a password containing one into a 500 on every dev request. Browsers send
// the credential UTF-8 encoded.
const EXPECTED_AUTHORIZATION = CREDENTIAL
  ? `Basic ${Buffer.from(CREDENTIAL, "utf8").toString("base64")}`
  : undefined;

export function proxy(request: NextRequest): NextResponse {
  if (!EXPECTED_AUTHORIZATION) return NextResponse.next();

  if (request.headers.get("authorization") === EXPECTED_AUTHORIZATION) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="kidlearn dev"' },
  });
}

// Static assets and the favicon are excluded so the browser is not asked to
// re-authenticate per asset. The trade is that the JS and CSS of an
// unreviewed-content build are fetchable without the gate — acceptable only
// because this is a speed bump and not a boundary, as above.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
