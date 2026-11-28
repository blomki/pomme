import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "../../../tests/setup/render";

import { SnackbarProvider, useSnackbar, type SnackbarMessage } from "./SnackbarProvider";

function Trigger({ snackbar }: { snackbar: SnackbarMessage }) {
  const show = useSnackbar();
  return <button onClick={() => show(snackbar)}>Afficher</button>;
}

const renderWith = (snackbar: SnackbarMessage) =>
  renderWithIntl(
    <SnackbarProvider>
      <Trigger snackbar={snackbar} />
    </SnackbarProvider>,
  );

// Messages en bas de l'écran (fiche #123) : une Alert dans un Snackbar, annoncée selon sa gravité.
describe("SnackbarProvider", () => {
  it("annonce poliment une information (role status)", async () => {
    renderWith({ message: "Vous êtes déconnecté.", severity: "info" });
    await userEvent.click(screen.getByRole("button", { name: "Afficher" }));
    expect(screen.getByRole("status")).toHaveTextContent("Vous êtes déconnecté.");
  });

  it("annonce aussitôt un avertissement ou une erreur (role alert)", async () => {
    renderWith({ message: "Lien expiré.", severity: "warning" });
    await userEvent.click(screen.getByRole("button", { name: "Afficher" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Lien expiré.");
  });

  it("se ferme au clavier", async () => {
    renderWith({ message: "Enregistré.", persist: true });
    await userEvent.click(screen.getByRole("button", { name: "Afficher" }));
    const close = screen.getByRole("button", { name: "Fermer le message" });
    close.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByText("Enregistré.")).not.toBeInTheDocument());
  });

  it("propose « Annuler » quand l'action peut être défaite", async () => {
    const onUndo = vi.fn();
    renderWith({ message: "Chèque marqué comme reçu.", onUndo });
    await userEvent.click(screen.getByRole("button", { name: "Afficher" }));
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onUndo).toHaveBeenCalledOnce();
  });
});
