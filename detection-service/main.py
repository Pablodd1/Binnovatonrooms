import io
import os
import time
import logging
from typing import Optional
from contextlib import asynccontextmanager

import cv2
import numpy as np
import torch
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("detection-service")

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
logger.info(f"Using device: {DEVICE}")

yolo_model = None
depth_model = None
depth_processor = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global yolo_model, depth_model, depth_processor
    logger.info("Loading models...")
    try:
        from ultralytics import YOLO
        yolo_model = YOLO("yolov8m.pt")
        logger.info("YOLO model loaded")
    except Exception as e:
        logger.error(f"Failed to load YOLO: {e}")

    try:
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation
        depth_processor = AutoImageProcessor.from_pretrained("depth-anything/Depth-Anything-V2-Small-hf")
        depth_model = AutoModelForDepthEstimation.from_pretrained("depth-anything/Depth-Anything-V2-Small-hf").to(DEVICE)
        logger.info("Depth Anything V2 loaded")
    except Exception as e:
        logger.error(f"Failed to load Depth model: {e}")

    yield
    logger.info("Shutting down...")


app = FastAPI(
    title="BuildScan Detection Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DetectionResult(BaseModel):
    defect_type: str
    confidence: float
    x_center: float
    y_center: float
    width: float
    height: float
    class_id: int


class DepthResult(BaseModel):
    width: int
    height: int
    min_depth: float
    max_depth: float
    mean_depth: float
    depth_map_url: Optional[str] = None


class AnalysisResponse(BaseModel):
    detections: list[DetectionResult]
    depth: Optional[DepthResult] = None
    processing_time_ms: float
    device: str
    model_versions: dict


def run_yolo_inference(image: Image.Image, confidence: float = 0.25) -> list[DetectionResult]:
    if yolo_model is None:
        raise HTTPException(status_code=503, detail="YOLO model not loaded")

    start = time.time()
    img_array = np.array(image)

    if img_array.shape[2] == 4:
        img_array = cv2.cvtColor(img_array, cv2.COLOR_RGBA2RGB)

    results = yolo_model.predict(
        img_array,
        conf=confidence,
        device=DEVICE,
        verbose=False,
        imgsz=640,
    )

    detections = []
    for result in results:
        if result.boxes is not None:
            for box in result.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                conf = box.conf[0].item()
                cls = int(box.cls[0].item())

                img_h, img_w = img_array.shape[:2]
                x_center = ((x1 + x2) / 2) / img_w
                y_center = ((y1 + y2) / 2) / img_h
                w = (x2 - x1) / img_w
                h = (y2 - y1) / img_h

                class_name = yolo_model.names.get(cls, f"class_{cls}")

                detections.append(DetectionResult(
                    defect_type=class_name,
                    confidence=round(conf, 4),
                    x_center=round(x_center, 4),
                    y_center=round(y_center, 4),
                    width=round(w, 4),
                    height=round(h, 4),
                    class_id=cls,
                ))

    elapsed = (time.time() - start) * 1000
    logger.info(f"YOLO inference: {len(detections)} detections in {elapsed:.0f}ms")
    return detections


def run_depth_estimation(image: Image.Image) -> DepthResult:
    if depth_model is None or depth_processor is None:
        raise HTTPException(status_code=503, detail="Depth model not loaded")

    start = time.time()
    inputs = depth_processor(images=image, return_tensors="pt").to(DEVICE)

    with torch.no_grad():
        outputs = depth_model(**inputs)
        predicted_depth = outputs.predicted_depth

    interpolated = torch.nn.functional.interpolate(
        predicted_depth.unsqueeze(1),
        size=image.size[::-1],
        mode="bicubic",
        align_corners=False,
    )

    depth_map = interpolated.squeeze().cpu().numpy()

    result = DepthResult(
        width=int(depth_map.shape[1]),
        height=int(depth_map.shape[0]),
        min_depth=round(float(depth_map.min()), 4),
        max_depth=round(float(depth_map.max()), 4),
        mean_depth=round(float(depth_map.mean()), 4),
    )

    elapsed = (time.time() - start) * 1000
    logger.info(f"Depth estimation: {depth_map.shape} in {elapsed:.0f}ms")
    return result


def run_sahi_inference(image: Image.Image, confidence: float = 0.25) -> list[DetectionResult]:
    if yolo_model is None:
        raise HTTPException(status_code=503, detail="YOLO model not loaded")

    try:
        from sahi import AutoDetectionModel
        from sahi.predict import get_sliced_prediction

        sahi_model = AutoDetectionModel.from_pretrained(
            model_type="ultralytics",
            model_path="yolov8m.pt",
            confidence_threshold=confidence,
            device=DEVICE,
        )

        img_array = np.array(image)
        if img_array.shape[2] == 4:
            img_array = cv2.cvtColor(img_array, cv2.COLOR_RGBA2RGB)

        result = get_sliced_prediction(
            image=img_array,
            detection_model=sahi_model,
            slice_height=512,
            slice_width=512,
            overlap_height_ratio=0.2,
            overlap_width_ratio=0.2,
        )

        detections = []
        img_h, img_w = img_array.shape[:2]

        for pred in result.object_prediction_list:
            bbox = pred.bbox
            x_center = ((bbox.minx + bbox.maxx) / 2) / img_w
            y_center = ((bbox.miny + bbox.maxy) / 2) / img_h
            w = (bbox.maxx - bbox.minx) / img_w
            h = (bbox.maxy - bbox.miny) / img_h

            detections.append(DetectionResult(
                defect_type=pred.category.name,
                confidence=round(pred.score.value, 4),
                x_center=round(x_center, 4),
                y_center=round(y_center, 4),
                width=round(w, 4),
                height=round(h, 4),
                class_id=pred.category.id,
            ))

        logger.info(f"SAHI inference: {len(detections)} detections")
        return detections

    except ImportError:
        logger.warning("SAHI not available, falling back to standard YOLO")
        return run_yolo_inference(image, confidence)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "device": DEVICE,
        "yolo_loaded": yolo_model is not None,
        "depth_loaded": depth_model is not None,
    }


@app.post("/detect", response_model=AnalysisResponse)
async def detect(
    file: UploadFile = File(...),
    confidence: float = Form(0.25),
    use_sahi: bool = Form(True),
    include_depth: bool = Form(True),
):
    start = time.time()

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    contents = await file.read()
    if len(contents) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 20MB)")

    try:
        image = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image format")

    detections = run_sahi_inference(image, confidence) if use_sahi else run_yolo_inference(image, confidence)

    depth = None
    if include_depth:
        try:
            depth = run_depth_estimation(image)
        except Exception as e:
            logger.warning(f"Depth estimation failed: {e}")

    elapsed = (time.time() - start) * 1000

    return AnalysisResponse(
        detections=detections,
        depth=depth,
        processing_time_ms=round(elapsed, 2),
        device=DEVICE,
        model_versions={
            "yolo": "yolov8m",
            "depth": "Depth-Anything-V2-Small",
            "sahi": "sahi" if use_sahi else "none",
        },
    )


# Use a global ThreadPoolExecutor to avoid creating a new pool for every request
from concurrent.futures import ThreadPoolExecutor
inference_pool = ThreadPoolExecutor(max_workers=3)

@app.post("/detect-batch")
async def detect_batch(
    files: list[UploadFile] = File(...),
    confidence: float = Form(0.25),
    use_sahi: bool = Form(True),
    include_depth: bool = Form(True),
):
    start = time.time()

    import asyncio
    loop = asyncio.get_running_loop()

    # Fast concurrent async read
    async def process_file(file):
        if not file.content_type or not file.content_type.startswith("image/"):
            return None
        contents = await file.read()
        try:
            return Image.open(io.BytesIO(contents)).convert("RGB")
        except Exception:
            return None

    tasks = [process_file(f) for f in files[:6]]
    images = await asyncio.gather(*tasks)

    def run_models(img):
        dets = run_sahi_inference(img, confidence) if use_sahi else run_yolo_inference(img, confidence)
        dep = None
        if include_depth:
            try:
                dep = run_depth_estimation(img)
            except Exception:
                pass
        return dets, dep

    all_detections = []
    depths = []

    inference_tasks = []
    for img in images:
        if img is not None:
            inference_tasks.append(loop.run_in_executor(inference_pool, run_models, img))

    if inference_tasks:
        results = await asyncio.gather(*inference_tasks)
        for dets, dep in results:
            all_detections.extend(dets)
            if dep is not None:
                depths.append(dep)

    elapsed = (time.time() - start) * 1000

    merged_detections = _merge_detections(all_detections)

    return {
        "detections": merged_detections,
        "depths": depths,
        "processing_time_ms": round(elapsed, 2),
        "image_count": len(files),
        "device": DEVICE,
    }


def _merge_detections(detections: list[DetectionResult]) -> list[DetectionResult]:
    if not detections:
        return []

    merged = {}
    for det in detections:
        key = (det.defect_type, round(det.x_center, 2), round(det.y_center, 2))
        if key not in merged or det.confidence > merged[key].confidence:
            merged[key] = det

    return sorted(merged.values(), key=lambda d: d.confidence, reverse=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)