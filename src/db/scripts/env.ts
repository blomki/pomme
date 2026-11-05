/** Lit une variable d'environnement obligatoire, avec un message clair si elle manque. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} n'est pas défini. Copier .env.example en .env (cp .env.example .env).`,
    );
  }
  return value;
}

/** Lance un script et affiche l'erreur lisiblement s'il échoue (code de sortie 1). */
export function runScript(main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
