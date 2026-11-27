import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Garde-fou (fiche #124) : une page serveur ne peut pas passer une fonction ou un composant
// (comme `component={Link}`) à un composant client tel qu'un bouton MUI. Next.js ne le signale
// qu'à l'affichage, en production, par une page d'erreur. On le vérifie donc ici, pour toutes
// les fichiers de src/ : dans un fichier sans "use client", aucun `component={…}` n'est permis. Utiliser
// `LinkButton` (src/ui/navigation/), qui est un composant client.
function serverFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return serverFiles(full);
    if (!entry.name.endsWith(".tsx") || entry.name.endsWith(".test.tsx")) return [];
    return readFileSync(full, "utf8").trimStart().startsWith('"use client"') ? [] : [full];
  });
}

describe("pages serveur", () => {
  it("ne passent aucun composant en propriété `component` à un composant client", () => {
    const offenders = serverFiles(path.resolve(import.meta.dirname, "..")).filter((file) =>
      /component=\{[A-Z]/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
