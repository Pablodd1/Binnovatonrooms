create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'defect_severity') then
    create type defect_severity as enum ('baja', 'media', 'alta', 'critica');
  end if;
end $$;

create table if not exists public.instaladores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  empresa text,
  especialidades text[] not null default '{}',
  ciudad text,
  estado text,
  lat double precision check (lat is null or (lat >= -90 and lat <= 90)),
  lng double precision check (lng is null or (lng >= -180 and lng <= 180)),
  rating numeric(2, 1) check (rating is null or (rating >= 0 and rating <= 5)),
  telefono text,
  email text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reportes (
  id uuid primary key default gen_random_uuid(),
  tipo_defecto text not null,
  severidad defect_severity not null,
  especialista_requerido text not null,
  diagnostico jsonb not null,
  image_url text,
  camera_label text,
  location_label text,
  lat double precision check (lat is null or (lat >= -90 and lat <= 90)),
  lng double precision check (lng is null or (lng >= -180 and lng <= 180)),
  quality jsonb,
  user_id uuid,
  risk_score integer generated always as (
    case severidad
      when 'critica' then 100
      when 'alta' then 78
      when 'media' then 46
      else 18
    end
  ) stored,
  status text not null default 'nuevo' check (status in ('nuevo', 'revision', 'asignar', 'cerrado')),
  closed_reason text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reportes
  drop constraint if exists reportes_diagnostico_is_object;
alter table public.reportes
  add constraint reportes_diagnostico_is_object
  check (jsonb_typeof(diagnostico) = 'object');

create table if not exists public.report_images (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reportes(id) on delete cascade,
  sort_order integer not null default 1 check (sort_order > 0),
  image_url text,
  mime_type text,
  size_bytes integer check (size_bytes is null or size_bytes >= 0),
  quality jsonb default '{}',
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists instaladores_touch_updated_at on public.instaladores;
create trigger instaladores_touch_updated_at
before update on public.instaladores
for each row execute function public.touch_updated_at();

drop trigger if exists reportes_touch_updated_at on public.reportes;
create trigger reportes_touch_updated_at
before update on public.reportes
for each row execute function public.touch_updated_at();

create index if not exists instaladores_activo_idx on public.instaladores (activo);
create index if not exists instaladores_active_specialties_idx on public.instaladores using gin (especialidades) where activo = true;
create index if not exists instaladores_active_rating_idx on public.instaladores (rating desc nulls last, created_at desc) where activo = true;
create index if not exists reportes_created_at_idx on public.reportes (created_at desc);
create index if not exists reportes_severidad_created_idx on public.reportes (severidad, created_at desc);
create index if not exists reportes_tipo_created_idx on public.reportes (tipo_defecto, created_at desc);
create index if not exists reportes_diagnostico_gin_idx on public.reportes using gin (diagnostico jsonb_path_ops);
create index if not exists report_images_report_order_idx on public.report_images (report_id, sort_order);
create index if not exists reportes_user_id_idx on public.reportes (user_id);
create index if not exists reportes_risk_score_idx on public.reportes (risk_score desc);
create index if not exists reportes_status_workflow_idx on public.reportes (status, created_at desc);
create index if not exists reportes_lat_lng_idx on public.reportes (lat, lng);

create or replace function public.distance_km(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 6371 * 2 * asin(
      sqrt(
        power(sin(radians((lat2 - lat1) / 2)), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians((lng2 - lng1) / 2)), 2)
      )
    )
  end
$$;

create or replace function public.unaccent_safe(input text)
returns text
language sql
immutable
as $$
  select translate(
    coalesce(input, ''),
    U&'\00E1\00E9\00ED\00F3\00FA\00C1\00C9\00CD\00D3\00DA\00F1\00D1\00FC\00DC',
    'aeiouAEIOUnNuU'
  )
$$;

create or replace function public.match_installers(
  required_specialties text[],
  user_lat double precision default null,
  user_lng double precision default null,
  max_results integer default 5
)
returns table (
  id uuid,
  nombre text,
  empresa text,
  especialidades text[],
  ciudad text,
  estado text,
  rating numeric,
  distancia_km double precision,
  telefono text,
  email text
)
language sql
stable
as $$
  with normalized as (
    select
      i.*,
      public.distance_km(user_lat, user_lng, i.lat, i.lng) as distancia_km,
      exists (
        select 1
        from unnest(i.especialidades) specialty
        where lower(public.unaccent_safe(specialty)) in (
          select lower(public.unaccent_safe(x)) from unnest(required_specialties) x
        )
      ) as specialty_match
    from public.instaladores i
    where i.activo = true
  )
  select
    n.id,
    n.nombre,
    n.empresa,
    n.especialidades,
    n.ciudad,
    n.estado,
    n.rating,
    n.distancia_km,
    n.telefono,
    n.email
  from normalized n
  where n.specialty_match = true
  order by
    n.distancia_km nulls last,
    n.rating desc nulls last,
    n.created_at desc
  limit least(20, greatest(1, max_results));
$$;

create or replace view public.reportes_analytics_daily as
select
  date_trunc('day', created_at)::date as day,
  tipo_defecto,
  severidad,
  status,
  especialista_requerido,
  count(*) as report_count,
  avg(nullif(diagnostico->>'confianza', '')::numeric) as avg_confidence,
  avg(nullif(diagnostico->>'urgencia_dias', '')::numeric) as avg_urgency_days,
  count(*) filter (where coalesce((diagnostico->>'requiere_revision_humana')::boolean, false) = true) as human_review_count
from public.reportes
group by 1, 2, 3, 4, 5;

create or replace view public.reportes_risk_queue as
select
  id,
  created_at,
  tipo_defecto,
  severidad,
  especialista_requerido,
  location_label,
  image_url,
  diagnostico,
  status,
  case severidad
    when 'critica' then 100
    when 'alta' then 78
    when 'media' then 46
    else 18
  end as risk_score
from public.reportes
where severidad in ('alta', 'critica') and status != 'cerrado'
order by risk_score desc, created_at desc;

create or replace view public.reportes_recent_queue as
select
  id,
  created_at,
  tipo_defecto,
  severidad,
  especialista_requerido,
  location_label,
  image_url,
  nullif(diagnostico->>'confianza', '')::numeric as confidence,
  nullif(diagnostico->>'urgencia_dias', '')::integer as urgency_days,
  status
from public.reportes
where status != 'cerrado'
order by created_at desc
limit 50;

alter table public.instaladores enable row level security;
alter table public.reportes enable row level security;
alter table public.report_images enable row level security;

drop policy if exists "Public can read active installers" on public.instaladores;
create policy "Public can read active installers"
on public.instaladores for select
using (activo = true);

drop policy if exists "Service role manages installers" on public.instaladores;
create policy "Service role manages installers"
on public.instaladores for all
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

drop policy if exists "Service role manages reports" on public.reportes;
create policy "Service role manages reports"
on public.reportes for all
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

drop policy if exists "Users can read own reports" on public.reportes;
create policy "Users can read own reports"
on public.reportes for select
using (user_id = auth.uid() or (select auth.role()) = 'service_role');

drop policy if exists "Service role manages report images" on public.report_images;
create policy "Service role manages report images"
on public.report_images for all
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

drop policy if exists "Authenticated users can read signed inspection images" on storage.objects;
create policy "Authenticated users can read signed inspection images"
on storage.objects for select
using (bucket_id = 'inspection-images' and auth.role() = 'authenticated');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inspection-images',
  'inspection-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read inspection images" on storage.objects;
create policy "Public can read inspection images"
on storage.objects for select
using (bucket_id = 'inspection-images');

drop policy if exists "Service role manages inspection images" on storage.objects;
create policy "Service role manages inspection images"
on storage.objects for all
using (bucket_id = 'inspection-images' and (select auth.role()) = 'service_role')
with check (bucket_id = 'inspection-images' and (select auth.role()) = 'service_role');

insert into public.instaladores (nombre, empresa, especialidades, ciudad, estado, lat, lng, rating, telefono, email)
select *
from (
  values
    ('Demo Electricista', 'BuildScan Partner', array['electricista', 'instalacion'], 'Miami', 'FL', 25.7617, -80.1918, 4.8::numeric, '+1-000-000-0000', 'electricista@example.com'),
    ('Demo Impermeabilizador', 'BuildScan Partner', array['impermeabilizador', 'humedad'], 'Miami', 'FL', 25.7743, -80.1937, 4.7::numeric, '+1-000-000-0001', 'humedad@example.com'),
    ('Demo Estructurista', 'BuildScan Partner', array['estructurista', 'desplome'], 'Miami', 'FL', 25.7907, -80.1300, 4.9::numeric, '+1-000-000-0002', 'estructura@example.com'),
    ('Demo Plomero', 'BuildScan Partner', array['plomero', 'instalacion', 'humedad'], 'Miami', 'FL', 25.7290, -80.2374, 4.6::numeric, '+1-000-000-0003', 'plomero@example.com'),
    ('Demo Pintor', 'BuildScan Partner', array['pintor', 'acabado'], 'Miami', 'FL', 25.8120, -80.2040, 4.5::numeric, '+1-000-000-0004', 'pintor@example.com')
) as seed(nombre, empresa, especialidades, ciudad, estado, lat, lng, rating, telefono, email)
where not exists (
  select 1
  from public.instaladores existing
  where lower(existing.email) = lower(seed.email)
);

-- Report status transition function
create or replace function public.transition_report_status(
  target_id uuid,
  new_status text,
  reason text default null
)
returns table (id uuid, status text, closed_reason text, closed_at timestamptz)
language plpgsql
set search_path = public
as $$
declare
  current_status text;
  valid_transition boolean;
begin
  select r.status into current_status
  from public.reportes r
  where r.id = target_id;

  if not found then
    raise exception 'Reporte no encontrado: %', target_id;
  end if;

  -- Valid transitions: nuevo→revision, revision→asignar, asignar→cerrado, nuevo→cerrado
  valid_transition = (
    (current_status = 'nuevo' and new_status = 'revision') or
    (current_status = 'revision' and new_status = 'asignar') or
    (current_status = 'asignar' and new_status = 'cerrado') or
    (current_status = 'nuevo' and new_status = 'cerrado') or
    (current_status = 'revision' and new_status = 'cerrado')
  );

  if not valid_transition then
    raise exception 'Transicion invalida: % → %', current_status, new_status;
  end if;

  update public.reportes
  set
    status = new_status,
    closed_reason = case when new_status = 'cerrado' then coalesce(reason, '') else null end,
    closed_at = case when new_status = 'cerrado' then now() else null end,
    updated_at = now()
  where id = target_id
  returning id, status, closed_reason, closed_at
  into id, status, closed_reason, closed_at;

  return next;
end;
$$;
