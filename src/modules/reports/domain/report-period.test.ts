import { describe, expect, it } from "vitest";
import type { ISODate } from "@/lib/dates";
import { categoryReportSchema, reportFiltersSchema } from "../schemas";
import { resolveReportPeriod } from "./report-period";

const d = (s: string) => s as ISODate;
const today = d("2026-10-27");

describe("resolveReportPeriod (D21)", () => {
  it("7_dias: [hoje − 6, hoje] e os 7 dias imediatamente anteriores", () => {
    const p = resolveReportPeriod({ periodo: "7_dias" }, today);
    expect([p.from, p.to]).toEqual(["2026-10-21", "2026-10-27"]);
    expect([p.previousFrom, p.previousTo]).toEqual([
      "2026-10-14",
      "2026-10-20",
    ]);
    expect(p.months).toEqual(["2026-10-01"]);
  });

  it("30_dias: [hoje − 29, hoje] e os 30 dias anteriores; meses que tocam o período", () => {
    const p = resolveReportPeriod({ periodo: "30_dias" }, today);
    expect([p.from, p.to]).toEqual(["2026-09-28", "2026-10-27"]);
    expect([p.previousFrom, p.previousTo]).toEqual([
      "2026-08-29",
      "2026-09-27",
    ]);
    expect(p.months).toEqual(["2026-09-01", "2026-10-01"]);
  });

  it("30_dias que coincide com mês inteiro usa os 30 dias anteriores, não o mês civil (D21)", () => {
    const p = resolveReportPeriod({ periodo: "30_dias" }, d("2026-11-30"));
    expect([p.from, p.to]).toEqual(["2026-11-01", "2026-11-30"]);
    expect([p.previousFrom, p.previousTo]).toEqual([
      "2026-10-02",
      "2026-10-31",
    ]);
  });

  it("3_meses: 1º dia do mês − 2 até hoje; anterior com as pontas recuadas 3 meses", () => {
    const p = resolveReportPeriod({ periodo: "3_meses" }, today);
    expect([p.from, p.to]).toEqual(["2026-08-01", "2026-10-27"]);
    expect([p.previousFrom, p.previousTo]).toEqual([
      "2026-05-01",
      "2026-07-27",
    ]);
    expect(p.months).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
  });

  it("3_meses: dia âncora maior que o mês de destino vira o último dia", () => {
    const p = resolveReportPeriod({ periodo: "3_meses" }, d("2026-05-31"));
    expect(p.previousTo).toBe("2026-02-28");
  });

  it("12_meses: 12 meses civis; anterior recuado 12 meses", () => {
    const p = resolveReportPeriod({ periodo: "12_meses" }, today);
    expect([p.from, p.to]).toEqual(["2025-11-01", "2026-10-27"]);
    expect([p.previousFrom, p.previousTo]).toEqual([
      "2024-11-01",
      "2025-10-27",
    ]);
    expect(p.months).toHaveLength(12);
    expect(p.months[0]).toBe("2025-11-01");
    expect(p.months[11]).toBe("2026-10-01");
  });

  it("personalizado válido segue D20/D4", () => {
    const p = resolveReportPeriod(
      { periodo: "personalizado", de: d("2026-10-01"), ate: d("2026-10-15") },
      today,
    );
    expect([p.from, p.to]).toEqual(["2026-10-01", "2026-10-15"]);
    expect([p.previousFrom, p.previousTo]).toEqual([
      "2026-09-16",
      "2026-09-30",
    ]);
    expect(p.label).toBe("01/10/2026 a 15/10/2026");
  });

  it("personalizado mês inteiro: anterior = mês civil anterior", () => {
    const p = resolveReportPeriod(
      { periodo: "personalizado", de: d("2026-09-01"), ate: d("2026-09-30") },
      today,
    );
    expect([p.previousFrom, p.previousTo]).toEqual([
      "2026-08-01",
      "2026-08-31",
    ]);
    expect(p.label).toBe("setembro de 2026");
  });

  it.each([
    ["sem datas", {}],
    ["de depois de ate", { de: d("2026-10-10"), ate: d("2026-10-01") }],
    ["mais de 366 dias", { de: d("2025-01-01"), ate: d("2026-10-01") }],
    ["fim depois do mês atual", { de: d("2026-10-01"), ate: d("2026-12-01") }],
    ["antes de 2000", { de: d("1999-12-01"), ate: d("2000-01-10") }],
  ])("personalizado inválido (%s) cai em 30_dias", (_name, extra) => {
    const p = resolveReportPeriod(
      { periodo: "personalizado", ...extra },
      today,
    );
    expect(p.preset).toBe("30_dias");
    expect(p.from).toBe("2026-09-28");
  });
});

describe("reportFiltersSchema / categoryReportSchema (tolerantes)", () => {
  it("vazio -> 30_dias", () => {
    expect(reportFiltersSchema.parse({})).toEqual({ periodo: "30_dias" });
    expect(reportFiltersSchema.parse(undefined)).toEqual({
      periodo: "30_dias",
    });
  });

  it("aceita preset e datas válidas; repetido usa o primeiro", () => {
    expect(
      reportFiltersSchema.parse({
        periodo: ["12_meses", "7_dias"],
        de: "2026-10-01",
        ate: "2026-02-30",
      }),
    ).toEqual({ periodo: "12_meses", de: "2026-10-01" });
  });

  it("valor inválido vira o padrão", () => {
    expect(reportFiltersSchema.parse({ periodo: "ano", de: 3 })).toEqual({
      periodo: "30_dias",
    });
  });

  it("tipo: despesas (padrão) | receitas", () => {
    expect(categoryReportSchema.parse({}).tipo).toBe("despesas");
    expect(categoryReportSchema.parse({ tipo: "receitas" }).tipo).toBe(
      "receitas",
    );
    expect(categoryReportSchema.parse({ tipo: "x" }).tipo).toBe("despesas");
    expect(categoryReportSchema.parse({ periodo: "7_dias" })).toEqual({
      periodo: "7_dias",
      tipo: "despesas",
    });
  });
});
