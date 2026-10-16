-- Migration: closed_category — Jev-triaged close reason
-- Stores the classified close reason so analytics can answer
-- "why do reports get closed?" without re-reading free text.

alter table public.reportes
  add column if not exists closed_category text
  check (closed_category in ('reparado', 'falso_positivo', 'duplicado', 'no_aplica', 'sin_dato', 'otro'));

-- Backfill existing closed rows using the same keyword rules the app
-- uses as fallback (best-effort; rows the rules can't match stay NULL -> 'otro')
update public.reportes
set closed_category = case
  when closed_reason ~* '(repar|arregl|correg|resuelt|sellad|soldad)' then 'reparado'
  when closed_reason ~* '(falso|no habia|no hab\u00eda|no exist|error de detecci)' then 'falso_positivo'
  when closed_reason ~* '(duplicad|repetid|ya (estaba |se )?(report|registr))' then 'duplicado'
  when closed_reason ~* '(no aplica|fuera de alcance|no corresponde)' then 'no_aplica'
  else 'otro'
end
where status = 'cerrado'
  and closed_reason is not null
  and closed_category is null;

update public.reportes
set closed_category = 'sin_dato'
where status = 'cerrado'
  and (closed_reason is null or btrim(closed_reason) = '')
  and closed_category is null;

create index if not exists reportes_closed_category_idx on public.reportes (closed_category) where closed_category is not null;
