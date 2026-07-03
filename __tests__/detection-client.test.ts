import { describe, it, expect, vi, afterEach } from "vitest";
import {
  detectionToEvidenceMarkers,
  detectionSummary,
  depthToMeasurementContext,
  detectDefects,
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
    expect(summary.spatialCoverage).toBe(0.043);
  });

  it("caps spatial coverage at 1.0", () => {
    const detections: DetectionResult[] = [
      { defect_type: "crack", confidence: 0.9, x_center: 0.5, y_center: 0.5, width: 1.0, height: 1.0, class_id: 0 },
      { defect_type: "spalling", confidence: 0.8, x_center: 0.5, y_center: 0.5, width: 0.5, height: 0.5, class_id: 1 },
    ];
    const summary = detectionSummary(detections);
    expect(summary.spatialCoverage).toBe(1.0);
  });

  it("correctly identifies high vs low confidence detections", () => {
    const detections: DetectionResult[] = [
      { defect_type: "crack", confidence: 0.9, x_center: 0.5, y_center: 0.5, width: 0.1, height: 0.1, class_id: 0 },
      { defect_type: "crack", confidence: 0.69, x_center: 0.5, y_center: 0.5, width: 0.1, height: 0.1, class_id: 0 },
      { defect_type: "spalling", confidence: 0.7, x_center: 0.5, y_center: 0.5, width: 0.1, height: 0.1, class_id: 1 },
      { defect_type: "spalling", confidence: 0.2, x_center: 0.5, y_center: 0.5, width: 0.1, height: 0.1, class_id: 1 },
    ];
    const summary = detectionSummary(detections);
    expect(summary.highConfidenceCount).toBe(2);
  });

  it("rounds average confidence to 3 decimal places", () => {
    const detections: DetectionResult[] = [
      { defect_type: "crack", confidence: 0.33, x_center: 0.5, y_center: 0.5, width: 0.1, height: 0.1, class_id: 0 },
      { defect_type: "crack", confidence: 0.33, x_center: 0.5, y_center: 0.5, width: 0.1, height: 0.1, class_id: 0 },
      { defect_type: "crack", confidence: 0.34, x_center: 0.5, y_center: 0.5, width: 0.1, height: 0.1, class_id: 0 },
    ];
    const summary = detectionSummary(detections);
    expect(summary.avgConfidence).toBe(0.333);
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

describe("detectDefects", () => {
  const mockBuffer = Buffer.from("fake-image-data");
  const mockMimeType = "image/jpeg";

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns parsed JSON on successful detection", async () => {
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
      model_versions: { model: "v1" },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponse),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await detectDefects(mockBuffer, mockMimeType);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockResponse);
  });

  it("returns null when fetch response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await detectDefects(mockBuffer, mockMimeType);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it("returns null when fetch throws an error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await detectDefects(mockBuffer, mockMimeType);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });
});
