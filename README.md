# BuildScan AI

BuildScan AI is a Vercel-ready web MVP for visual construction inspection. It turns a phone, laptop webcam, or browser-visible external camera into a field inspection console: capture an image, score image quality, send the image to Gemini vision, return a strict diagnosis JSON, draw visual evidence markers, save reports in Supabase, and match the issue with qualified installers.

## Current Status

- Frontend: complete MVP inspection console.
- Backend: API routes for health, visual analysis, analytics, reports, and installer matching.
- Database: Supabase SQL schema with installers, reports, storage bucket, analytics views, and risk queue views.
- Deployment target: Vercel.
- GitHub repo: `Pablodd1/Binnovatonrooms`.
- Local verification: `npm run lint` and `npm run build` pass.

## Core Features

- Camera capture from phone, laptop webcam, USB/UVC camera, borescope, or other camera exposed by the browser.
- Multi-photo inspection sets with up to 6 intentional captures per analysis.
- Manual multi-image upload fallback for FLIR/thermal captures, screenshots, or photos from other devices.
- Automatic quality refresh every 2 seconds while the camera is active without saving extra images.
- Client-side capture coach with P/A/R grading for brightness, sharpness, glare, contrast, resolution, and framing.
- Dynamic photo guidance for better position, distance, lighting, surface coverage, and measurement readiness.
- Visual scan grid overlay for field framing.
- Gemini API call with vision input and strict structured JSON output.
- Diagnosis fields: defect type, severity, location, likely cause, action plan, urgency, required specialist, evidence, measurements, risks, confidence, human-review flag, and visual indicator boxes.
- Evidence boxes rendered over the captured image.
- Supabase Storage image upload when configured.
- Supabase report persistence when configured.
- Installer matching by specialty, rating, and distance when GPS is available.
- Dashboard KPIs and demo analytics fallback when Supabase is not configured.
- Recent/risk report queue with assignment-style statuses.
- Inspection playbook that reacts to image quality, GPS state, and severity.
- Surface measurement readiness checks for capture quality plus visible scale, LiDAR, laser, or manual measurement notes.
- Recommended shot plan: frontal, rasante/lateral-light, close-up, context, and scale/thermal when available.
- JSON export of the current diagnosis for tickets, CRM, insurance, or QA records.

## Stack

- Next.js App Router
- React
- TypeScript
- Google Gen AI SDK for Gemini API
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
supabase/migrations/                     Supabase CLI migration
supabase/seed.sql                        Demo installer seed data
supabase/config.toml                     Local Supabase CLI config
```

## Environment Variables

Create `.env.local` locally and add the same values in Vercel Project Settings.

```bash
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_BUCKET=inspection-images

NEXT_PUBLIC_APP_URL=https://your-vercel-app.vercel.app
NEXT_PUBLIC_SITE_NAME=BuildScan AI
```

Notes:

- `GEMINI_API_KEY` is required for `/api/analyze`.
- `GEMINI_MODEL` is configurable. Default is `gemini-3.5-flash`; use a stronger Gemini Pro model if your account has access and latency/cost fit the workflow.
- Supabase variables are required for persistence, image storage, analytics from real reports, and installer matching.
- Without Supabase variables, `/api/analytics` and `/api/reports` return demo data so the UI remains usable.
- `NEXT_PUBLIC_SITE_NAME` is optional and useful if the app is later white-labeled.

Recommended future production variables:

- `AUTH_SECRET`: required when authentication/user accounts are added.
- `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_AUTH_TOKEN`: recommended for production error monitoring.
- `SUPABASE_SIGNED_URLS=true`: recommended when private customer images replace public MVP storage.
- Provider-specific billing/project variables: useful for account separation if your AI provider supports it.

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
npm run preflight
npm run supabase:start
npm run supabase:reset
npm run supabase:push
```

On this Windows machine, Next may print an optional SWC native binding warning. The production build still completes successfully with the current `--webpack` scripts.

## Production Readiness Checklist

Before exposing the app to real users:

- Set all required Vercel environment variables.
- Run `npm run preflight`.
- Run `supabase/schema.sql` in the production Supabase project.
- Replace demo installers with real verified installers.
- Confirm the `inspection-images` storage policy fits the business model. Public URLs are convenient for MVP demos; signed URLs are better for private customer data.
- Test `/api/health`; `ok` should be `true` when Gemini is configured.
- Test `/api/analyze` with JPEG, PNG, and WebP images under 10MB.
- Confirm Vercel Function logs do not show Gemini, Supabase, or storage failures.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Never expose it in client code.
- Add auth before storing customer-identifiable production reports.

Production guards already included:

- Security headers and Content Security Policy in `next.config.mjs`.
- Camera/geolocation permission policy scoped to the app.
- AI route rate limiting per forwarded IP.
- Image MIME and size validation.
- Sanitized prompt/context fields.
- Bounded GPS coordinates.
- Client-side capture coach to reduce low-quality images before paid AI calls.
- Graceful Gemini API error handling.
- Global app error boundary.
- Demo fallback data for analytics/report queues when Supabase is not configured.

## Deploy to Vercel

1. Push the repo to GitHub.
2. Import `Pablodd1/Binnovatonrooms` into Vercel.
3. Add all environment variables from `.env.example`.
4. Deploy.
5. Test `/api/health` after deployment.

## Supabase Setup

Option A: Supabase Dashboard

1. Create a Supabase project at `https://supabase.com/dashboard`.
2. Open SQL Editor.
3. Paste and run `supabase/schema.sql`.
4. Open Project Settings > API.
5. Copy:
   - Project URL to `NEXT_PUBLIC_SUPABASE_URL`
   - anon public key to `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key to `SUPABASE_SERVICE_ROLE_KEY`
6. Set `SUPABASE_BUCKET=inspection-images`.
7. Add those values in Vercel Project Settings > Environment Variables.

Option B: Supabase CLI

1. Install and log in:

```bash
npm install -g supabase
supabase login
```

2. Link your cloud project:

```bash
supabase link --project-ref your-project-ref
```

3. Push the migration:

```bash
npm run supabase:push
```

Local development with Supabase:

```bash
npm run supabase:start
npm run supabase:reset
```

After setup:

- Confirm the `inspection-images` bucket exists.
- Replace demo installers in `public.instaladores` with real verified installers.
- Keep `SUPABASE_SERVICE_ROLE_KEY` only on the server/Vercel side.
- Do not expose service-role keys in browser/client code.

## Database Objects

Tables:

- `public.instaladores`: installer directory with specialties, location, rating, contact fields, and active flag.
- `public.reportes`: AI diagnosis reports with image URL, camera label, location, GPS, quality JSON, and diagnosis JSON.
- `public.report_images`: per-photo metadata for multi-image inspection sets.

Functions:

- `public.distance_km(...)`: distance calculation for installer matching.
- `public.unaccent_safe(...)`: simple ASCII-safe text normalization.
- `public.match_installers(...)`: specialty and distance-aware matching RPC.

Views:

- `public.reportes_analytics_daily`: daily counts and averages by defect, severity, and specialist.
- `public.reportes_risk_queue`: high-risk report queue.
- `public.reportes_recent_queue`: recent operational queue with status.

Storage:

- `inspection-images`: public MVP bucket for inspection captures, restricted to JPEG, PNG, and WebP under 10MB each.

Security:

- RLS is enabled on all app tables.
- Public users can only read active installers.
- Reports and report images are managed by the server-side service role.
- Storage allows public reads for MVP image URLs and service-role writes.

## API Routes

### `GET /api/health`

Returns whether Gemini and Supabase are configured.

Production expectation: `ok` is `true` only when Gemini is configured. Supabase and Storage readiness are returned separately.

### `POST /api/analyze`

Receives multipart form data:

- `image`: required primary JPEG, PNG, or WebP image under 10MB.
- `images`: optional additional JPEG, PNG, or WebP images.
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
- `imageUrls`
- `model`

Protections:

- Rate limited.
- Rejects unsupported image types.
- Allows up to 6 images and 30MB total per inspection set.
- Sanitizes text fields.
- Bounds GPS coordinates.
- Sends inline image parts to Gemini and requests JSON output.

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
- Browser-only dimension calculations should be treated as estimates unless the image includes a known scale, manual measurement, laser/LiDAR reading, or future native depth payload.

## Capture Accuracy Guide

The app grades each capture before analysis:

- `P - Best`: strong light, sharpness, contrast, resolution, low glare, and centered surface. Best for diagnosis and measurement when scale/LiDAR notes are present.
- `A - Good`: usable for diagnosis, but one or two quality signals can improve.
- `R - Repeat`: low precision because of blur, glare, poor light, weak contrast, low resolution, or bad framing.

For maximum possible surface-dimension accuracy:

- Use photos instead of full video for the web MVP. Video should be a later keyframe-extraction workflow.
- Save 3-5 images per report: frontal, rasante/lateral-light, close-up, context, and scale/thermal if applicable.
- Fill 60-80% of the camera view with the target surface.
- Keep the phone parallel to the wall/floor/ceiling plane when possible.
- Use rasante/lateral light to show texture, cracks, swelling, and finish defects.
- Include a visible ruler, tile, known object, laser measurement, or manual LiDAR/Measure app value.
- Capture one straight-on image for dimensions and one angled/lateral-light image for defect texture.
- Use the native app phase for true ARKit/LiDAR scene depth and surface reconstruction.

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
2. Save or upload a multi-photo set.
3. Capture frontal, rasante, close-up, context, and scale/thermal images when available.
4. Add location/area notes.
5. Add LiDAR, thermal, laser, ruler, or manual measurement notes when available.
6. Check the P/A/R capture coach, distance/position guidance, and measurement readiness.
7. Analyze the set.
8. Review severity, evidence, risk score, urgency, and recommended measurements.
9. Match installer.
10. Export JSON or save report in Supabase.
11. Reinspect after repair for validation.

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
- Gemini API image understanding and structured outputs.
- Roboflow Universe datasets for cracks, damp walls, corrosion, delamination, paint damage, wall defects, and construction inspection.
