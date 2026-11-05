import { expect } from "vitest";

/**
 * Vérifie qu'une opération échoue avec une erreur PostgreSQL précise.
 * Drizzle enveloppe l'erreur de PostgreSQL (« Failed query: … ») : on cherche le motif dans
 * le message et dans ses causes.
 */
export async function expectDatabaseError(operation: Promise<unknown>, pattern: RegExp) {
  const error = await operation.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error, "Une erreur était attendue").not.toBeNull();
  const messages: string[] = [];
  for (let current = error; current instanceof Error; current = current.cause) {
    messages.push(current.message);
  }
  expect(messages.join("\n")).toMatch(pattern);
}
