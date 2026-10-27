-- Núcleo · Etapa 3 · SEC-18: teto por valor baixado para 99999999.99 (9_999_999_999 centavos), para o agregado caber no app.
-- Substitui os CHECKs da migration 20261024100400. NaN continua rejeitado (23514). NOT VALID + validação tolerante:
-- dado existente acima do teto não derruba a migration (vira NOTICE; a constraint vale para novas escritas).

alter table public.transactions drop constraint transactions_amount_range_check;
alter table public.accounts drop constraint accounts_opening_balance_range_check;
alter table public.accounts drop constraint accounts_credit_limit_range_check;

alter table public.transactions
  add constraint transactions_amount_range_check
  check (amount <> 'NaN'::numeric and amount <= 99999999.99) not valid;
alter table public.accounts
  add constraint accounts_opening_balance_range_check
  check (opening_balance <> 'NaN'::numeric and abs(opening_balance) <= 99999999.99) not valid;
alter table public.accounts
  add constraint accounts_credit_limit_range_check
  check (credit_limit is null or (credit_limit <> 'NaN'::numeric and credit_limit <= 99999999.99)) not valid;

do $$
begin
  alter table public.transactions validate constraint transactions_amount_range_check;
  alter table public.accounts validate constraint accounts_opening_balance_range_check;
  alter table public.accounts validate constraint accounts_credit_limit_range_check;
exception when check_violation then
  raise notice 'SEC-18: existem linhas acima do novo teto (99999999.99); constraints ficam NOT VALID (valem para novas escritas). Corrija e rode VALIDATE.';
end;
$$;

-- DOWN (manual): recriar as 3 constraints com o teto 999999999999.99 (ver migration 20261024100400).
-- Efeito em dados existentes: nenhum dado alterado; linhas acima do teto novo (se houvesse) deixam a constraint NOT VALID, com NOTICE.
