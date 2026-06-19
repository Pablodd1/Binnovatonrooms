-- Production migration: add user_id, improve indexes, add constraints
-- Run after the base schema

alter table public.reportes
  add column if not exists user_id uuid,
  add column if not exists risk_score integer generated always as (
    case severidad
      when 'critica' then 100
      when 'alta' then 78
      when 'media' then 46
      else 18
    end
  ) stored,
  add column if not exists status text generated always as (
    case
      when severidad = 'critica' then 'asignar'::text
      when severidad = 'alta' then 'revision'::text
      else 'nuevo'::text
    end
  ) stored;

alter table public.report_images
  alter column quality set default '{}';

create index if not exists reportes_user_id_idx on public.reportes (user_id);
create index if not exists reportes_risk_score_idx on public.reportes (risk_score desc);
create index if not exists reportes_status_idx on public.reportes (status);
create index if not exists reportes_lat_lng_idx on public.reportes (lat, lng);

-- Update RLS policies for authenticated access
drop policy if exists "Users can read own reports" on public.reportes;
create policy "Users can read own reports"
  on public.reportes for select
  using (user_id = auth.uid() or (select auth.role()) = 'service_role');

-- Validate diagnostico JSONB
alter table public.reportes
  add constraint reportes_diagnostico_is_object
  check (diagnostico is null or jsonb_typeof(diagnostico) = 'object');

-- Storage: add signed URL support
drop policy if exists "Authenticated users can read signed inspection images" on storage.objects;
create policy "Authenticated users can read signed inspection images"
  on storage.objects for select
  using (bucket_id = 'inspection-images' and auth.role() = 'authenticated');