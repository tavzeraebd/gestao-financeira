import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));

const rpc = vi.fn();
const warn = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc }),
}));
vi.mock("@/server/logger", () => ({
  logger: { warn: (f: unknown) => warn(f) },
}));
vi.mock("@/server/request-id", () => ({
  getRequestId: async () => "6f1c2b3a-1111-4222-8333-944455556666",
}));

import { ensureRecurrencesMaterialized } from "@/modules/recurrences/materialize";

describe("ensureRecurrencesMaterialized", () => {
  beforeEach(() => {
    rpc.mockReset();
    warn.mockReset();
  });

  it("chama a RPC sem parâmetros e não registra nada quando dá certo", async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    await expect(ensureRecurrencesMaterialized()).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("materialize_recurrences");
    expect(warn).not.toHaveBeenCalled();
  });

  it("com a RPC falhando, registra o código e não lança", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "57014", message: "detalhe interno", details: "" },
    });
    await expect(ensureRecurrencesMaterialized()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith({
      requestId: "6f1c2b3a-1111-4222-8333-944455556666",
      module: "recurrences",
      operation: "ensureRecurrencesMaterialized",
      code: "57014",
    });
  });
});
