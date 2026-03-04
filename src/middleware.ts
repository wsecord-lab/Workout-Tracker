import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Trainer-only access gate: when ACCESS_TOKEN is set, all requests must include
 * header "x-access-token: <token>" or cookie "access_token=<token>".
 * When ACCESS_TOKEN is not set, all requests are allowed.
 */
export function middleware(req: NextRequest) {
  const token = process.env.ACCESS_TOKEN;

  // No gate if ACCESS_TOKEN is not set
  if (!token || token === "") {
    return NextResponse.next();
  }

  const headerToken = req.headers.get("x-access-token");
  const cookieToken = req.cookies.get("access_token")?.value;
  const provided = headerToken ?? cookieToken;

  if (provided === token) {
    return NextResponse.next();
  }

  return new NextResponse("Access denied. Provide valid x-access-token header or access_token cookie.", {
    status: 401,
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
