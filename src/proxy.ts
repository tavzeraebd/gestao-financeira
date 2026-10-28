import { NextResponse, type NextRequest } from "next/server";
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

// O proxy não é fronteira de autorização: layouts (requireUser/requireMembership) e RLS decidem.
export async function proxy(request: NextRequest): Promise<NextResponse> {
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
  } else if (userId && isNavigation && matches(pathname, GUEST_ONLY)) {
    return redirectTo("/inicio");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff|woff2|webmanifest)$).*)",
  ],
};
