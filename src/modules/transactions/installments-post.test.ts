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

import { ensureInstallmentsPosted } from "@/modules/transactions/installments-post";

describe("ensureInstallmentsPosted", () => {
  beforeEach(() => {
    rpc.mockReset();
    warn.mockReset();
  });

  it("chama post_due_installments sem parâmetros e não registra nada quando dá certo", async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    await expect(ensureInstallmentsPosted()).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("post_due_installments");
    expect(warn).not.toHaveBeenCalled();
  });

  it("com a RPC falhando, registra só o código e não lança", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "57014", message: "detalhe interno", details: "" },
    });
    await expect(ensureInstallmentsPosted()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith({
      requestId: "6f1c2b3a-1111-4222-8333-944455556666",
      module: "transactions",
      operation: "ensureInstallmentsPosted",
      code: "57014",
    });
  });
});
