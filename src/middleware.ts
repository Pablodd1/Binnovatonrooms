import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

const publicRoutes = new Set(["/api/health", "/api/auth", "/login", "/_next"]);
const publicApiRoutes = ["/api/auth/"];

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets and public routes — skip auth entirely
  if (pathname.startsWith("/_next/") || pathname.includes(".")) return NextResponse.next();
  if (publicRoutes.has(pathname)) return NextResponse.next();
  if (publicApiRoutes.some((route) => pathname.startsWith(route))) return NextResponse.next();

  const session = await auth();
  if (!session?.user) {
    // API routes return 401 JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized. Sign in at /login." }, { status: 401 });
    }
    // Page routes redirect to login
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};