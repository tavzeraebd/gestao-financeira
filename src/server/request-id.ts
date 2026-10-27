import "server-only";
import { headers } from "next/headers";

/** Id da requisição definido pelo proxy (`x-request-id`); fora de requisição gera um novo. */
export async function getRequestId(): Promise<string> {
  try {
    const value = (await headers()).get("x-request-id");
    if (value) return value;
  } catch {
    // fora do escopo de uma requisição (ex.: testes)
  }
  return crypto.randomUUID();
}
