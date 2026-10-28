"use client";

import { Button } from "@/components/ui/button";

/** Recarrega a URL atual (a original, preservada pelo navegador na página offline). */
export function ReloadButton() {
  return (
    <Button type="button" onClick={() => window.location.reload()}>
      Tentar novamente
    </Button>
  );
}
