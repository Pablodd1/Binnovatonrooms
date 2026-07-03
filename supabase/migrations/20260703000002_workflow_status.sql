-- Tier 2: Convert status from GENERATED ALWAYS to regular column
-- Adds workflow transitions, closed_reason, closed_at

-- Drop the generated status column (Postgres requires dropping generated cols)
alter table public.reportes drop column if exists status;

-- Re-add as a regular column with default and check constraint
alter table public.reportes
  add column status text not null default 'nuevo'
  check (status in ('nuevo', 'revision', 'asignar', 'cerrado'));

-- Auto-set initial status based on existing severity for existing rows
update public.reportes
set status = case
  when severidad = 'critica' then 'asignar'
  when severidad = 'alta' then 'revision'
  else 'nuevo'
end
where status = 'nuevo' and severidad in ('critica', 'alta');

-- Add closed_reason and closed_at columns
alter table public.reportes
  add column if not exists closed_reason text,
  add column if not exists closed_at timestamptz;

-- Index on status for filtering
create index if not exists reportes_status_workflow_idx on public.reportes (status, created_at desc);

-- Report status transition function
create or replace function public.transition_report_status(
  target_id uuid,
  new_status text,
  closed_reason text default null
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

  -- Valid transitions: nuevo→revision, revision→asignar, asignar→cerrado,
  --                      nuevo→cerrado, revision→cerrado
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
    closed_reason = case when new_status = 'cerrado' then coalesce(closed_reason, '') else null end,
    closed_at = case when new_status = 'cerrado' then now() else null end,
    updated_at = now()
  where id = target_id
  returning id, status, closed_reason, closed_at
  into id, status, closed_reason, closed_at;

  return next;
end;
$$;

-- Update views to use real status column instead of computed expressions
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
