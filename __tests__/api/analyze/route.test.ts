import { describe, it, expect, vi } from "vitest";
import { POST } from "@/app/api/analyze/route";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/logger", () => ({
  createRequestLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  generateRequestId: vi.fn().mockReturnValue("test-id"),
}));

vi.mock("@/lib/request-guards", async (importOriginal: any) => {
  const actual = await importOriginal();
  return {
    ...actual,
    checkRateLimit: vi.fn().mockResolvedValue({ ok: true, limit: 10, remaining: 9, resetAt: Date.now() + 1000 }),
    getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  };
});

describe("POST /api/analyze", () => {
  it("returns 400 when formData() throws an error (invalid form data)", async () => {
    const mockRequest = new Request("http://localhost/api/analyze", {
      method: "POST",
    });

    mockRequest.formData = vi.fn().mockRejectedValue(new Error("Invalid form data parsing error"));

    const response = await POST(mockRequest);

    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Send multipart form data with an image field named image.");
  });

  it("returns 400 when no image is provided in form data", async () => {
    const formData = new FormData();
    const mockRequest = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: formData,
    });

    // We don't want to mock formData() here, we want it to parse the body successfully
    // but the `imageEntries` length will be 0.

    const response = await POST(mockRequest);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Upload at least one image field named image or images.");
  });
});
