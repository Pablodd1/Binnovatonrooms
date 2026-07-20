---
title: BuildScan Detection Service
emoji: 🔍
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# BuildScan Detection Service

Python FastAPI microservice for construction defect detection. Part of the [BuildScan AI](https://github.com/Pablodd1/Binnovatonrooms) inspection platform.

## What it does

- **YOLOv8 object detection** — finds cracks, spalling, corrosion, exposed rebar, moisture stains
- **Depth Anything V2** — monocular depth estimation for surface analysis
- **SAHI sliced inference** — 512x512 tiles with 20% overlap for small-defect detection
- **Batch processing** — up to 6 images per request

## Endpoints

- `GET /health` — service status, device, model load state
- `POST /detect` — single image detection + optional depth
- `POST /detect-batch` — multi-image batch (max 6), merges duplicate detections

## Configuration

Set these as HF Spaces **Secrets** or **Variables**:

| Variable | Default | Purpose |
|----------|---------|---------|
| `YOLO_MODEL_PATH` | `cazzz307/yolov8-crack-detection` | HuggingFace YOLO model repo |
| `CORS_ORIGINS` | (none) | Comma-separated allowed origins (your Vercel app URL) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Fallback CORS origin |

## First start

The service downloads ~125MB of model weights on first cold start (YOLO + Depth Anything V2). Subsequent restarts use the cached weights from `/data`.
