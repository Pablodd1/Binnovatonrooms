import { NextResponse } from "next/server";
import { getRuntimeHealth } from "@/lib/server-config";

export function GET() {
  const health = getRuntimeHealth();
  return NextResponse.json({
    ok: health.geminiConfigured,
    ...health
  });
}
