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
