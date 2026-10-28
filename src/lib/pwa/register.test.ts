import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Registration = { update: ReturnType<typeof vi.fn> };

function installServiceWorker(register: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "serviceWorker", {
    value: { register },
    configurable: true,
  });
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

async function loadRegister() {
  vi.resetModules();
  return (await import("./register")).registerServiceWorker;
}

describe("registerServiceWorker (CA-E8-07)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("em produção registra /sw.js com scope / e updateViaCache none", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const register = vi
      .fn()
      .mockResolvedValue({ update: vi.fn().mockResolvedValue(undefined) });
    installServiceWorker(register);

    await (
      await loadRegister()
    )();

    expect(register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  });

  it("espera o evento load quando a página ainda carrega", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const register = vi
      .fn()
      .mockResolvedValue({ update: vi.fn().mockResolvedValue(undefined) });
    installServiceWorker(register);
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");

    const pending = (await loadRegister())();
    await Promise.resolve();
    expect(register).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("load"));
    await pending;
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("em desenvolvimento não registra", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const register = vi.fn();
    installServiceWorker(register);

    await (
      await loadRegister()
    )();

    expect(register).not.toHaveBeenCalled();
  });

  it("sem suporte a serviceWorker não registra nem lança", async () => {
    vi.stubEnv("NODE_ENV", "production");
    Reflect.deleteProperty(navigator, "serviceWorker");

    await expect((await loadRegister())()).resolves.toBeUndefined();
  });

  it("exceção no registro é engolida", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const register = vi.fn().mockRejectedValue(new Error("falhou"));
    installServiceWorker(register);

    await expect((await loadRegister())()).resolves.toBeUndefined();
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("atualiza ao voltar ao primeiro plano, no máximo uma vez por hora", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.setSystemTime(new Date("2026-10-28T10:00:00Z"));
    const registration: Registration = {
      update: vi.fn().mockResolvedValue(undefined),
    };
    installServiceWorker(vi.fn().mockResolvedValue(registration));

    await (
      await loadRegister()
    )();

    setVisibility("visible");
    expect(registration.update).not.toHaveBeenCalled();

    vi.advanceTimersByTime(61 * 60 * 1000);
    setVisibility("hidden");
    expect(registration.update).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(registration.update).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10 * 60 * 1000);
    setVisibility("visible");
    expect(registration.update).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(51 * 60 * 1000);
    setVisibility("visible");
    expect(registration.update).toHaveBeenCalledTimes(2);
  });
});
