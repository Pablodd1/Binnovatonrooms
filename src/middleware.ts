import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Auth removed: all routes are public. The app loads directly without login.
export default async function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
