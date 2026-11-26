import SendOutlined from "@mui/icons-material/SendOutlined";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./ConfirmDialog";

const renderDialog = (props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) => {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <ConfirmDialog
      open
      icon={<SendOutlined />}
      title="Envoyer cet email ?"
      confirmLabel="Envoyer"
      cancelLabel="Annuler"
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    >
      Il partira à 52 destinataires.
    </ConfirmDialog>,
  );
  return { onConfirm, onClose };
};

describe("ConfirmDialog", () => {
  it("est un dialogue nommé par son titre, avec le résumé et deux boutons", async () => {
    const { onConfirm, onClose } = renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Envoyer cet email ?" });
    expect(dialog).toHaveTextContent("Il partira à 52 destinataires.");
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onClose).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("bloque l'action pendant l'envoi et annonce l'erreur", () => {
    renderDialog({ pending: true, error: "Envoi impossible." });
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Envoi impossible.");
  });
});
