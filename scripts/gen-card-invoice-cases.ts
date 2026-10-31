/**
 * Gera supabase/tests/database/690_card_invoice_cases.test.sql a partir da tabela compartilhada de casos
 * (src/modules/reports/domain/card-invoice-cases.json), a mesma que o teste unitário de `invoiceOf` percorre (ADR-0041 §6, R25).
 * Assim `invoiceOf` (TS) e `private.card_invoice_closing/_due` (SQL) são provadas iguais pela mesma tabela.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/gen-card-invoice-cases.ts          escreve o arquivo
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/gen-card-invoice-cases.ts --check  sai com 1 se o versionado divergir
 *
 * `gerarSql` é pura (recebe os casos) para poder ser coberta por teste unitário.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type CasoFatura = {
  purchase: string;
  closingDay: number;
  dueDay: number;
  closing: string;
  due: string;
  note: string;
};

const RAIZ = resolve(fileURLToPath(import.meta.url), "..", "..");
export const ARQUIVO_JSON = resolve(
  RAIZ,
  "src/modules/reports/domain/card-invoice-cases.json",
);
export const ARQUIVO_SQL = resolve(
  RAIZ,
  "supabase/tests/database/690_card_invoice_cases.test.sql",
);

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function validar(casos: readonly CasoFatura[]): void {
  casos.forEach((c, i) => {
    const ok =
      ISO.test(c.purchase) &&
      ISO.test(c.closing) &&
      ISO.test(c.due) &&
      Number.isInteger(c.closingDay) &&
      c.closingDay >= 1 &&
      c.closingDay <= 31 &&
      Number.isInteger(c.dueDay) &&
      c.dueDay >= 1 &&
      c.dueDay <= 31 &&
      typeof c.note === "string";
    if (!ok) throw new Error(`caso ${i + 1} inválido: ${JSON.stringify(c)}`);
  });
}

const aspas = (texto: string) => texto.replaceAll("'", "''");

export function gerarSql(casos: readonly CasoFatura[]): string {
  validar(casos);
  const linhas: string[] = [
    "-- GERADO por scripts/gen-card-invoice-cases.ts a partir de src/modules/reports/domain/card-invoice-cases.json. Não edite à mão.",
    "-- ADR-0041 / D26 / R25: private.card_invoice_closing e private.card_invoice_due = invoiceOf (TS), pela mesma tabela de casos.",
    "begin;",
    "",
    "select no_plan();",
    "",
  ];
  casos.forEach((c, i) => {
    const n = String(i + 1).padStart(2, "0");
    const nome = `caso ${n} (${c.closingDay}/${c.dueDay}, ${c.purchase}): ${aspas(c.note)}`;
    const args = `'${c.purchase}'::date, ${c.closingDay}::smallint`;
    linhas.push(
      `select is(private.card_invoice_closing(${args}), '${c.closing}'::date, '${nome} · fechamento');`,
      `select is(private.card_invoice_due(${args}, ${c.dueDay}::smallint), '${c.due}'::date, '${nome} · vencimento');`,
    );
  });
  linhas.push("", "select * from finish();", "rollback;", "");
  return linhas.join("\n");
}

function principal(): void {
  const casos = JSON.parse(readFileSync(ARQUIVO_JSON, "utf8")) as CasoFatura[];
  const sql = gerarSql(casos);
  if (process.argv.includes("--check")) {
    const atual = readFileSync(ARQUIVO_SQL, "utf8");
    if (atual !== sql) {
      console.error(
        "690_card_invoice_cases.test.sql diverge do JSON: rode scripts/gen-card-invoice-cases.ts",
      );
      process.exit(1);
    }
    console.log(`ok: ${casos.length} casos`);
    return;
  }
  writeFileSync(ARQUIVO_SQL, sql);
  console.log(`gerado ${ARQUIVO_SQL} (${casos.length} casos)`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  principal();
}
