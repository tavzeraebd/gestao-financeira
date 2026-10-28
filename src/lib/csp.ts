/**
 * CSP com nonce por requisição (ADR-0037). Funções puras, sem dependência de servidor,
 * para rodar no `proxy` e ser testadas isoladamente.
 */

/** 16 bytes aleatórios em base64 (novo a cada requisição). */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function buildCsp({
  nonce,
  isDev,
}: {
  nonce: string;
  isDev: boolean;
}): string {
  const directives = [
    "default-src 'self'",
    // 'strict-dynamic' faz o navegador ignorar a lista de origens; 'unsafe-eval' só em dev.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // Sonner 2.x injeta <style> sem aceitar nonce (ADR-0037 §3, emenda). Sem nonce aqui, senão 'unsafe-inline' é ignorado.
    "style-src-elem 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws://localhost:*" : ""}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!isDev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
