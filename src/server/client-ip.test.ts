import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const headersMock = vi.fn();
vi.mock("next/headers", () => ({ headers: () => headersMock() }));

import { getClientIp } from "@/server/client-ip";

describe("getClientIp", () => {
  it("lê x-client-ip da requisição", async () => {
    headersMock.mockResolvedValueOnce(
      new Headers({ "x-client-ip": "203.0.113.7" }),
    );
    expect(await getClientIp()).toBe("203.0.113.7");
  });

  it("sem o cabeçalho ou com valor inválido devolve null", async () => {
    headersMock.mockResolvedValueOnce(new Headers());
    expect(await getClientIp()).toBeNull();
    headersMock.mockResolvedValueOnce(new Headers({ "x-client-ip": "lixo" }));
    expect(await getClientIp()).toBeNull();
    headersMock.mockResolvedValueOnce(
      new Headers({ "x-client-ip": "fe80::1%eth0" }),
    );
    expect(await getClientIp()).toBeNull();
  });

  it("fora de requisição devolve null", async () => {
    headersMock.mockImplementationOnce(() => {
      throw new Error("fora do escopo");
    });
    expect(await getClientIp()).toBeNull();
  });
});
