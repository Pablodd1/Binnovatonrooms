import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Vi.mock needs to be hoisted and reference standard imports properly for vitest
import * as requestGuards from "@/lib/request-guards";
vi.mock("@/lib/request-guards", () => ({
  getClientIp: vi.fn(),
}));

import { logger, createRequestLogger } from "@/lib/logger";

describe("logger", () => {
  describe("createRequestLogger", () => {
    let childSpy: any;

    beforeEach(() => {
      // Spy on the logger.child method
      childSpy = vi.spyOn(logger, "child").mockReturnValue({} as any);
      // Reset the mock implementation
      vi.mocked(requestGuards.getClientIp).mockReturnValue("127.0.0.1");
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should create a logger with only requestId when no request is provided", () => {
      const requestId = "test-req-123";

      createRequestLogger(requestId);

      expect(childSpy).toHaveBeenCalledTimes(1);
      expect(childSpy).toHaveBeenCalledWith({
        requestId,
      });
    });

    it("should create a logger with request details when a request is provided", () => {
      const requestId = "test-req-456";

      // Create a mock Request object
      const request = new Request("https://example.com/api/test", {
        method: "POST",
      });

      createRequestLogger(requestId, request);

      expect(childSpy).toHaveBeenCalledTimes(1);
      expect(childSpy).toHaveBeenCalledWith({
        requestId,
        path: "/api/test",
        method: "POST",
        ip: "127.0.0.1",
      });
    });

    it("should handle request with root path correctly", () => {
      const requestId = "test-req-789";

      // Create a mock Request object
      const request = new Request("https://example.com/", {
        method: "GET",
      });

      createRequestLogger(requestId, request);

      expect(childSpy).toHaveBeenCalledTimes(1);
      expect(childSpy).toHaveBeenCalledWith({
        requestId,
        path: "/",
        method: "GET",
        ip: "127.0.0.1",
      });
    });
  });
});
