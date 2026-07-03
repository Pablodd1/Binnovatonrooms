import { describe, it, expect } from "vitest";
import { sanitizeText, validateImageFile, imageExtension, isUploadedImage, boundedCoordinate, numberOrNull } from "@/lib/request-guards";

describe("sanitizeText", () => {
  it("trims whitespace", () => {
    expect(sanitizeText("  hello  ")).toBe("hello");
  });

  it("removes null characters", () => {
    expect(sanitizeText("hello\u0000world")).toBe("helloworld");
  });

  it("collapses multiple spaces", () => {
    expect(sanitizeText("hello    world")).toBe("hello world");
  });

  it("returns fallback for non-string", () => {
    expect(sanitizeText(null, "fallback")).toBe("fallback");
  });

  it("truncates to max length", () => {
    expect(sanitizeText("a".repeat(1000), "", 10)).toBe("a".repeat(10));
  });
});

describe("validateImageFile", () => {
  const createFile = (size: number, type: string) =>
    new File([new ArrayBuffer(size)], "test.jpg", { type });

  it("accepts valid JPEG", () => {
    expect(validateImageFile(createFile(1024, "image/jpeg"))).toBeNull();
  });

  it("accepts valid PNG", () => {
    expect(validateImageFile(createFile(1024, "image/png"))).toBeNull();
  });

  it("accepts valid WebP", () => {
    expect(validateImageFile(createFile(1024, "image/webp"))).toBeNull();
  });

  it("rejects empty file", () => {
    expect(validateImageFile(createFile(0, "image/jpeg"))).toBe("Image is empty.");
  });

  it("rejects oversized file", () => {
    expect(validateImageFile(createFile(11 * 1024 * 1024, "image/jpeg"))).toContain("large");
  });

  it("rejects unsupported type", () => {
    expect(validateImageFile(createFile(1024, "image/gif"))).toContain("Unsupported");
  });
});

describe("imageExtension", () => {
  it("returns jpg for JPEG", () => {
    expect(imageExtension("image/jpeg")).toBe("jpg");
  });

  it("returns png for PNG", () => {
    expect(imageExtension("image/png")).toBe("png");
  });

  it("returns webp for WebP", () => {
    expect(imageExtension("image/webp")).toBe("webp");
  });
});

describe("isUploadedImage", () => {
  it("returns true for File objects", () => {
    const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
    expect(isUploadedImage(file)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isUploadedImage(null)).toBe(false);
  });

  it("returns false for strings", () => {
    expect(isUploadedImage("hello" as unknown as File)).toBe(false);
  });
});

describe("boundedCoordinate", () => {
  it("returns value within range", () => {
    expect(boundedCoordinate(45, -90, 90)).toBe(45);
  });

  it("returns null for out of range", () => {
    expect(boundedCoordinate(100, -90, 90)).toBeNull();
  });

  it("returns null for null input", () => {
    expect(boundedCoordinate(null, -90, 90)).toBeNull();
  });
});

describe("numberOrNull", () => {
  it("parses valid number string", () => {
    expect(numberOrNull("42.5")).toBe(42.5);
  });

  it("returns null for empty string", () => {
    expect(numberOrNull("")).toBeNull();
  });

  it("returns null for non-numeric string", () => {
    expect(numberOrNull("abc")).toBeNull();
  });
});