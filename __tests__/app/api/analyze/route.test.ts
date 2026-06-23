import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/analyze/route";
import { NextResponse } from "next/server";

// Mock dependencies
vi.mock("@/lib/logger", () => ({
  createRequestLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  generateRequestId: vi.fn(() => "test-req-id"),
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve({ user: { id: "test-user-id" } })),
}));

vi.mock("@/lib/request-guards", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    checkRateLimit: vi.fn(() => Promise.resolve({ ok: true })),
    getClientIp: vi.fn(() => "127.0.0.1"),
  };
});

describe("POST /api/analyze", () => {
  it("should return 400 when invalid formData is provided", async () => {
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      // No body or invalid body
    });

    // Mock request.formData to throw an error
    request.formData = vi.fn().mockRejectedValue(new Error("Invalid form data"));

    const response = await POST(request);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toEqual({
      error: "Send multipart form data with an image field named image.",
    });
  });
});
