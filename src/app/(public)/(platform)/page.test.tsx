import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithIntl } from "../../../../tests/setup/render";

import HomePage from "./page";

// Exemple de test de composant : on vérifie ce que voit l'utilisateur (un titre de niveau 1),
// pas la façon dont le composant est écrit.
describe("Page d'accueil", () => {
  it("affiche le titre principal", () => {
    renderWithIntl(<HomePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Pomme" })).toBeInTheDocument();
  });

  it("présente l'application", () => {
    renderWithIntl(<HomePage />);
    expect(screen.getByText("Application de création et de gestion d'AMAP.")).toBeInTheDocument();
  });
});
