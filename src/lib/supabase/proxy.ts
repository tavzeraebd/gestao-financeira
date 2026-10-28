import "server-only";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env/public";
import type { Database } from "@/types/database";

/**
 * Renova a sessão e devolve o response com os cookies atualizados.
 * Não executar código entre `createServerClient` e `getClaims()`.
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; userId: string | null; requestId: string }> {
  // Sempre gerado aqui: nunca confiar em x-request-id vindo do cliente.
  const requestId = crypto.randomUUID();

  // x-client-ip, x-nonce e Content-Security-Policy já foram definidos no proxy sobre `request.headers`;
  // são relidos a cada forward() para não se perderem quando a sessão é renovada.
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set("x-request-id", requestId);
    for (const name of ["x-client-ip", "x-nonce", "content-security-policy"]) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    return NextResponse.next({ request: { headers } });
  };

  let response = forward();

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, cacheHeaders) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = forward();
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
            });
          }
          for (const [key, value] of Object.entries(cacheHeaders)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub ?? null;

  response.headers.set("x-request-id", requestId);
  const csp = request.headers.get("content-security-policy");
  if (csp) response.headers.set("Content-Security-Policy", csp);
  return { response, userId, requestId };
}
