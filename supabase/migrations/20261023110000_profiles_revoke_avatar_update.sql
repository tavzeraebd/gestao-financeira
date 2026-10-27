-- Núcleo · Etapa 2 · SEC-7: o app só edita display_name nesta fase (sem upload de avatar).
-- Retira de authenticated o UPDATE em profiles.avatar_url; reconceder quando houver upload (ADR própria).

revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- DOWN (manual): grant update (avatar_url) on public.profiles to authenticated;
-- Efeito em dados existentes: nenhum (só privilégio).
