"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { formatDate } from "@/i18n/dates";
import {
  cancelInvitationAction,
  inviteMemberAction,
  removeMemberAction,
} from "@/server/my-account-actions";
import type { MyHouseholdView } from "@/server/my-account";

import { useSnackbar } from "../feedback/SnackbarProvider";

const longDay = (day: string) => formatDate(`${day}T12:00:00Z`, "d MMMM yyyy");
const monthYear = (day: string) => formatDate(`${day}T12:00:00Z`, "MMMM yyyy");

/**
 * « Mon foyer » (story A3) : membres et invitations en attente ; inviter une personne (lien de
 * 7 jours), annuler une invitation, retirer un membre. Chaque geste destructeur demande une
 * confirmation, dans la carte même.
 */
export function MyHousehold({ household }: { household: MyHouseholdView }) {
  const t = useTranslations("Auth.account");
  const showSnackbar = useSnackbar();
  const router = useRouter();
  const titleId = useId();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const slug = household.amapSlug;

  const done = (message: string) => {
    setConfirming(null);
    showSnackbar({ message });
    router.refresh();
  };

  const remove = (userId: string, name: string) =>
    startTransition(async () => {
      const result = await removeMemberAction(slug, userId);
      done(result.status === "removed" ? t("removed", { name }) : t("error"));
    });

  const cancel = (id: string) =>
    startTransition(async () => {
      const result = await cancelInvitationAction(slug, id);
      done(result.status === "cancelled" ? t("invitationCancelled") : t("error"));
    });

  const invite = () =>
    startTransition(async () => {
      const result = await inviteMemberAction(slug, email);
      if (result.status === "invited") {
        setInviting(false);
        setEmail("");
        setInviteError(null);
        done(result.sent ? t("invited", { email: result.email }) : t("inviteNotSent"));
      } else {
        setInviteError(result.status === "forbidden" ? t("error") : t(`invite_${result.status}`));
      }
    });

  const confirmBox = (text: string, label: string, onConfirm: () => void) => (
    <Alert
      severity="warning"
      role="alert"
      sx={{ mt: 1 }}
      action={
        <Stack direction="row" spacing={1}>
          <Button color="inherit" size="small" onClick={() => setConfirming(null)}>
            {t("cancel")}
          </Button>
          <Button
            color="error"
            variant="contained"
            size="small"
            disabled={pending}
            onClick={onConfirm}
          >
            {label}
          </Button>
        </Stack>
      }
    >
      {text}
    </Alert>
  );

  return (
    <Stack component="section" aria-labelledby={titleId} spacing={1.5}>
      <div>
        <Typography id={titleId} variant="h2">
          {t("householdTitle", { household: household.name })}
        </Typography>
        <Typography variant="bodySmall" color="text.secondary">
          {t("householdAmap", { amap: household.amapName })} · {t("householdHelp")}
        </Typography>
      </div>

      {household.members.map((m) => {
        const name = `${m.firstName} ${m.lastName}`.trim();
        return (
          <Paper key={m.userId} variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }}>
              <Stack sx={{ flex: 1, minWidth: 0 }}>
                <Typography>{m.isMe ? t("you", { name }) : name}</Typography>
                <Typography variant="bodySmall" color="text.secondary">
                  {[
                    m.isPrimary ? t("primary") : null,
                    m.isMe
                      ? t("cannotRemoveSelf")
                      : m.status === "invited"
                        ? t("memberInvited")
                        : t("memberSince", { date: monthYear(m.since) }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Typography>
              </Stack>
              {!m.isMe && confirming !== m.userId && (
                <Button
                  onClick={() => setConfirming(m.userId)}
                  aria-label={t("removeOf", { name })}
                >
                  {t("remove")}
                </Button>
              )}
            </Stack>
            {confirming === m.userId &&
              confirmBox(t("removeConfirm", { name }), t("remove"), () => remove(m.userId, name))}
          </Paper>
        );
      })}

      {household.invitations.map((i) => (
        <Paper key={i.id} variant="outlined" sx={{ p: 1.5 }}>
          <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }}>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ overflowWrap: "anywhere" }}>{i.email}</Typography>
              <Typography variant="bodySmall" color="text.secondary">
                {i.expired
                  ? t("invitationExpired", { until: longDay(i.expiresOn) })
                  : t("invitationSent", { date: longDay(i.sentOn), until: longDay(i.expiresOn) })}
              </Typography>
            </Stack>
            {confirming !== i.id && (
              <Button
                onClick={() => setConfirming(i.id)}
                aria-label={t("cancelInvitationOf", { email: i.email })}
              >
                {t("cancelInvitation")}
              </Button>
            )}
          </Stack>
          {confirming === i.id &&
            confirmBox(t("cancelConfirm", { email: i.email }), t("cancelInvitation"), () =>
              cancel(i.id),
            )}
        </Paper>
      ))}

      {inviting ? (
        <Paper
          variant="outlined"
          component="form"
          sx={{ p: 1.5 }}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            invite();
          }}
        >
          <Stack spacing={1}>
            <TextField
              id={`invitation-${slug}`}
              type="email"
              label={t("inviteEmail")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              error={inviteError !== null}
              helperText={inviteError ?? t("inviteHelp")}
            />
            <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
              <Button onClick={() => setInviting(false)}>{t("cancel")}</Button>
              <Button type="submit" variant="contained" disabled={pending || email.trim() === ""}>
                {t("sendInvite")}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      ) : (
        <div>
          <Button variant="outlined" onClick={() => setInviting(true)}>
            {t("addMember")}
          </Button>
        </div>
      )}
    </Stack>
  );
}
