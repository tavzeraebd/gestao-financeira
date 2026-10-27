import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * `false` no servidor e na hidratação; `true` depois que o cliente assumiu.
 * Os botões de envio ficam desabilitados até lá (ADR-0017): sem JavaScript
 * nada é enviado, e nenhuma credencial vai para a URL.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
