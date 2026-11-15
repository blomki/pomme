"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { AmapProducerDetail } from "@/server/producers";
import {
  inviteProducerAccountAction,
  resendProducerInvitationAction,
} from "@/server/producers-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";

type Fields = { email: string; firstName: string; lastName: string };
const EMPTY: Fields = { email: "", firstName: "", lastName: "" };

/**
 * Comptes du producteur (story C1) : statut de chacun, renvoi de l'invitation, et invitation
 * d'un nouveau compte.
 */
export function ProducerAccessSection({
  amapSlug,
  producer,
}: {
  amapSlug: string;
  producer: AmapProducerDetail;
}) {
  const t = useTranslations("Admin.producerAccess");
  const showSnackbar = useSnackbar();
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const resend = async (userId: string, name: string) => {
    const result = await resendProducerInvitationAction(amapSlug, {
      amapProducerId: producer.id,
      userId,
    });
    showSnackbar({ message: result.status === "sent" ? t("resent", { name }) : t("resendFailed") });
  };

  const invite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    const result = await inviteProducerAccountAction(amapSlug, {
      amapProducerId: producer.id,
      ...fields,
    });
    setPending(false);
    if (result.status === "invited") {
      showSnackbar({
        message: result.sent
          ? t("invitedDone", { email: result.invitation.email })
          : t("invitedNotSent"),
      });
      setFields(EMPTY);
      setInvalid([]);
      setProblem(null);
      return;
    }
    setInvalid(result.status === "invalid" ? result.fields : []);
    setProblem(
      result.status === "already"
        ? t("already")
        : result.status === "invalid"
          ? null
          : t("errors.error"),
    );
  };

  const field = (name: keyof Fields) => ({
    label: t(name),
    value: fields[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setFields((current) => ({ ...current, [name]: e.target.value })),
    error: invalid.includes(name),
    helperText: invalid.includes(name)
      ? t(`errors.${name}`)
      : name === "lastName"
        ? t("lastNameHelp")
        : " ",
    fullWidth: true,
  });

  return (
    <Box component="section" aria-labelledby="access-title">
      <Typography id="access-title" variant="h2" sx={{ mb: 1 }}>
        {t("title")}
      </Typography>
      <Typography sx={{ mb: 2 }}>{t("intro")}</Typography>
      {producer.accounts.length === 0 ? (
        <Typography sx={{ mb: 2 }}>{t("none")}</Typography>
      ) : (
        <List sx={{ mb: 2 }}>
          {producer.accounts.map((account) => {
            const name = `${account.firstName} ${account.lastName}`.trim();
            return (
              <ListItem
                key={account.userId}
                divider
                secondaryAction={
                  account.status === "invited" ? (
                    <Button
                      size="small"
                      onClick={() => void resend(account.userId, name)}
                      aria-label={t("resendOf", { name })}
                    >
                      {t("resend")}
                    </Button>
                  ) : undefined
                }
              >
                <ListItemText
                  primary={
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center", flexWrap: "wrap" }}
                    >
                      <span>{name}</span>
                      <Chip
                        size="small"
                        color={account.status === "active" ? "success" : "default"}
                        label={t(account.status)}
                      />
                    </Stack>
                  }
                  secondary={account.email}
                />
              </ListItem>
            );
          })}
        </List>
      )}

      <Box
        component="form"
        onSubmit={(e) => void invite(e)}
        noValidate
        aria-labelledby="invite-account-title"
      >
        <Typography id="invite-account-title" variant="titleLarge" component="h3" sx={{ mb: 2 }}>
          {t("inviteTitle")}
        </Typography>
        <Stack spacing={2}>
          <TextField {...field("email")} type="email" autoComplete="off" required />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField {...field("firstName")} required />
            <TextField {...field("lastName")} />
          </Stack>
          <div role="status" aria-live="polite">
            {problem && <Alert severity="error">{problem}</Alert>}
          </div>
          <Box>
            <Button type="submit" variant="contained" disabled={pending}>
              {t("invite")}
            </Button>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}
