"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import type { PlatformAccount } from "@/server/platform-accounts";
import { findAccountAction, platformResetSecondFactorAction } from "@/server/platform-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";

type Lookup =
  | { status: "idle" }
  | { status: "found"; account: PlatformAccount }
  | { status: "not_found" | "invalid" | "forbidden" };

/**
 * Retrouver un compte par son email et réinitialiser sa deuxième vérification (story S10b), par
 * exemple pour le seul admin d'une AMAP qui a perdu son téléphone. La recherche passe par une
 * action, pas par l'adresse de la page : l'email ne reste ni dans l'historique ni dans les
 * journaux du serveur.
 */
export function AccountLookup() {
  const t = useTranslations("Platform.accounts");
  const showSnackbar = useSnackbar();
  const [email, setEmail] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ status: "idle" });
  const [searching, setSearching] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearching(true);
    setLookup(await findAccountAction({ email }));
    setSearching(false);
  };

  const account = lookup.status === "found" ? lookup.account : null;
  const name = account ? `${account.firstName} ${account.lastName}`.trim() : "";

  const reset = async () => {
    if (!account) return;
    setResetting(true);
    const result = await platformResetSecondFactorAction({ userId: account.userId });
    setResetting(false);
    if (result.status === "reset") {
      setConfirming(false);
      setLookup({ status: "found", account: { ...account, hasSecondFactor: false } });
      showSnackbar({ message: t("done", { name }) });
    } else {
      setResetError(result.status === "platform_admin" ? t("platformAdmin") : t("failed"));
    }
  };

  const fieldError =
    lookup.status === "invalid"
      ? t("invalid")
      : lookup.status === "not_found"
        ? t("notFound")
        : null;

  return (
    <Stack spacing={3} sx={{ maxWidth: 820 }}>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <form onSubmit={(e) => void search(e)} noValidate>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ alignItems: "flex-start" }}
          >
            <TextField
              name="email"
              type="email"
              label={t("email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              required
              fullWidth
              error={fieldError !== null}
              helperText={fieldError ?? " "}
            />
            <Button type="submit" variant="contained" disabled={searching} sx={{ mt: 1 }}>
              {t("search")}
            </Button>
          </Stack>
        </form>
        <div role="status" aria-live="polite">
          {lookup.status === "forbidden" && <Alert severity="error">{t("forbidden")}</Alert>}
        </div>
      </Paper>

      {account && (
        <Paper variant="outlined" component="section" aria-labelledby="account-name" sx={{ p: 3 }}>
          <Typography id="account-name" variant="h2" gutterBottom>
            {name}
          </Typography>
          <Typography color="text.secondary">{account.email}</Typography>
          <Typography sx={{ mt: 2 }}>
            {account.amapNames.length > 0
              ? t("amaps", { names: account.amapNames.join(", ") })
              : t("noAmap")}
          </Typography>
          <Typography sx={{ mt: 1 }}>
            {account.hasSecondFactor ? t("hasSecondFactor") : t("noSecondFactor")}
          </Typography>
          {account.isPlatformAdmin ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              {t("platformAdmin")}
            </Alert>
          ) : (
            <Button
              variant="outlined"
              color="error"
              sx={{ mt: 2 }}
              onClick={() => {
                setResetError(null);
                setConfirming(true);
              }}
            >
              {t("reset")}
            </Button>
          )}
        </Paper>
      )}

      {account && confirming && (
        <Dialog
          open
          onClose={() => setConfirming(false)}
          aria-labelledby="platform-reset-title"
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle id="platform-reset-title">{t("dialogTitle", { name })}</DialogTitle>
          <DialogContent>
            <DialogContentText>{t("dialogIntro", { name })}</DialogContentText>
            <div role="status" aria-live="polite">
              {resetError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {resetError}
                </Alert>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirming(false)}>{t("cancel")}</Button>
            <Button
              variant="contained"
              color="error"
              disabled={resetting}
              onClick={() => void reset()}
            >
              {t("confirm")}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Stack>
  );
}
