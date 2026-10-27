const ALLOWED_PREFIXES = [
  "/inicio",
  "/familia",
  "/configuracoes",
  "/onboarding",
  "/convite/",
  "/redefinir-senha",
  "/transacoes",
  "/contas",
  "/categorias",
  "/metas",
  "/planejamento",
  "/divisao",
] as const;

const MAX_LENGTH = 512;
const BASE = "http://safe-redirect.invalid";

// Caracteres de controle (tab e quebras de linha são removidos por navegadores) e barra invertida.
function hasForbiddenChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f || code === 0x5c) return true;
  }
  return false;
}

function isAllowedPath(pathname: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) =>
    prefix.endsWith("/")
      ? pathname.startsWith(prefix) && pathname.length > prefix.length
      : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Valida o destino pós-login/confirmação (`architecture.md` §5). Nunca lança. */
export function safeNextPath(
  input: string | null | undefined,
  fallback = "/inicio",
): string {
  if (typeof input !== "string") return fallback;
  if (input.length === 0 || input.length > MAX_LENGTH) return fallback;
  if (!input.startsWith("/") || input.startsWith("//")) return fallback;
  if (hasForbiddenChars(input)) return fallback;

  let url: URL;
  try {
    url = new URL(input, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  if (!isAllowedPath(url.pathname)) return fallback;

  return `${url.pathname}${url.search}`;
}
