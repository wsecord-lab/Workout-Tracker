import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optional access gate: when ACCESS_TOKEN is set in production, all requests
 * must include header "x-access-token: <token>" or cookie "access_token=<token>".
 * Dev mode is permissive unless ACCESS_TOKEN is explicitly set.
 */
export function middleware(req: NextRequest) {
  const token = process.env.ACCESS_TOKEN;
  const isProd = process.env.NODE_ENV === "production";

  // No gate if ACCESS_TOKEN is not set
  if (!token || token === "") {
    return NextResponse.next();
  }

  // In dev, be permissive (allow localhost without token)
  if (!isProd) {
    return NextResponse.next();
  }

  const headerToken = req.headers.get("x-access-token");
  const cookieToken = req.cookies.get("access_token")?.value;
  const provided = headerToken ?? cookieToken;

  if (provided === token) {
    return NextResponse.next();
  }

  return new NextResponse("Access denied. Provide valid x-access-token header or access_token cookie.", {
    status: 403,
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
