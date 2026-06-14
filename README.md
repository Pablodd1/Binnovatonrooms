# BuildScan AI

MVP web para inspeccion visual de obras. Corre en Vercel, usa camara del telefono/laptop o camaras externas soportadas por el navegador, manda una imagen de alta calidad a un modelo visual pagado, guarda reportes en Supabase y recomienda instaladores por especialidad.

## Stack

- Next.js App Router
- OpenAI Responses API with vision inputs and strict structured JSON output
- Supabase Postgres + Storage
- Vercel deployment

## Variables requeridas

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.5

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_BUCKET=inspection-images

NEXT_PUBLIC_APP_URL=https://your-vercel-app.vercel.app
```

`OPENAI_MODEL` is configurable. Keep `gpt-5.5` for highest-quality paid visual reasoning if it is enabled in your OpenAI account. If your account does not have that model yet, set it to your available top vision model.

## Supabase setup

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.
4. Confirm the `inspection-images` bucket exists and is public, or change storage policy to signed URLs for private deployments.
5. Add real installers to `public.instaladores`.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Add all environment variables from `.env.example`.
4. Deploy.

## Hardware notes

- Web MVP supports browser camera access through `navigator.mediaDevices`.
- Laptop webcams, USB/UVC cameras and many borescopes work when the browser exposes them as video inputs.
- iPhone/iPad camera works in Safari/Chrome. Native ARKit LiDAR depth is not exposed as a full web API, so this MVP accepts LiDAR/measurement notes manually.
- Production native iOS phase should add ARKit + Core ML for real LiDAR depth maps, on-device YOLO, and live bounding boxes.

## What we have vs. stronger systems

Current MVP:

- Fast web capture for phone/laptop/external browser cameras.
- Paid cloud visual diagnosis through OpenAI vision.
- Strict JSON output for defect type, severity, evidence, urgency, specialist, and visual indicators.
- Supabase report storage, installer matching, and analytics endpoint.
- Dashboard KPIs, defect distribution, weekly trend, risk meter, recent report queue, and evidence boxes over the image.
- JSON export for the current diagnosis so field teams can attach results to tickets, CRMs, or insurance workflows.

Open-source/commercial pattern to add next:

- Train a local YOLO/segmentation model on defect datasets for crack, damp, corrosion, spalling, stains, and finish issues.
- Export the local model to Core ML for native iPhone edge detection.
- Use ARKit scene depth/scene reconstruction in a native app shell for true LiDAR geometry and metric defect sizing.
- Store per-defect bounding boxes/masks, floor/room metadata, thermal camera metadata, and before/after repair validation.
- Add reviewer workflow: queue high-risk reports, confirm AI diagnosis, assign installer, track repair outcome.

Useful public references:

- MDN documents `getUserMedia()` for camera streams and `enumerateDevices()` for connected media inputs.
- Apple ARKit documentation describes LiDAR scene reconstruction and scene depth for native iOS.
- OpenAI docs describe Responses API, image inputs, and Structured Outputs.
- Roboflow Universe has public datasets/models for crack, dampness, corrosion, delamination, paint damage, wall defects, and similar construction defects.

## Analytics opportunities

- Defect hotspots by property, room, wall/floor/ceiling zone, and installer.
- Severity trend by week and by defect type.
- AI confidence vs. human reviewer correction rate.
- Camera quality score vs. diagnosis confidence.
- Repeat defect detection after repair to validate installer work.
- Thermal/LiDAR/RGB correlation for hidden moisture and surface deformation.
- Installer lead quality: response time, repair close rate, recurrence rate, customer rating.

## API routes

- `GET /api/health` checks environment wiring.
- `GET /api/analytics` returns KPI, severity, defect, specialist, weekly trend, and signal aggregates.
- `GET /api/reports` returns the recent inspection queue for review/assignment.
- `POST /api/analyze` receives an image, runs visual diagnosis, stores the report when Supabase is configured, and returns installer matches.
