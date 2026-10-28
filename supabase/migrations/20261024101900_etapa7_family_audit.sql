-- Núcleo · Etapa 7 · auditoria do nome da família. Contrato: docs/contracts/etapa-7.md §3.1; ADR-0030 §5.
-- Renomear continua sendo o UPDATE direto da Etapa 2 (grant (name) + policy families_update_owner, só owner); não existe update_family.
-- O trigger grava family.updated { "fields": ["name"] } só quando o nome mudou de fato. O metadata não leva o nome (nem o antigo,
-- nem o novo): catálogo fechado, sem dado pessoal. Roda como dono (security definer) para gravar em audit_events via log_audit.

create function private.families_after_update_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.log_audit(
    new.id, 'family', new.id, 'family.updated',
    jsonb_build_object('fields', jsonb_build_array('name'))
  );
  return null;
end;
$$;
revoke execute on function private.families_after_update_audit() from public, anon, authenticated;

create trigger families_after_update_audit
  after update of name on public.families
  for each row when (old.name is distinct from new.name)
  execute function private.families_after_update_audit();

-- DOWN (manual): drop trigger families_after_update_audit on public.families; drop function private.families_after_update_audit().
-- Efeito em dados existentes: nenhum (os eventos já gravados em audit_events permanecem: a tabela é append-only).
--   Lock: CREATE TRIGGER exige SHARE ROW EXCLUSIVE em families (tabela pequena: uma linha por família); breve.
