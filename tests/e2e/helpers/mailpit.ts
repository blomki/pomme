import { expect, type APIRequestContext } from "@playwright/test";

/** Interface de Mailpit, la boîte de réception de test (docker-compose.yml). */
export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

type Summary = { ID: string };

async function messagesTo(request: APIRequestContext, email: string): Promise<Summary[]> {
  const search = await request.get(`${MAILPIT_URL}/api/v1/search`, {
    params: { query: `to:"${email}"`, limit: "10" },
  });
  return ((await search.json()) as { messages: Summary[] }).messages;
}

/**
 * Identifiants des emails déjà reçus par une adresse : à prendre juste avant de demander un lien,
 * puis à passer à `newMagicLink`. On compare des identifiants plutôt que des heures : un lien
 * envoyé par le test précédent, une fraction de seconde plus tôt, ne peut pas être pris pour
 * le nouveau.
 */
export async function inboxSnapshot(
  request: APIRequestContext,
  email: string,
): Promise<Set<string>> {
  return new Set((await messagesTo(request, email)).map((message) => message.ID));
}

/**
 * Attend le premier lien de connexion arrivé après la photo `before`, et le renvoie.
 * (On ne vide pas la boîte : les tests des autres navigateurs tournent en même temps.)
 */
export async function newMagicLink(
  request: APIRequestContext,
  email: string,
  before: Set<string>,
): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const fresh = (await messagesTo(request, email)).find((message) => !before.has(message.ID));
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
