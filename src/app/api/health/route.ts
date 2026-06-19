import { NextResponse } from "next/server";
import { getRuntimeHealth } from "@/lib/server-config";
import { createRequestLogger, generateRequestId } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = generateRequestId();
  const log = createRequestLogger(requestId, request);

  const health = getRuntimeHealth();
  log.info({ ok: health.geminiConfigured }, "Health check");

  return NextResponse.json({
    ok: health.geminiConfigured,
    ...health,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}