import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectDefects,
  detectionToEvidenceMarkers,
  detectionSummary,
  depthToMeasurementContext,
  type DetectionResult,
} from "@/lib/detection-client";

describe("detectionToEvidenceMarkers", () => {
  const sampleDetections: DetectionResult[] = [
    {
      defect_type: "crack",
      confidence: 0.92,
      x_center: 0.5,
      y_center: 0.5,
      width: 0.1,
      height: 0.3,
      class_id: 0,
    },
    {
      defect_type: "spalling",
      confidence: 0.78,
      x_center: 0.2,
      y_center: 0.8,
      width: 0.15,
      height: 0.1,
      class_id: 1,
    },
  ];

  it("converts detections to evidence markers with correct coordinates", () => {
    const markers = detectionToEvidenceMarkers(sampleDetections, 1920, 1080);
    expect(markers).toHaveLength(2);
    expect(markers[0].label).toContain("crack");
    expect(markers[0].confidence).toBe(0.92);
    expect(markers[0].x).toBe(45);
    expect(markers[0].y).toBe(35);
    expect(markers[0].width).toBe(10);
    expect(markers[0].height).toBe(30);
  });

  it("clamps coordinates to 0-100 range", () => {
    const edgeDetection: DetectionResult[] = [
      {
        defect_type: "crack",
        confidence: 0.9,
        x_center: 0.01,
        y_center: 0.99,
        width: 0.02,
        height: 0.02,
        class_id: 0,
      },
    ];
    const markers = detectionToEvidenceMarkers(edgeDetection, 100, 100);
    expect(markers[0].x).toBeGreaterThanOrEqual(0);
    expect(markers[0].y).toBeLessThanOrEqual(100);
  });

  it("returns empty array for no detections", () => {
    const markers = detectionToEvidenceMarkers([], 1920, 1080);
    expect(markers).toHaveLength(0);
  });
});

describe("detectionSummary", () => {
  it("calculates correct summary", () => {
    const detections: DetectionResult[] = [
      {
        defect_type: "crack",
        confidence: 0.9,
        x_center: 0.5,
        y_center: 0.5,
        width: 0.1,
        height: 0.1,
        class_id: 0,
      },
      {
        defect_type: "crack",
        confidence: 0.8,
        x_center: 0.3,
        y_center: 0.3,
        width: 0.05,
        height: 0.05,
        class_id: 0,
      },
      {
        defect_type: "spalling",
        confidence: 0.7,
        x_center: 0.7,
        y_center: 0.7,
        width: 0.2,
        height: 0.15,
        class_id: 1,
      },
    ];
    const summary = detectionSummary(detections);
    expect(summary.totalDefects).toBe(3);
    expect(summary.defectTypes["crack"]).toBe(2);
    expect(summary.defectTypes["spalling"]).toBe(1);
    expect(summary.avgConfidence).toBeCloseTo(0.8, 1);
    expect(summary.highConfidenceCount).toBe(3);
  });

  it("returns zeros for empty detections", () => {
    const summary = detectionSummary([]);
    expect(summary.totalDefects).toBe(0);
    expect(summary.avgConfidence).toBe(0);
  });
});

describe("depthToMeasurementContext", () => {
  it("describes significant depth variation", () => {
    const context = depthToMeasurementContext({
      width: 640,
      height: 480,
      min_depth: 0.5,
      max_depth: 3.0,
      mean_depth: 1.5,
    });
    expect(context).toContain("Significant");
  });

  it("describes flat surface", () => {
    const context = depthToMeasurementContext({
      width: 640,
      height: 480,
      min_depth: 1.0,
      max_depth: 1.2,
      mean_depth: 1.1,
    });
    expect(context).toContain("flat");
  });

  it("returns message for null depth", () => {
    const context = depthToMeasurementContext(null);
    expect(context).toContain("No depth data");
  });
});

// Mock logger to prevent console noise during tests
vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("detectDefects", () => {
  const mockImageBuffer = Buffer.from("fake-image-data");
  const mockMimeType = "image/jpeg";

  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("returns parsed response on success", async () => {
    const mockResponse = {
      detections: [
        {
          defect_type: "crack",
          confidence: 0.9,
          x_center: 0.5,
          y_center: 0.5,
          width: 0.1,
          height: 0.1,
          class_id: 0,
        },
      ],
      depth: null,
      processing_time_ms: 100,
      device: "cpu",
      model_versions: {},
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await detectDefects(mockImageBuffer, mockMimeType);
    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Verify the FormData gets created correctly
    const fetchArgs = (global.fetch as any).mock.calls[0];
    expect(fetchArgs[0]).toContain("/detect");
    expect(fetchArgs[1].method).toBe("POST");
    expect(fetchArgs[1].body).toBeInstanceOf(FormData);
  });

  it("returns null and logs warning on non-ok response", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await detectDefects(mockImageBuffer, mockMimeType);
    expect(result).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns null and logs warning on fetch error", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("Network Error"));

    const result = await detectDefects(mockImageBuffer, mockMimeType);
    expect(result).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
