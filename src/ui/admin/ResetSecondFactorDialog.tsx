"use client";

import LockResetOutlined from "@mui/icons-material/LockResetOutlined";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { resetSecondFactorAction } from "@/server/members-actions";

import { ConfirmDialog } from "../feedback/ConfirmDialog";
import { useSnackbar } from "../feedback/SnackbarProvider";

/**
 * « Réinitialiser la deuxième vérification » d'un membre qui a perdu son téléphone ou sa
 * passkey (story S10). Jamais par email : un admin le fait, après avoir reconnu la personne.
 */
export function ResetSecondFactorDialog({
  amapSlug,
  person,
  onReset,
  onClose,
}: {
  amapSlug: string;
  person: { userId: string; name: string };
  /** Réinitialisation faite : la page retire le bouton de la ligne. */
  onReset: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("Admin.resetSecondFactor");
  const showSnackbar = useSnackbar();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { name } = person;

  const confirm = async () => {
    setPending(true);
    const result = await resetSecondFactorAction({ amap: amapSlug, userId: person.userId });
    setPending(false);
    if (result.status === "reset") {
      showSnackbar({ message: t("done", { name }) });
      onReset();
      onClose();
    } else {
      setError(result.status === "self" ? t("self") : t("forbidden"));
    }
  };

  return (
    <ConfirmDialog
      open
      destructive
      icon={<LockResetOutlined />}
      title={t("dialogTitle", { name })}
      confirmLabel={t("confirm")}
      cancelLabel={t("cancel")}
      onConfirm={() => void confirm()}
      onClose={onClose}
      pending={pending}
      error={error}
    >
      {t("dialogIntro", { name })}
    </ConfirmDialog>
  );
}
