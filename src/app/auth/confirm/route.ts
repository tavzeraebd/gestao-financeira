import "server-only";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/server/logger";
import { getRequestId } from "@/server/request-id";

const paramsSchema = z.object({
  token_hash: z.string().min(1).max(512),
  type: z.enum(["email", "recovery"]),
});

const INVALID_LINK = "/login?erro=link_invalido";

// A URL contém o token_hash: nunca é logada (só o código do resultado).
export async function GET(request: NextRequest): Promise<never> {
  const requestId = await getRequestId();
  const { searchParams } = request.nextUrl;
  const parsed = paramsSchema.safeParse({
    token_hash: searchParams.get("token_hash"),
    type: searchParams.get("type"),
  });

  let destination = INVALID_LINK;
  let code = "INVALID_LINK";

  if (parsed.success) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: parsed.data.type,
      token_hash: parsed.data.token_hash,
    });
    if (!error) {
      destination = safeNextPath(
        searchParams.get("next"),
        parsed.data.type === "recovery" ? "/redefinir-senha" : "/inicio",
      );
      code = "OK";
    }
  }

  logger[code === "OK" ? "info" : "warn"]({
    requestId,
    module: "auth",
    operation: "confirm",
    code,
  });
  redirect(destination);
}
