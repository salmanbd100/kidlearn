import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Basic-auth gate for the dev deployment. Caddy fronts only the API hostnames and Vercel Password
 * Protection is paid; set only in the dev project, so production returns immediately.
 * Not `NEXT_PUBLIC_`: that would inline the credential into the client bundle.
 * The comparison is not constant-time on purpose: this is a speed bump, not a boundary (dev holds no production data).
 */
const CREDENTIAL = process.env.DEV_SITE_BASIC_AUTH;

// Buffer, not btoa: btoa throws outside Latin-1, which would 500 every dev request for such a password.
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

// Assets are excluded so the browser is not re-prompted per asset; their JS/CSS is fetchable without the gate, acceptable for a speed bump.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
