-- Núcleo · Etapa 5 · materialização de recorrências (D12; ADR-0011, ADR-0023). Contrato: docs/contracts/etapa-5.md §3.1.
-- Erros: P0001 com mensagem = código; 42501 = FORBIDDEN.

-- Cria, como pending, as ocorrências da família do chamador até o fim do mês seguinte a hoje. Idempotente
-- (on conflict do nothing na chave (recurrence_id, occurrence_date)); séries travadas com skip locked; cada série roda em
-- bloco próprio, e a falha de uma não para as outras (fica em last_failure_code/last_failure_at). Tetos: 60 datas por série
-- e 500 inserções por chamada. Sem parâmetros: nunca lê família de fora. Devolve quantas ocorrências criou.
create function public.materialize_recurrences()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_today date := private.today();
  v_horizon date;
  v_series public.recurrences;
  v_total integer := 0;
  v_made integer;
  v_seen integer;
  v_inserted integer;
  v_idx integer;
  v_date date;
  v_limit date;
  v_code text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  v_family := private.current_family_id();
  if v_family is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- último dia do mês seguinte a hoje
  v_horizon := (date_trunc('month', v_today::timestamp) + interval '2 months' - interval '1 day')::date;

  for v_series in
    select r.* from public.recurrences r
    where r.family_id = v_family and r.is_active
      and r.next_occurrence_date <= least(v_horizon, coalesce(r.end_date, v_horizon))
    order by r.next_occurrence_date, r.id
    for update skip locked
  loop
    exit when v_total >= 500;
    begin
      v_made := 0;
      v_seen := 0;

      if not exists (
        select 1 from public.family_members m
        where m.family_id = v_series.family_id and m.user_id = v_series.created_by and m.status = 'active'
      ) then
        raise exception 'RECURRENCE_AUTHOR_INACTIVE' using errcode = 'P0001';
      end if;

      v_limit := least(v_horizon, coalesce(v_series.end_date, v_horizon));
      v_idx := private.recurrence_first_index(
        v_series.start_date, v_series.frequency, v_series.interval_count, v_series.next_occurrence_date);

      loop
        v_date := private.recurrence_occurrence(v_series.start_date, v_series.frequency, v_series.interval_count, v_idx);
        exit when v_date > v_limit or v_seen >= 60 or v_total + v_made >= 500;

        insert into public.transactions (
          family_id, type, account_id, category_id, assigned_member_id, description, amount,
          transaction_date, status, recurrence_id, occurrence_date, created_by
        ) values (
          v_series.family_id, v_series.type, v_series.account_id, v_series.category_id, v_series.assigned_member_id,
          v_series.description, v_series.amount, v_date, 'pending', v_series.id, v_date, v_series.created_by
        )
        on conflict (recurrence_id, occurrence_date) do nothing;
        get diagnostics v_inserted = row_count;

        v_made := v_made + v_inserted;
        v_seen := v_seen + 1;
        v_idx := v_idx + 1;
      end loop;

      -- ponteiro = primeira data da agenda ainda não materializada; sucesso limpa a falha anterior
      update public.recurrences
      set next_occurrence_date =
            private.recurrence_occurrence(v_series.start_date, v_series.frequency, v_series.interval_count, v_idx),
          last_failure_code = null,
          last_failure_at = null
      where id = v_series.id;

      v_total := v_total + v_made;
    exception when others then
      -- o sub-bloco desfez as inserções desta série; registra o código (mensagem = código) ou INTERNAL_ERROR
      v_code := case when sqlerrm ~ '^[A-Z_]{1,40}$' then sqlerrm else 'INTERNAL_ERROR' end;
      update public.recurrences
      set last_failure_code = v_code, last_failure_at = now()
      where id = v_series.id;
    end;
  end loop;

  return v_total;
end;
$$;

revoke execute on function public.materialize_recurrences() from public, anon;
grant execute on function public.materialize_recurrences() to authenticated;

-- DOWN (manual): drop function public.materialize_recurrences();
-- Efeito em dados existentes: nenhum (função nova; só escreve quando chamada, e só na família do chamador).
