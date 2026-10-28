/** Larguras suportadas (contrato da Etapa 8 §3.3) e a largura só de reflow (WCAG 1.4.10). */
export type ViewportNome = "v360" | "v390" | "v768" | "v1280";

export const VIEWPORTS: Record<
  ViewportNome,
  { width: number; height: number }
> = {
  v360: { width: 360, height: 780 },
  v390: { width: 390, height: 844 },
  v768: { width: 768, height: 1024 },
  v1280: { width: 1280, height: 800 },
};

export const VIEWPORT_NOMES = Object.keys(VIEWPORTS) as ViewportNome[];

/** Reflow (1.4.10): 320 CSS px de largura. */
export const VIEWPORT_REFLOW = { width: 320, height: 640 };

/** Abaixo de `md` (768px) o app usa BottomNav e listas em cartões. */
export const BREAKPOINT_MD = 768;

export const TEMAS = ["light", "dark"] as const;
export type Tema = (typeof TEMAS)[number];

/** Mesma chave do `ThemeProvider` (`storageKey`). */
export const THEME_STORAGE_KEY = "nucleo-theme";
