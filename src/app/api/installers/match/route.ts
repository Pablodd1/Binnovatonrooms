import { NextResponse } from "next/server";
import type { InspectionDiagnosis } from "@/lib/analysis-schema";
import { matchInstallers } from "@/lib/installer-match";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    diagnosis?: InspectionDiagnosis;
    lat?: number | null;
    lng?: number | null;
  };

  if (!body.diagnosis) {
    return NextResponse.json({ error: "diagnosis is required." }, { status: 400 });
  }

  const installers = await matchInstallers({
    diagnosis: body.diagnosis,
    lat: body.lat ?? null,
    lng: body.lng ?? null
  });

  return NextResponse.json({ installers });
}
