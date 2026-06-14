# BuildScan AI

BuildScan AI is a Vercel-ready web MVP for visual construction inspection. It turns a phone, laptop webcam, or browser-visible external camera into a field inspection console: capture an image, score image quality, send the image to a paid visual AI model, return a strict diagnosis JSON, draw visual evidence markers, save reports in Supabase, and match the issue with qualified installers.

## Current Status

- Frontend: complete MVP inspection console.
- Backend: API routes for health, visual analysis, analytics, reports, and installer matching.
- Database: Supabase SQL schema with installers, reports, storage bucket, analytics views, and risk queue views.
- Deployment target: Vercel.
- GitHub repo: `Pablodd1/Binnovatonrooms`.
- Local verification: `npm run lint` and `npm run build` pass.

## Core Features

- Camera capture from phone, laptop webcam, USB/UVC camera, borescope, or other camera exposed by the browser.
- Manual image upload fallback for FLIR/thermal captures, screenshots, or photos from other devices.
- Automatic capture refresh every 2 seconds while the camera is active.
- Client-side image quality scoring for brightness and sharpness.
- Visual scan grid overlay for field framing.
- OpenAI Responses API call with vision input and strict structured JSON output.
- Diagnosis fields: defect type, severity, location, likely cause, action plan, urgency, required specialist, evidence, measurements, risks, confidence, human-review flag, and visual indicator boxes.
- Evidence boxes rendered over the captured image.
- Supabase Storage image upload when configured.
- Supabase report persistence when configured.
- Installer matching by specialty, rating, and distance when GPS is available.
- Dashboard KPIs and demo analytics fallback when Supabase is not configured.
- Recent/risk report queue with assignment-style statuses.
- Inspection playbook that reacts to image quality, GPS state, and severity.
- JSON export of the current diagnosis for tickets, CRM, insurance, or QA records.

## Stack

- Next.js App Router
- React
- TypeScript
- OpenAI SDK with Responses API
- Supabase Postgres and Storage
- Vercel
- Lucide icons
- Plain CSS, no heavy UI framework

## App Structure

```text
src/app/page.tsx                         Main inspection console
src/app/globals.css                      UI styling
src/app/api/analyze/route.ts             Paid visual AI diagnosis endpoint
src/app/api/analytics/route.ts           KPI and trend analytics endpoint
src/app/api/reports/route.ts             Recent/risk report queue endpoint
src/app/api/installers/match/route.ts    Installer matching endpoint
src/app/api/health/route.ts              Environment health endpoint
src/lib/analysis-schema.ts               Strict diagnosis schema and TS types
src/lib/analytics.ts                     Analytics aggregation and demo data
src/lib/reports.ts                       Report queue normalization and demo data
src/lib/installer-match.ts               Supabase installer matching wrapper
src/lib/supabase-admin.ts                Service-role Supabase client
src/lib/vision-prompt.ts                 Spanish inspection prompt
supabase/schema.sql                      Database, views, functions, demo installers
```

## Environment Variables

Create `.env.local` locally and add the same values in Vercel Project Settings.

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.5

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_BUCKET=inspection-images

NEXT_PUBLIC_APP_URL=https://your-vercel-app.vercel.app
```

Notes:

- `OPENAI_API_KEY` is required for `/api/analyze`.
- `OPENAI_MODEL` is configurable. Use the best paid vision model available in your OpenAI account.
- Supabase variables are required for persistence, image storage, analytics from real reports, and installer matching.
- Without Supabase variables, `/api/analytics` and `/api/reports` return demo data so the UI remains usable.

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open:

```text
http://localhost:3000
```

Useful checks:

```bash
npm run lint
npm run build
```

On this Windows machine, Next may print an optional SWC native binding warning. The production build still completes successfully with the current `--webpack` scripts.

## Deploy to Vercel

1. Push the repo to GitHub.
2. Import `Pablodd1/Binnovatonrooms` into Vercel.
3. Add all environment variables from `.env.example`.
4. Deploy.
5. Test `/api/health` after deployment.

## Supabase Setup

1. Create a Supabase project.
2. Open SQL Editor.
3. Run:

```sql
-- paste and run supabase/schema.sql
```

4. Confirm the `inspection-images` bucket exists.
5. Add real installers to `public.instaladores`.
6. Keep `SUPABASE_SERVICE_ROLE_KEY` only on the server/Vercel side.

## Database Objects

Tables:

- `public.instaladores`: installer directory with specialties, location, rating, contact fields, and active flag.
- `public.reportes`: AI diagnosis reports with image URL, camera label, location, GPS, quality JSON, and diagnosis JSON.

Functions:

- `public.distance_km(...)`: distance calculation for installer matching.
- `public.unaccent_safe(...)`: simple ASCII-safe text normalization.
- `public.match_installers(...)`: specialty and distance-aware matching RPC.

Views:

- `public.reportes_analytics_daily`: daily counts and averages by defect, severity, and specialist.
- `public.reportes_risk_queue`: high-risk report queue.
- `public.reportes_recent_queue`: recent operational queue with status.

Storage:

- `inspection-images`: stores inspection captures.

## API Routes

### `GET /api/health`

Returns whether OpenAI and Supabase are configured.

### `POST /api/analyze`

Receives multipart form data:

- `image`: required image file.
- `cameraLabel`: camera/device label.
- `locationLabel`: room/area text.
- `lidarNotes`: manual LiDAR, thermal, or measurement notes.
- `qualityNotes`: brightness/sharpness context.
- `lat`, `lng`: optional GPS.

Returns:

- `reportId`
- `diagnosis`
- `installers`
- `imageUrl`
- `model`

### `GET /api/analytics`

Returns:

- total reports
- severe reports
- review rate
- average confidence
- average urgency
- severity distribution
- defect distribution
- specialist distribution
- weekly trend
- recent operational signals

Uses Supabase when configured, otherwise demo data.

### `GET /api/reports`

Returns a recent/risk report queue with:

- defect type
- severity
- specialist
- location
- confidence
- urgency
- risk score
- status

Uses Supabase when configured, otherwise demo data.

### `POST /api/installers/match`

Receives a diagnosis and optional GPS, returns matched installers.

## Diagnosis JSON Shape

The AI is forced to return a strict JSON object with:

- `tipo_defecto`: `grieta`, `humedad`, `oxido`, `desplome`, `instalacion`, `acabado`, or `otro`
- `severidad`: `baja`, `media`, `alta`, or `critica`
- `ubicacion`
- `causa_probable`
- `solucion_paso_a_paso`
- `urgencia_dias`
- `especialista_requerido`
- `mediciones_recomendadas`
- `riesgos`
- `confianza`
- `evidencia_visual`
- `visual_indicators`: percentage-based boxes for UI overlay
- `requiere_revision_humana`

## Hardware Support

Web MVP:

- iPhone/iPad camera through the browser.
- Laptop webcam.
- USB/UVC cameras when the browser exposes them.
- Borescopes that appear as camera devices.
- FLIR/thermal screenshots via image upload, or camera mode if exposed by the OS/browser.

Important limitation:

- Native iPhone LiDAR depth maps and ARKit scene reconstruction are not fully available to a Vercel web app. This MVP accepts LiDAR/measurement notes manually.

Native app phase:

- Add React Native/Expo or native iOS shell.
- Use ARKit scene depth and scene reconstruction.
- Run YOLO/Core ML on device for offline bounding boxes.
- Send high-resolution captures to cloud AI only when the user taps Analyze.

## What We Have vs. Stronger Systems

Current MVP:

- Fast browser capture.
- Paid cloud visual diagnosis.
- Structured JSON diagnosis.
- Image evidence markers.
- Installer matching.
- Analytics dashboard.
- Risk queue.
- JSON export.

What stronger systems add:

- Local YOLO/segmentation model for cracks, dampness, corrosion, spalling, stains, and finish issues.
- Core ML export for native iPhone edge detection.
- Real LiDAR/ARKit geometry for metric sizing.
- Thermal/RGB/LiDAR sensor fusion.
- Human reviewer workflow.
- Before/after repair validation.
- Installer performance analytics.

## Analytics Opportunities

- Defect hotspots by property, room, wall, floor, ceiling, and installer.
- Severity trend by week and defect type.
- AI confidence vs. human reviewer correction rate.
- Camera quality score vs. diagnosis confidence.
- Repeat defect detection after repair.
- Thermal/LiDAR/RGB correlation for hidden moisture or surface deformation.
- Installer response time, repair close rate, recurrence rate, and customer rating.
- Regional defect trends for material, climate, and subcontractor quality.

## Field Workflow

1. Select camera source.
2. Capture or upload image.
3. Add location/area notes.
4. Add LiDAR, thermal, or manual measurement notes when available.
5. Check brightness and sharpness.
6. Analyze.
7. Review severity, evidence, risk score, urgency, and recommended measurements.
8. Match installer.
9. Export JSON or save report in Supabase.
10. Reinspect after repair for validation.

## Roadmap

Near term:

- Add auth and user/project separation.
- Add report detail page.
- Add reviewer status updates.
- Add CSV/JSON export for analytics.
- Add installer admin form.
- Add signed URLs for private image storage.

Native/mobile:

- React Native or native iOS app shell.
- ARKit/LiDAR depth capture.
- Core ML YOLO edge detection.
- Offline scan mode.
- AR bounding boxes.

AI/model:

- Train defect-specific YOLO/segmentation model.
- Add confidence calibration from human review.
- Add multi-image comparison for before/after repair.
- Add thermal image prompt path.

Operations:

- Assignment workflow.
- SLA tracking.
- Installer scorecards.
- Customer-facing report PDF.

## Useful Public References

- MDN `getUserMedia()` for camera streams.
- MDN `enumerateDevices()` for connected media inputs.
- Apple ARKit scene reconstruction and scene depth for native LiDAR workflows.
- OpenAI Responses API, image inputs, and Structured Outputs.
- Roboflow Universe datasets for cracks, damp walls, corrosion, delamination, paint damage, wall defects, and construction inspection.
