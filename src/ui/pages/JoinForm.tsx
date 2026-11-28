"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";

import { JOIN_REQUEST_LIMITS } from "@/domain/join-requests";
import type { CaptchaWidgetConfig } from "@/server/captcha";
import { submitJoinRequestAction, type JoinFormState } from "@/server/join-requests-actions";

import { Captcha, CAPTCHA_WIDTH } from "../forms/Captcha";

/**
 * Formulaire « Nous rejoindre » du site public (story B2) : nom, email, téléphone, message,
 * captcha. La demande arrive aux administrateurs de l'AMAP, qui reprennent contact.
 */
export function JoinForm({
  amapSlug,
  captcha,
}: {
  amapSlug: string;
  captcha: CaptchaWidgetConfig | null;
}) {
  const t = useTranslations("JoinForm");
  const [state, formAction, pending] = useActionState<JoinFormState, FormData>(
    submitJoinRequestAction.bind(null, amapSlug),
    { status: "idle" },
  );
  const statusRef = useRef<HTMLDivElement>(null);
  const problems = state.status === "invalid" ? state.problems : [];
  const has = (field: (typeof problems)[number]) => problems.includes(field);

  // Après l'envoi (réussi ou non), le message prend le focus : il est lu aussitôt.
  useEffect(() => {
    if (state.status !== "idle") statusRef.current?.focus();
  }, [state]);

  if (state.status === "sent") {
    return (
      <Alert severity="success" ref={statusRef} tabIndex={-1}>
        {t("sent")}
      </Alert>
    );
  }

  return (
    <Stack
      component="form"
      action={formAction}
      spacing={2.5}
      noValidate
      sx={{ maxWidth: CAPTCHA_WIDTH }}
    >
      <div ref={statusRef} tabIndex={-1} role="status" aria-live="polite">
        {state.status === "invalid" && <Alert severity="error">{t("fixErrors")}</Alert>}
        {state.status === "captcha" && <Alert severity="warning">{t("captcha")}</Alert>}
        {state.status === "rate_limited" && <Alert severity="warning">{t("rateLimited")}</Alert>}
        {state.status === "unknown_amap" && <Alert severity="error">{t("error")}</Alert>}
      </div>
      <TextField
        name="name"
        label={t("name")}
        autoComplete="name"
        required
        error={has("name")}
        helperText={has("name") ? t("nameInvalid") : t("nameHelp")}
        slotProps={{ htmlInput: { maxLength: JOIN_REQUEST_LIMITS.name } }}
      />
      <TextField
        name="email"
        type="email"
        label={t("email")}
        autoComplete="email"
        required
        error={has("email")}
        helperText={has("email") ? t("emailInvalid") : undefined}
      />
      <TextField
        name="phone"
        type="tel"
        label={t("phone")}
        autoComplete="tel"
        error={has("phone")}
        helperText={has("phone") ? t("phoneInvalid") : t("phoneHelp")}
      />
      <TextField
        name="message"
        label={t("message")}
        multiline
        minRows={4}
        error={has("message")}
        helperText={has("message") ? t("messageInvalid") : t("messageHelp")}
        slotProps={{ htmlInput: { maxLength: JOIN_REQUEST_LIMITS.message } }}
      />
      <Captcha sitekey={captcha?.sitekey ?? null} endpoint={captcha?.endpoint} resetKey={state} />
      <Button type="submit" variant="contained" disabled={pending} sx={{ alignSelf: "flex-start" }}>
        {t("submit")}
      </Button>
    </Stack>
  );
}
