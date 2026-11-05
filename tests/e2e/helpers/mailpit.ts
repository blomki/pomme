import { expect, type APIRequestContext } from "@playwright/test";

/** Interface de Mailpit, la boîte de réception de test (docker-compose.yml). */
export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

type Summary = { ID: string; Created: string };

async function messagesTo(request: APIRequestContext, email: string): Promise<Summary[]> {
  const search = await request.get(`${MAILPIT_URL}/api/v1/search`, {
    params: { query: `to:"${email}"`, limit: "10" },
  });
  return ((await search.json()) as { messages: Summary[] }).messages;
}

/**
 * Attend le lien de connexion envoyé à une adresse après `since`, et le renvoie.
 * (On ne vide pas la boîte : les tests des autres navigateurs tournent en même temps.)
 */
export async function magicLinkSince(
  request: APIRequestContext,
  email: string,
  since: Date,
): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const fresh = (await messagesTo(request, email)).find(
          (message) => new Date(message.Created).getTime() >= since.getTime() - 1000,
        );
        if (!fresh) return undefined;
        const message = await request.get(`${MAILPIT_URL}/api/v1/message/${fresh.ID}`);
        const { Text } = (await message.json()) as { Text: string };
        link = Text.match(/https?:\/\/\S+\/api\/auth\/magic-link\/verify\?\S+/)?.[0];
        return link;
      },
      { message: `lien de connexion pour ${email}`, timeout: 10_000 },
    )
    .toBeTruthy();
  return link ?? "";
}

/** Nombre d'emails reçus par une adresse. */
export async function countMessagesTo(request: APIRequestContext, email: string): Promise<number> {
  return (await messagesTo(request, email)).length;
}
