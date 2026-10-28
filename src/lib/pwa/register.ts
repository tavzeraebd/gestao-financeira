import { SW_PATH } from "./constants";

const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

let visibilityBound = false;
let lastUpdateAt = 0;

function aguardarCarregamento(): Promise<void> {
  if (document.readyState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    window.addEventListener("load", () => resolve(), { once: true });
  });
}

/**
 * Registra o service worker (ADR-0031): só em produção, depois do `load`, qualquer erro engolido.
 * Ao voltar ao primeiro plano pede atualização, no máximo uma vez por hora.
 */
export async function registerServiceWorker(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    await aguardarCarregamento();
    const registration = await navigator.serviceWorker.register(SW_PATH, {
      scope: "/",
      updateViaCache: "none",
    });
    lastUpdateAt = Date.now();

    if (!visibilityBound) {
      visibilityBound = true;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return;
        const now = Date.now();
        if (now - lastUpdateAt < UPDATE_INTERVAL_MS) return;
        lastUpdateAt = now;
        registration.update().catch(() => {});
      });
    }
  } catch {
    // O app funciona igual sem o worker.
  }
}
