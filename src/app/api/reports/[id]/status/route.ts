import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateRequest, statusUpdateSchema } from "@/lib/validation";
import { createRequestLogger, generateRequestId } from "@/lib/logger";
import { classifyClosedReason } from "@/lib/jev";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TransitionResult = {
  id: string;
  status: string;
  closed_reason: string | null;
  closed_at: string | null;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = generateRequestId();
  const log = createRequestLogger(requestId, request);
  const { id } = await params;

  // Validate input
  let body: { status: string; closedReason?: string };
  try {
    body = await request.json();
    validateRequest(statusUpdateSchema, body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Datos invalidos";
    log.warn({ err: message }, "Status update validation failed");
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    // Demo mode: return success with updated status
    log.info({ reportId: id, newStatus: body.status }, "Demo status update");
    return NextResponse.json({
      id,
      status: body.status,
      closed_reason: body.status === "cerrado" ? body.closedReason ?? "" : null,
      closed_at: body.status === "cerrado" ? new Date().toISOString() : null,
      generatedFrom: "demo",
    });
  }

  // Call the transition function with RPC
  // Note: param name is "reason" (not "closed_reason") to avoid colliding with the
  // table column of the same name inside the plpgsql function body.
  const { data, error } = await supabase.rpc("transition_report_status", {
    target_id: id,
    new_status: body.status,
    reason: body.closedReason ?? null,
  });

  if (error) {
    log.error({ reportId: id, error: error.message }, "Status transition failed");

    // Handle known transition errors gracefully
    if (error.message.includes("Transicion invalida")) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "No se pudo actualizar el estado del reporte" },
      { status: 500 },
    );
  }

  // RPC returns a single row or array
  const result: TransitionResult | null = Array.isArray(data) ? data[0] : data;

  log.info(
    { reportId: id, newStatus: body.status },
    "Status transition successful",
  );

  // Jev triage of the free-text close reason (best-effort; never blocks the close)
  let closedCategory: string | null = null;
  if (body.status === "cerrado") {
    closedCategory = await classifyClosedReason(body.closedReason ?? null);
    const { error: categoryError } = await supabase
      .from("reportes")
      .update({ closed_category: closedCategory })
      .eq("id", id);
    if (categoryError) {
      // Column may not exist yet (migration pending) — degrade silently
      log.warn(
        { reportId: id, error: categoryError.message, closedCategory },
        "Could not persist closed_category (run the closed_category migration?)"
      );
      closedCategory = null;
    }
  }

  return NextResponse.json({
    id: result?.id ?? id,
    status: result?.status ?? body.status,
    closed_reason: result?.closed_reason ?? null,
    closed_at: result?.closed_at ?? null,
    closed_category: closedCategory,
    generatedFrom: "supabase",
  });
}
