const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

type MailpitSearch = { messages?: { ID: string; Created: string }[] };
type MailpitMessage = { HTML?: string; Text?: string };

function searchQuery(email: string): string {
  return encodeURIComponent(`to:${email}`);
}

/** Apaga as mensagens enviadas ao endereço, para que o próximo e-mail seja inequívoco. */
export async function clearMailbox(email: string): Promise<void> {
  await fetch(`${MAILPIT_URL}/api/v1/search?query=${searchQuery(email)}`, {
    method: "DELETE",
  });
}

/**
 * Espera o e-mail mais recente para o endereço e devolve o primeiro link de
 * `/auth/confirm` (confirmação de cadastro ou recuperação de senha).
 */
export async function getLatestLink(
  email: string,
  options: { timeoutMs?: number } = {},
): Promise<string> {
  const deadline = Date.now() + (options.timeoutMs ?? 20_000);

  while (Date.now() < deadline) {
    const search = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${searchQuery(email)}`,
    );
    const { messages = [] } = (await search.json()) as MailpitSearch;
    const latest = messages[0];
    if (latest) {
      const response = await fetch(
        `${MAILPIT_URL}/api/v1/message/${latest.ID}`,
      );
      const message = (await response.json()) as MailpitMessage;
      const body = `${message.HTML ?? ""}\n${message.Text ?? ""}`;
      const match = body.match(
        /https?:\/\/[^\s"'<>]*\/auth\/confirm\?[^\s"'<>]+/,
      );
      if (match) return match[0].replaceAll("&amp;", "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Nenhum e-mail com link chegou ao Mailpit para ${email}.`);
}
