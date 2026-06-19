import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

const publicRoutes = new Set(["/api/health", "/api/auth", "/login", "/_next"]);
const publicApiRoutes = ["/api/auth/"];

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicRoutes.has(pathname)) return NextResponse.next();
  if (publicApiRoutes.some((route) => pathname.startsWith(route))) return NextResponse.next();
  if (pathname.startsWith("/_next/") || pathname.includes(".")) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized. Sign in at /login." }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};