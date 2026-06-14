# BuildScan AI

MVP web para inspeccion visual de obras. Corre en Vercel, usa camara del telefono/laptop o camaras externas soportadas por el navegador, manda una imagen de alta calidad a un modelo visual pagado, guarda reportes en Supabase y recomienda instaladores por especialidad.

## Stack

- Next.js App Router
- OpenAI vision model via API
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
