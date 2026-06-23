import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger, createRequestLogger, generateRequestId } from "@/lib/logger";
import * as requestGuards from "@/lib/request-guards";

describe("logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createRequestLogger", () => {
    it("creates a child logger with only requestId when no request is provided", () => {
      const childSpy = vi.spyOn(logger, "child");
      const requestId = "test-id-123";

      createRequestLogger(requestId);

      expect(childSpy).toHaveBeenCalledTimes(1);
      expect(childSpy).toHaveBeenCalledWith({ requestId });
    });

    it("creates a child logger with request details when request is provided", () => {
      const childSpy = vi.spyOn(logger, "child");
      const mockIp = "192.168.1.1";

      // Mock getClientIp
      vi.spyOn(requestGuards, "getClientIp").mockReturnValue(mockIp);

      const requestId = "test-id-456";
      const request = new Request("http://localhost:3000/api/test", {
        method: "POST",
      });

      createRequestLogger(requestId, request);

      expect(childSpy).toHaveBeenCalledTimes(1);
      expect(childSpy).toHaveBeenCalledWith({
        requestId,
        path: "/api/test",
        method: "POST",
        ip: mockIp,
      });
    });
  });

  describe("generateRequestId", () => {
    it("returns a string", () => {
      const id = generateRequestId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("generates unique IDs", () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      expect(id1).not.toBe(id2);
    });

    it("matches the expected format", () => {
      const id = generateRequestId();
      // Should be timestamp-randomString
      expect(id).toMatch(/^\d+-[a-z0-9]{9}$/);
    });
  });
});
