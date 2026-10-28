"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pwa/register";

/** Registra o service worker (só em produção). Não renderiza nada. */
export function ServiceWorkerRegister(): null {
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}
