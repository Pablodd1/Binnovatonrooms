import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequestLogger, logger } from "../src/lib/logger";

// Mock getClientIp
vi.mock("../src/lib/request-guards", () => ({
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

describe("logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createRequestLogger", () => {
    it("should log only requestId when request is not provided", () => {
      const requestId = "test-req-123";

      const childSpy = vi.spyOn(logger, 'child');
      createRequestLogger(requestId);

      expect(childSpy).toHaveBeenCalledWith({ requestId });
      expect(childSpy).toHaveBeenCalledTimes(1);
    });

    it("should extract url path, method, and IP when request is provided", () => {
      const requestId = "test-req-456";
      const request = new Request("https://example.com/api/test?query=1", {
        method: "POST",
      });

      const childSpy = vi.spyOn(logger, 'child');
      createRequestLogger(requestId, request);

      expect(childSpy).toHaveBeenCalledWith({
        requestId,
        path: "/api/test",
        method: "POST",
        ip: "127.0.0.1",
      });
      expect(childSpy).toHaveBeenCalledTimes(1);
    });
  });
});
