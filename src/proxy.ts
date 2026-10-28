import { NextResponse, type NextRequest } from "next/server";
import { resolveClientIp } from "@/lib/client-ip";
import { serverEnv } from "@/lib/env/server";
import { updateSession } from "@/lib/supabase/proxy";

const PRIVATE_PREFIXES = [
  "/inicio",
  "/familia",
  "/configuracoes",
  "/onboarding",
  "/transacoes",
  "/contas",
  "/categorias",
  "/metas",
  "/planejamento",
  "/divisao",
  "/relatorios",
  "/notificacoes",
];
const GUEST_ONLY = ["/login", "/cadastro", "/recuperar-senha"];

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * IP do cliente calculado UMA vez aqui (ADR-0034 §6) e gravado em `x-client-ip` na requisição,
 * que `updateSession` repassa. Um `x-client-ip` vindo do cliente é sempre descartado; sem IP
 * confiável o cabeçalho fica ausente (e os baldes por IP são ignorados adiante).
 */
function stampClientIp(request: NextRequest): void {
  request.headers.delete("x-client-ip");
  const ip = resolveClientIp(
    request.headers.get("x-forwarded-for"),
    serverEnv.TRUSTED_PROXY_HOPS,
  );
  if (ip) request.headers.set("x-client-ip", ip);
}

// O proxy não é fronteira de autorização: layouts (requireUser/requireMembership) e RLS decidem.
export async function proxy(request: NextRequest): Promise<NextResponse> {
  stampClientIp(request);
  const { response, userId, requestId } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string, query?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }
    const redirected = NextResponse.redirect(url);
    // Preserva cookies renovados e cabeçalhos de cache/sessão colocados por updateSession.
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") return;
      // Cabeçalhos internos de repasse do NextResponse.next() não pertencem a um redirect.
      if (key.toLowerCase().startsWith("x-middleware-")) return;
      redirected.headers.set(key, value);
    });
    for (const cookie of response.cookies.getAll()) {
      redirected.cookies.set(cookie);
    }
    redirected.headers.set("x-request-id", requestId);
    return redirected;
  };

  // Server Actions (Next-Action) e métodos não-GET/HEAD não são redirecionados: o Next
  // quebraria com "unexpected response". runAction devolve UNAUTHENTICATED e o frontend navega.
  const isNavigation =
    (request.method === "GET" || request.method === "HEAD") &&
    !request.headers.has("next-action");

  if (!userId && isNavigation) {
    if (matches(pathname, PRIVATE_PREFIXES)) {
      return redirectTo("/login", { next: `${pathname}${search}` });
    }
    if (matches(pathname, ["/redefinir-senha"])) {
      return redirectTo("/recuperar-senha");
    }
  } else if (
    userId &&
    isNavigation &&
    matches(pathname, GUEST_ONLY) &&
    // `getClaims()` só lê o JWT local. Quando requireUser (getUser, no Auth server) manda para cá
    // com este motivo, a sessão foi revogada: devolver a /inicio fecharia um laço de redirects.
    request.nextUrl.searchParams.get("motivo") !== "sessao_expirada"
  ) {
    return redirectTo("/inicio");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff|woff2|webmanifest)$).*)",
  ],
};
