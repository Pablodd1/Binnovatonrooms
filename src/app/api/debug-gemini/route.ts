import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const keyPreview = apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : "MISSING";

  if (!apiKey) {
    return NextResponse.json({ error: "No GEMINI_API_KEY set", keyPreview });
  }

  const client = new GoogleGenAI({ apiKey });

  try {
    const response = await client.models.generateContent({
      model,
      contents: "Reply with: OK",
    });
    const text = (response as { text?: string }).text || "";
    return NextResponse.json({
      success: true,
      model,
      keyPreview,
      response: text.slice(0, 50),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      success: false,
      model,
      keyPreview,
      errorCode: msg.includes("401") ? "401_INVALID_KEY" : msg.includes("403") ? "403_FORBIDDEN" : "UNKNOWN",
      error: msg.slice(0, 300),
    }, { status: 500 });
  }
}
