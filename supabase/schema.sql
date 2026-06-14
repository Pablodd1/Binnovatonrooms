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
  lat double precision,
  lng double precision,
  rating numeric(2, 1) check (rating is null or (rating >= 0 and rating <= 5)),
  telefono text,
  email text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
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
  lat double precision,
  lng double precision,
  quality jsonb,
  created_at timestamptz not null default now()
);

create index if not exists instaladores_activo_idx on public.instaladores (activo);
create index if not exists instaladores_especialidades_idx on public.instaladores using gin (especialidades);
create index if not exists reportes_created_at_idx on public.reportes (created_at desc);
create index if not exists reportes_severidad_idx on public.reportes (severidad);

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
    'áéíóúÁÉÍÓÚñÑüÜ',
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
        where lower(unaccent_safe(specialty)) in (
          select lower(unaccent_safe(x)) from unnest(required_specialties) x
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
  limit greatest(1, max_results);
$$;

alter table public.instaladores enable row level security;
alter table public.reportes enable row level security;

drop policy if exists "Public can read active installers" on public.instaladores;
create policy "Public can read active installers"
on public.instaladores for select
using (activo = true);

drop policy if exists "Service role manages installers" on public.instaladores;
create policy "Service role manages installers"
on public.instaladores for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role manages reports" on public.reportes;
create policy "Service role manages reports"
on public.reportes for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

insert into storage.buckets (id, name, public)
values ('inspection-images', 'inspection-images', true)
on conflict (id) do nothing;

insert into public.instaladores (nombre, empresa, especialidades, ciudad, estado, rating, telefono, email)
values
  ('Demo Electricista', 'BuildScan Partner', array['electricista', 'instalacion'], 'Miami', 'FL', 4.8, '+1-000-000-0000', 'electricista@example.com'),
  ('Demo Impermeabilizador', 'BuildScan Partner', array['impermeabilizador', 'humedad'], 'Miami', 'FL', 4.7, '+1-000-000-0001', 'humedad@example.com'),
  ('Demo Estructurista', 'BuildScan Partner', array['estructurista', 'desplome'], 'Miami', 'FL', 4.9, '+1-000-000-0002', 'estructura@example.com')
on conflict do nothing;
