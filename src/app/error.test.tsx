import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "../../tests/setup/render";

import ErrorPage from "./error";

// Page d'erreur (fiche #124) : en français, avec la référence de l'erreur, sans son détail.
describe("Page d'erreur", () => {
  const error = Object.assign(new Error("détail interne"), { digest: "2723936353" });

  it("explique l'erreur en français et donne sa référence, sans le détail technique", () => {
    renderWithIntl(<ErrorPage error={error} reset={() => {}} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Cette page n'a pas pu s'afficher" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Référence : 2723936353")).toBeInTheDocument();
    expect(screen.queryByText(/détail interne/)).not.toBeInTheDocument();
  });

  it("propose de réessayer et de revenir à son espace", async () => {
    const reset = vi.fn();
    renderWithIntl(<ErrorPage error={error} reset={reset} />);
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Revenir à mon espace" })).toHaveAttribute(
      "href",
      "/connexion/suite",
    );
  });
});
