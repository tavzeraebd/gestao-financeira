import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ARQUIVO_JSON,
  ARQUIVO_SQL,
  gerarSql,
  type CasoFatura,
} from "../../scripts/gen-card-invoice-cases";

describe("690_card_invoice_cases.test.sql (R25)", () => {
  it("é exatamente o que gerarSql produz a partir do JSON compartilhado", () => {
    const casos = JSON.parse(
      readFileSync(ARQUIVO_JSON, "utf8"),
    ) as CasoFatura[];
    const versionado = readFileSync(ARQUIVO_SQL, "utf8");
    expect(
      versionado.replace(/\r\n/g, "\n") === gerarSql(casos).replace(/\r\n/g, "\n"),
      "diverge: rode node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/gen-card-invoice-cases.ts",
    ).toBe(true);
  });
});
