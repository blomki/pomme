"use client";

import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
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

/** Liste des passkeys du compte : ajouter, supprimer. */
export function PasskeyManager() {
  const t = useTranslations("Auth.account");
  const showSnackbar = useSnackbar();
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);

  const load = useCallback(async () => {
    const result = await authClient.passkey.listUserPasskeys();
    setPasskeys((result.data as Passkey[] | null) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const result = await authClient.passkey.addPasskey();
    if (result?.error) {
      showSnackbar({ message: t("passkeyAddError") });
      return;
    }
    showSnackbar({ message: t("passkeyAdded") });
    await load();
  };

  const remove = async (id: string) => {
    await authClient.passkey.deletePasskey({ id });
    showSnackbar({ message: t("passkeyDeleted") });
    await load();
  };

  return (
    <Stack spacing={1} component="section" aria-labelledby="passkeys">
      <Typography id="passkeys" variant="h2">
        {t("passkeys")}
      </Typography>
      <Typography variant="bodyMedium" color="text.secondary">
        {t("passkeysHelp")}
      </Typography>
      {passkeys !== null && passkeys.length === 0 && <Typography>{t("noPasskey")}</Typography>}
      {passkeys !== null && passkeys.length > 0 && (
        <List>
          {passkeys.map((item, index) => (
            <ListItem
              key={item.id}
              secondaryAction={
                <IconButton
                  edge="end"
                  aria-label={t("deletePasskey", { name: item.name || t("passkeyName", { n: index + 1 }) })}
                  onClick={() => remove(item.id)}
                >
                  <DeleteOutlined />
                </IconButton>
              }
            >
              <ListItemIcon>
                <KeyOutlined />
              </ListItemIcon>
              <ListItemText
                primary={item.name || t("passkeyName", { n: index + 1 })}
                secondary={item.createdAt ? t("createdOn", { date: formatDate(item.createdAt) }) : null}
              />
            </ListItem>
          ))}
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
