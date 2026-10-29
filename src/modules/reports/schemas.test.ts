import { describe, expect, it } from "vitest";
import { commitmentFiltersSchema, dashboardFiltersSchema } from "./schemas";

describe("dashboardFiltersSchema (tolerante)", () => {
  it("vazio -> mes_atual", () => {
    expect(dashboardFiltersSchema.parse({})).toEqual({ periodo: "mes_atual" });
  });

  it("aceita preset e datas válidas", () => {
    expect(
      dashboardFiltersSchema.parse({
        periodo: "personalizado",
        de: "2026-10-01",
        ate: "2026-10-15",
      }),
    ).toEqual({
      periodo: "personalizado",
      de: "2026-10-01",
      ate: "2026-10-15",
    });
  });

  it("valores inválidos viram padrão, nunca erro", () => {
    expect(
      dashboardFiltersSchema.parse({
        periodo: "ano",
        de: "2026-02-30",
        ate: 42,
      }),
    ).toEqual({ periodo: "mes_atual" });
  });

  it("parâmetro repetido usa o primeiro; entrada não-objeto não lança", () => {
    expect(
      dashboardFiltersSchema.parse({ periodo: ["mes_anterior", "mes_atual"] }),
    ).toEqual({ periodo: "mes_anterior" });
    expect(dashboardFiltersSchema.parse(null)).toEqual({
      periodo: "mes_atual",
    });
  });
});

describe("commitmentFiltersSchema (tolerante)", () => {
  it("padrão 12; aceita 6 e 12; resto vira 12", () => {
    expect(commitmentFiltersSchema.parse({})).toEqual({ horizonte: 12 });
    expect(commitmentFiltersSchema.parse({ horizonte: "6" })).toEqual({
      horizonte: 6,
    });
    expect(commitmentFiltersSchema.parse({ horizonte: ["6", "12"] })).toEqual({
      horizonte: 6,
    });
    expect(commitmentFiltersSchema.parse({ horizonte: "99" })).toEqual({
      horizonte: 12,
    });
    expect(commitmentFiltersSchema.parse(null)).toEqual({ horizonte: 12 });
  });
});
