import type { Page } from "@playwright/test";

import { THEME_STORAGE_KEY, type Tema } from "./viewports";

/**
 * Fixa o tema antes de qualquer script da página (mesma chave do `ThemeProvider`) e alinha a
 * preferência do sistema, para o `theme-color` e o `next-themes` concordarem.
 */
export async function fixarTema(page: Page, tema: Tema): Promise<void> {
  await page.emulateMedia({ colorScheme: tema });
  await page.addInitScript(
    ([chave, valor]) => {
      try {
        localStorage.setItem(chave as string, valor as string);
      } catch {
        // armazenamento indisponível: o tema segue o sistema
      }
    },
    [THEME_STORAGE_KEY, tema],
  );
}

export const temaAplicado = (page: Page) =>
  page.evaluate(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
