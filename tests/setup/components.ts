// Préparation des tests de composants (projet Vitest « components »).
import "@testing-library/jest-dom/vitest"; // ajoute toBeInTheDocument(), toHaveAccessibleName()…
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vide le faux navigateur après chaque test, pour que les tests restent indépendants.
afterEach(() => {
  cleanup();
});
