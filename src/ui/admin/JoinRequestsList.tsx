"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { splitName, type JoinRequestStatus } from "@/domain/join-requests";
import { formatPhone } from "@/domain/phone";
import { formatDate } from "@/i18n/dates";
import type { JoinRequestView } from "@/server/join-requests";
import { acceptJoinRequestAction, decideJoinRequestAction } from "@/server/join-requests-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { m3 } from "../theme/create-theme";
import type { M3Role } from "../theme/m3-colors";
import { visuallyHidden } from "../visually-hidden";

const STATUS: Record<JoinRequestStatus, [M3Role, M3Role]> = {
  new: ["tertiaryContainer", "onTertiaryContainer"],
  contacted: ["secondaryContainer", "onSecondaryContainer"],
  accepted: ["surfaceContainerHigh", "onSurfaceVariant"],
  declined: ["surfaceContainerHigh", "onSurfaceVariant"],
};

const day = (date: Date) => formatDate(date.toISOString(), "d MMMM yyyy");

/**
 * Onglet « Demandes d'adhésion » (story B2, écran A2) : demandes à traiter, chacune avec
 * Écrire, Appeler, Marquer comme contactée, Refuser, Accepter (création du foyer et de son
 * adhésion, puis invitation) ; puis les dernières demandes closes.
 */
export function JoinRequestsList({
  amapSlug,
  requests,
  defaultDays,
}: {
  amapSlug: string;
  requests: { open: JoinRequestView[]; closed: JoinRequestView[] };
  /** Adhésion proposée : d'aujourd'hui à dans un an moins un jour. */
  defaultDays: { startDate: string; endDate: string };
}) {
  const t = useTranslations("Admin.joinRequests");
  const router = useRouter();
  const showSnackbar = useSnackbar();
  const [accepting, setAccepting] = useState<string | null>(null);
  const [declining, setDeclining] = useState<JoinRequestView | null>(null);
  const [pending, setPending] = useState(false);

  const decide = async (request: JoinRequestView, decision: "contacted" | "declined") => {
    setPending(true);
    const result = await decideJoinRequestAction(amapSlug, { requestId: request.id, decision });
    setPending(false);
    setDeclining(null);
    showSnackbar({
      message:
        result.status === "saved"
          ? t(decision === "contacted" ? "markedContacted" : "declined", { name: request.name })
          : t("error"),
    });
    router.refresh();
  };

  return (
    <Stack spacing={3}>
      <Typography>{t("intro")}</Typography>
      {requests.open.length === 0 && <Typography>{t("none")}</Typography>}
      {requests.open.map((r) => {
        const [bg, fg] = STATUS[r.status];
        return (
          <Paper
            key={r.id}
            variant="outlined"
            component="section"
            aria-label={r.name}
            sx={{ p: 2.5 }}
          >
            <Stack
              direction="row"
              sx={{ justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}
            >
              <Box>
                <Typography variant="titleMedium" component="h2">
                  {r.name}
                </Typography>
                <Typography variant="bodyMedium" component="p" color="text.secondary">
                  {r.email}
                  {r.phone && ` · ${formatPhone(r.phone)}`}
                </Typography>
                <Typography variant="bodySmall" component="p" color="text.secondary">
                  {t("receivedOn", { date: day(r.createdAt) })}
                </Typography>
              </Box>
              <Chip
                size="small"
                label={t(`status.${r.status}`)}
                sx={{ bgcolor: m3(bg), color: m3(fg), fontWeight: 500 }}
              />
            </Stack>
            {r.message && (
              <Typography
                component="blockquote"
                sx={{
                  m: 0,
                  mt: 1.5,
                  pl: 2,
                  borderLeft: 3,
                  borderColor: "divider",
                  whiteSpace: "pre-line",
                }}
              >
                {r.message}
              </Typography>
            )}
            {accepting === r.id ? (
              <AcceptForm
                amapSlug={amapSlug}
                request={r}
                defaultDays={defaultDays}
                onCancel={() => setAccepting(null)}
                onDone={(message) => {
                  setAccepting(null);
                  showSnackbar({ message });
                  router.refresh();
                }}
              />
            ) : (
              <Stack direction="row" sx={{ gap: 1, mt: 2, flexWrap: "wrap" }}>
                <Button variant="outlined" href={`mailto:${r.email}`}>
                  {t("write")}
                  <Box component="span" sx={visuallyHidden}>
                    {` ${r.name}`}
                  </Box>
                </Button>
                {r.phone && (
                  <Button variant="outlined" href={`tel:${r.phone}`}>
                    {t("call")}
                    <Box component="span" sx={visuallyHidden}>
                      {` ${r.name}`}
                    </Box>
                  </Button>
                )}
                {r.status === "new" && (
                  <Button disabled={pending} onClick={() => void decide(r, "contacted")}>
                    {t("markContacted")}
                    <Box component="span" sx={visuallyHidden}>
                      {` : ${r.name}`}
                    </Box>
                  </Button>
                )}
                <Button color="error" disabled={pending} onClick={() => setDeclining(r)}>
                  {t("decline")}
                  <Box component="span" sx={visuallyHidden}>
                    {` ${r.name}`}
                  </Box>
                </Button>
                <Button variant="contained" disabled={pending} onClick={() => setAccepting(r.id)}>
                  {t("accept")}
                  <Box component="span" sx={visuallyHidden}>
                    {` ${r.name}`}
                  </Box>
                </Button>
              </Stack>
            )}
          </Paper>
        );
      })}

      {requests.closed.length > 0 && (
        <Box component="section" aria-labelledby="demandes-closes">
          <Typography id="demandes-closes" variant="titleMedium" component="h2" sx={{ mb: 1 }}>
            {t("closedTitle")}
          </Typography>
          <Stack component="ul" spacing={1} sx={{ m: 0, pl: 2.5 }}>
            {requests.closed.map((r) => (
              <li key={r.id}>
                <Typography variant="bodyMedium" component="span">
                  {r.name} · {t(`status.${r.status}`)}
                  {r.handledAt && ` ${t("on", { date: day(r.handledAt) })}`}
                </Typography>
                {r.householdId && (
                  <>
                    {" · "}
                    <MuiLink component={Link} href={`/${amapSlug}/admin/foyers/${r.householdId}`}>
                      {t("seeHousehold")}
                    </MuiLink>
                  </>
                )}
              </li>
            ))}
          </Stack>
        </Box>
      )}

      <Dialog
        open={declining !== null}
        onClose={() => setDeclining(null)}
        aria-labelledby="refus-titre"
      >
        <DialogTitle id="refus-titre">
          {t("declineTitle", { name: declining?.name ?? "" })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>{t("declineText")}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeclining(null)}>{t("cancel")}</Button>
          <Button
            color="error"
            variant="contained"
            disabled={pending}
            onClick={() => declining && void decide(declining, "declined")}
          >
            {t("confirmDecline")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

/** Création du foyer depuis une demande : nom du foyer, membre, dates d'adhésion. */
function AcceptForm({
  amapSlug,
  request,
  defaultDays,
  onCancel,
  onDone,
}: {
  amapSlug: string;
  request: JoinRequestView;
  defaultDays: { startDate: string; endDate: string };
  onCancel: () => void;
  onDone: (message: string) => void;
}) {
  const t = useTranslations("Admin.joinRequests");
  const names = splitName(request.name);
  const [values, setValues] = useState({
    householdName: names.lastName ? `Foyer ${names.lastName}` : `Foyer ${names.firstName}`,
    firstName: names.firstName,
    lastName: names.lastName,
    email: request.email,
    startDate: defaultDays.startDate,
    endDate: defaultDays.endDate,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const field = (key: keyof typeof values) => ({
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value })),
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    const result = await acceptJoinRequestAction(amapSlug, {
      requestId: request.id,
      ...values,
      phone: request.phone ?? "",
    });
    setPending(false);
    if (result.status === "accepted") {
      onDone(
        result.failedInvitations
          ? t("acceptedNoEmail", { household: values.householdName.trim() })
          : t("accepted", { household: values.householdName.trim(), email: values.email.trim() }),
      );
      return;
    }
    setError(
      result.status === "household"
        ? t(`householdErrors.${result.result.status}`)
        : result.status === "membership"
          ? t("membershipError")
          : t("error"),
    );
  };

  return (
    <Box
      component="form"
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-label={t("acceptTitle", { name: request.name })}
      sx={{ mt: 2, p: 2, borderRadius: 3, bgcolor: m3("surfaceContainer") }}
    >
      <Stack spacing={2}>
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
        <TextField label={t("householdName")} required {...field("householdName")} />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField label={t("firstName")} required fullWidth {...field("firstName")} />
          <TextField label={t("lastName")} fullWidth {...field("lastName")} />
        </Stack>
        <TextField label={t("email")} type="email" required {...field("email")} />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label={t("startDate")}
            type="date"
            required
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
            {...field("startDate")}
          />
          <TextField
            label={t("endDate")}
            type="date"
            required
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
            {...field("endDate")}
          />
        </Stack>
        <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
          <Button onClick={onCancel}>{t("cancel")}</Button>
          <Button type="submit" variant="contained" disabled={pending}>
            {t("createAndInvite")}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
