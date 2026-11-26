"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { normalizePhone } from "@/domain/phone";
import { updateProfileAction } from "@/server/my-account-actions";
import type { MyProfile } from "@/server/my-account";

import { useSnackbar } from "../feedback/SnackbarProvider";

/**
 * « Mes informations » (story A3) : prénom, nom, téléphone au format international (vérifié en
 * direct : un numéro invalide bloque l'enregistrement), email de connexion en lecture seule.
 */
export function ProfileForm({ profile }: { profile: MyProfile }) {
  const t = useTranslations("Auth.account");
  const showSnackbar = useSnackbar();
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [pending, startTransition] = useTransition();
  const phoneBad = phone.trim() !== "" && !normalizePhone(phone).ok;
  const firstNameBad = firstName.trim() === "";

  const save = () =>
    startTransition(async () => {
      const result = await updateProfileAction({ firstName, lastName, phone });
      showSnackbar({ message: result.status === "saved" ? t("saved") : t("error") });
    });

  return (
    <Stack
      component="form"
      spacing={2}
      sx={{ maxWidth: 560 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!phoneBad && !firstNameBad) save();
      }}
      noValidate
    >
      <Stack direction="row" spacing={1.5}>
        <TextField
          id="profil-prenom"
          label={t("firstName")}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          autoComplete="given-name"
          required
          error={firstNameBad}
          helperText={firstNameBad ? t("firstNameInvalid") : " "}
          fullWidth
        />
        <TextField
          id="profil-nom"
          label={t("lastName")}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          autoComplete="family-name"
          helperText=" "
          fullWidth
        />
      </Stack>
      <TextField
        id="profil-telephone"
        label={t("phone")}
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        autoComplete="tel"
        error={phoneBad}
        helperText={phoneBad ? t("phoneInvalid") : t("phoneHelp")}
      />
      <div>
        <Typography variant="bodySmall" color="text.secondary" component="p">
          {t("loginEmail")}
        </Typography>
        <Typography>{profile.email}</Typography>
        <Typography variant="bodySmall" color="text.secondary" component="p">
          {t("loginEmailHelp")}
        </Typography>
      </div>
      <div>
        <Button type="submit" variant="contained" disabled={pending || phoneBad || firstNameBad}>
          {t("save")}
        </Button>
      </div>
    </Stack>
  );
}
