"use client";

import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import Alert from "@mui/material/Alert";
import KeyOutlined from "@mui/icons-material/KeyOutlined";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { formatDate } from "@/i18n/dates";

import { useSnackbar } from "../feedback/SnackbarProvider";

import { authClient } from "./auth-client";

type Passkey = { id: string; name?: string | null; createdAt?: Date | string | null };

/**
 * Liste des passkeys du compte : ajouter, supprimer (avec confirmation, story A3). `lastUsed` :
 * date de dernière connexion de chaque passkey (par identifiant), lue par la page.
 */
export function PasskeyManager({ lastUsed = {} }: { lastUsed?: Record<string, string | null> }) {
  const t = useTranslations("Auth.account");
  const showSnackbar = useSnackbar();
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const fetchPasskeys = useCallback(async () => {
    const result = await authClient.passkey.listUserPasskeys();
    return (result.data as Passkey[] | null) ?? [];
  }, []);

  useEffect(() => {
    let active = true;
    void fetchPasskeys().then((items) => {
      if (active) setPasskeys(items);
    });
    return () => {
      active = false;
    };
  }, [fetchPasskeys]);

  const add = async () => {
    const result = await authClient.passkey.addPasskey();
    if (result?.error) {
      showSnackbar({ message: t("passkeyAddError") });
      return;
    }
    showSnackbar({ message: t("passkeyAdded") });
    setPasskeys(await fetchPasskeys());
  };

  const remove = async (id: string) => {
    setConfirming(null);
    await authClient.passkey.deletePasskey({ id });
    showSnackbar({ message: t("passkeyDeleted") });
    setPasskeys(await fetchPasskeys());
  };

  return (
    <Stack spacing={1} component="section" aria-labelledby="passkeys">
      <Typography id="passkeys" variant="h2">
        {t("passkeys")}
      </Typography>
      <Typography variant="bodyMedium" color="text.secondary">
        {t("passkeysIntro")}
      </Typography>
      {passkeys !== null && passkeys.length === 0 && <Typography>{t("noPasskey")}</Typography>}
      {passkeys !== null && passkeys.length > 0 && (
        <List>
          {passkeys.map((item, index) => {
            const name = item.name || t("passkeyName", { n: index + 1 });
            const used = lastUsed[item.id];
            const details = [
              item.createdAt ? t("createdOn", { date: formatDate(item.createdAt) }) : null,
              used ? t("lastUsedOn", { date: formatDate(used) }) : t("neverUsed"),
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <ListItem
                key={item.id}
                sx={{ flexWrap: "wrap" }}
                secondaryAction={
                  confirming === item.id ? null : (
                    <IconButton
                      edge="end"
                      aria-label={t("deletePasskey", { name })}
                      onClick={() => setConfirming(item.id)}
                    >
                      <DeleteOutlined />
                    </IconButton>
                  )
                }
              >
                <ListItemIcon>
                  <KeyOutlined />
                </ListItemIcon>
                <ListItemText primary={name} secondary={details} />
                {confirming === item.id && (
                  <Alert
                    severity="warning"
                    role="alert"
                    sx={{ width: "100%", mt: 1 }}
                    action={
                      <Stack direction="row" spacing={1}>
                        <Button color="inherit" size="small" onClick={() => setConfirming(null)}>
                          {t("cancel")}
                        </Button>
                        <Button
                          color="error"
                          variant="contained"
                          size="small"
                          onClick={() => void remove(item.id)}
                        >
                          {t("delete")}
                        </Button>
                      </Stack>
                    }
                  >
                    {t("deletePasskeyConfirm", { name })}
                  </Alert>
                )}
              </ListItem>
            );
          })}
        </List>
      )}
      <div>
        <Button variant="tonal" startIcon={<KeyOutlined />} onClick={add}>
          {t("addPasskey")}
        </Button>
      </div>
    </Stack>
  );
}
