import { describe, expect, it } from "vitest";
import { dashboardFiltersSchema } from "./schemas";

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
