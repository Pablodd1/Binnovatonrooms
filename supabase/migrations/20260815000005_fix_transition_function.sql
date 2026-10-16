-- Migration: fix transition_report_status — ambiguous column reference (42702)
-- The RETURNS TABLE columns (id, status, closed_reason, closed_at) are PL/pgSQL
-- variables; the unqualified `where id = target_id` collided with reportes.id,
-- so every VALID transition failed with 500. Invalid transitions were masked
-- because 'Transicion invalida' raises before the UPDATE runs.
-- Fix: qualify every column reference with the table alias `r`.

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

  update public.reportes as r
  set
    status = new_status,
    closed_reason = case when new_status = 'cerrado' then coalesce(reason, '') else null end,
    closed_at = case when new_status = 'cerrado' then now() else null end,
    updated_at = now()
  where r.id = target_id
  returning r.id, r.status, r.closed_reason, r.closed_at
  into id, status, closed_reason, closed_at;

  return next;
end;
$$;
