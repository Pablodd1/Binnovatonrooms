import { describe, it, expect, vi } from "vitest";
import { scoreFrame, defaultQuality } from "../src/lib/image-scoring";

describe("image-scoring", () => {
  it("should return defaultQuality if canvas context is missing", () => {
    const mockCanvas = {
      getContext: vi.fn().mockReturnValue(null),
      width: 1920,
      height: 1080,
    } as unknown as HTMLCanvasElement;

    const result = scoreFrame(mockCanvas);
    expect(result).toEqual(defaultQuality);
  });

  it("should process canvas and generate a valid QualityScore", () => {
    const mockData = new Uint8ClampedArray(160 * 100 * 4);
    // Fill with grey pixels to simulate a flat image
    for (let i = 0; i < mockData.length; i += 4) {
      mockData[i] = 100; // R
      mockData[i + 1] = 100; // G
      mockData[i + 2] = 100; // B
      mockData[i + 3] = 255; // A
    }

    const mockCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue({ data: mockData }),
    };

    const mockSampleCanvas = {
      width: 160,
      height: 100,
      getContext: vi.fn().mockReturnValue(mockCtx),
    };

    const mockCanvas = {
      width: 1920,
      height: 1080,
      getContext: vi.fn().mockReturnValue(mockCtx),
    } as unknown as HTMLCanvasElement;

    // We have to mock document.createElement to return our mockSampleCanvas
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockReturnValue(mockSampleCanvas as unknown as HTMLCanvasElement);

    const result = scoreFrame(mockCanvas);

    expect(result).toBeDefined();
    expect(result.brightness).toBe(100);
    expect(result.glarePercent).toBe(0);
    expect(result.sharpness).toBe(0); // since it's flat

    // Check structure
    expect(result).toHaveProperty("grade");
    expect(result).toHaveProperty("checks");
    expect(result).toHaveProperty("guidance");
    expect(Array.isArray(result.checks)).toBe(true);
    expect(Array.isArray(result.guidance)).toBe(true);

    createElementSpy.mockRestore();
  });
});
