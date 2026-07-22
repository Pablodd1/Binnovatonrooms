import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  if (!apiKey) {
    return NextResponse.json({ error: "No GEMINI_API_KEY set" });
  }

  const client = new GoogleGenAI({ apiKey });

  try {
    // Test 1: Simple text-only call (no schema, no image)
    const response = await client.models.generateContent({
      model,
      contents: "Reply with the single word: OK",
    });

    // Check all possible response shapes
    const textViaProperty = (response as { text?: string }).text;
    const textViaCandidates = (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0]?.content?.parts?.[0]?.text;

    return NextResponse.json({
      success: true,
      model,
      sdkVersion: "1.35.0",
      responseShape: {
        hasTextProperty: typeof textViaProperty,
        hasCandidates: !!(response as { candidates?: unknown }).candidates,
        textViaProperty: textViaProperty?.slice(0, 100),
        textViaCandidates: textViaCandidates?.slice(0, 100),
        responseKeys: Object.keys(response),
      },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      model,
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : "Unknown",
      errorStack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
    }, { status: 500 });
  }
}
