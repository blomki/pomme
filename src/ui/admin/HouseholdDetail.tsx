"use client";

import ArrowBack from "@mui/icons-material/ArrowBack";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import FormHelperText from "@mui/material/FormHelperText";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { formatPhone } from "@/domain/phone";
import { AMAP_ROLES, type AmapRoleName } from "@/domain/roles";
import type { FieldError, HouseholdMemberView, HouseholdView } from "@/server/households";
import {
  addMemberAction,
  anonymizeHouseholdAction,
  resendInvitationAction,
  setHouseholdArchivedAction,
  setMemberRoleAction,
  setPrimaryContactAction,
  type AddMemberState,
} from "@/server/households-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";

import { CorrectEmailDialog } from "./CorrectEmailDialog";

const fullName = (m: { firstName: string; lastName: string }) =>
  `${m.firstName} ${m.lastName}`.trim();

/** Fiche d'un foyer (story A2) : membres, rôles, invitation, ajout d'un membre, archivage. */
export function HouseholdDetail({
  amapSlug,
  household,
  memberships,
  orders,
}: {
  amapSlug: string;
  household: HouseholdView;
  /** Section « Adhésion » (story B1), placée après les membres. */
  memberships?: ReactNode;
  /** Section « Commande du mois » (story D7), après l'adhésion. */
  orders?: ReactNode;
}) {
  const t = useTranslations("Admin.household");
  const tl = useTranslations("Admin.households");
  const tc = useTranslations("Admin.correctEmail");
  const showSnackbar = useSnackbar();
  const [rolesOf, setRolesOf] = useState<HouseholdMemberView | null>(null);
  const [emailOf, setEmailOf] = useState<HouseholdMemberView | null>(null);
  const archived = household.archivedAt !== null;
  const anonymized = household.anonymizedAt !== null;
  const [anonymizing, setAnonymizing] = useState(false);
  const ref = { amap: amapSlug, householdId: household.id };

  const setArchived = async (value: boolean) => {
    const result = await setHouseholdArchivedAction({ ...ref, archived: value });
    if (result.status === "archived") {
      showSnackbar({
        message: t("archived", { name: household.name }),
        onUndo: () => void setArchived(false),
      });
    } else if (result.status === "restored") {
      showSnackbar({ message: t("restored", { name: household.name }) });
    } else if (result.status === "name_taken") {
      showSnackbar({ message: t("restoreNameTaken") });
    } else if (result.status === "member_taken") {
      showSnackbar({ message: t("restoreMemberTaken") });
    } else {
      showSnackbar({ message: result.status === "forbidden" ? t("forbidden") : t("error") });
    }
  };

  const makePrimary = async (member: HouseholdMemberView) => {
    const result = await setPrimaryContactAction({ ...ref, userId: member.userId });
    showSnackbar({
      message:
        result.status === "updated" ? t("primaryUpdated", { name: fullName(member) }) : t("error"),
    });
  };

  const resend = async (member: HouseholdMemberView) => {
    const result = await resendInvitationAction({ ...ref, userId: member.userId });
    showSnackbar({
      message:
        result.status === "sent" ? t("resent", { name: fullName(member) }) : t("resendFailed"),
    });
  };

  return (
    <>
      <Button
        component={Link}
        href={`/${amapSlug}/admin/foyers${archived ? "?archives=1" : ""}`}
        nativeButton={false}
        startIcon={<ArrowBack />}
        sx={{ mb: 2 }}
      >
        {tl("back")}
      </Button>
      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 2, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}
      >
        <Typography variant="h1">{household.name}</Typography>
        {anonymized ? null : archived ? (
          <Button variant="contained" onClick={() => void setArchived(false)}>
            {t("restore")}
          </Button>
        ) : (
          <Button variant="outlined" color="error" onClick={() => void setArchived(true)}>
            {t("archive")}
          </Button>
        )}
      </Stack>
      {archived && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {anonymized ? t("anonymizedNotice") : t("archivedNotice")}
        </Alert>
      )}

      <Typography variant="h2" sx={{ mt: 3, mb: 1 }}>
        {t("membersTitle")}
      </Typography>
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell scope="col">{t("name")}</TableCell>
              <TableCell scope="col">{t("email")}</TableCell>
              <TableCell scope="col">{t("phone")}</TableCell>
              <TableCell scope="col">{t("status")}</TableCell>
              <TableCell scope="col">{t("roles")}</TableCell>
              {!archived && <TableCell scope="col">{t("actions")}</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {household.members.map((member) => {
              const name = fullName(member);
              return (
                <TableRow key={member.userId}>
                  <TableCell component="th" scope="row">
                    <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
                      <span>{name}</span>
                      {member.isPrimary && (
                        <Chip size="small" variant="outlined" label={tl("primaryContact")} />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>{member.phone ? formatPhone(member.phone) : ""}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={member.status === "active" ? "success" : "default"}
                      label={member.status === "active" ? tl("statusActive") : tl("statusInvited")}
                    />
                  </TableCell>
                  <TableCell>
                    <RoleNames roles={member.roles} />
                  </TableCell>
                  {!archived && (
                    <TableCell>
                      <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
                        <Button
                          size="small"
                          onClick={() => setRolesOf(member)}
                          aria-label={t("editRolesOf", { name })}
                        >
                          {t("editRoles")}
                        </Button>
                        <Button
                          size="small"
                          onClick={() => setEmailOf(member)}
                          aria-label={tc("correctEmailOf", { name })}
                        >
                          {tc("correctEmail")}
                        </Button>
                        {!member.isPrimary && (
                          <Button
                            size="small"
                            onClick={() => void makePrimary(member)}
                            aria-label={t("makePrimaryOf", { name })}
                          >
                            {t("makePrimary")}
                          </Button>
                        )}
                        {member.status === "invited" && (
                          <Button
                            size="small"
                            onClick={() => void resend(member)}
                            aria-label={t("resendOf", { name })}
                          >
                            {t("resend")}
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {!archived && <AddMemberForm amapSlug={amapSlug} householdId={household.id} />}

      {memberships}

      {orders}

      {!anonymized && (
        <Box component="section" aria-labelledby="privacy-title" sx={{ mt: 5, maxWidth: 720 }}>
          <Typography id="privacy-title" variant="h2" sx={{ mb: 1 }}>
            {t("privacyTitle")}
          </Typography>
          <Typography sx={{ mb: 2 }}>{t("privacyIntro")}</Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            {/* Lien de téléchargement (fichier JSON), pas une navigation Next. */}
            <Button
              variant="outlined"
              component="a"
              href={`/${amapSlug}/admin/foyers/${household.id}/export`}
              download
              nativeButton={false}
            >
              {t("export")}
            </Button>
            <Button variant="outlined" color="error" onClick={() => setAnonymizing(true)}>
              {t("anonymize")}
            </Button>
          </Stack>
        </Box>
      )}
      {anonymizing && (
        <AnonymizeDialog
          amapSlug={amapSlug}
          household={household}
          onClose={() => setAnonymizing(false)}
        />
      )}

      {rolesOf && (
        <RolesDialog
          key={rolesOf.userId}
          amapSlug={amapSlug}
          householdId={household.id}
          member={rolesOf}
          onClose={() => setRolesOf(null)}
        />
      )}
      {emailOf && (
        <CorrectEmailDialog
          key={emailOf.userId}
          amapSlug={amapSlug}
          person={{ userId: emailOf.userId, name: fullName(emailOf), email: emailOf.email }}
          onClose={() => setEmailOf(null)}
        />
      )}
    </>
  );
}

/** Rôles d'un membre, en clair ; « Amapien » s'il n'en a aucun. */
function RoleNames({ roles }: { roles: AmapRoleName[] }) {
  const t = useTranslations("Admin.roles");
  const th = useTranslations("Admin.household");
  return <>{roles.length === 0 ? th("noRole") : roles.map((role) => t(role)).join(", ")}</>;
}

/**
 * Rôles d'un membre : une case par rôle. Chaque case enregistre aussitôt (et l'inscrit au
 * journal) ; un message confirme le changement.
 */
function RolesDialog({
  amapSlug,
  householdId,
  member,
  onClose,
}: {
  amapSlug: string;
  householdId: string;
  member: HouseholdMemberView;
  onClose: () => void;
}) {
  const t = useTranslations("Admin.roles");
  const th = useTranslations("Admin.household");
  const showSnackbar = useSnackbar();
  const [roles, setRoles] = useState<AmapRoleName[]>(member.roles);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const name = fullName(member);

  const toggle = async (role: AmapRoleName, granted: boolean) => {
    // La case change tout de suite ; elle revient en arrière si le serveur refuse.
    const previous = roles;
    setRoles(granted ? [...new Set([...roles, role])] : roles.filter((r) => r !== role));
    setPending(true);
    setProblem(null);
    const result = await setMemberRoleAction({
      amap: amapSlug,
      householdId,
      userId: member.userId,
      role,
      granted,
    });
    setPending(false);
    if (result.status === "updated" || result.status === "unchanged") {
      showSnackbar({ message: t("updated", { name }) });
      return;
    }
    setRoles(previous);
    if (result.status === "last_admin") {
      setProblem(t("lastAdmin"));
    } else if (result.status === "has_producers") {
      setProblem(
        t("hasProducers", {
          producers: new Intl.ListFormat("fr", { type: "conjunction" }).format(result.producers),
        }),
      );
    } else {
      setProblem(result.status === "forbidden" ? th("forbidden") : th("error"));
    }
  };

  return (
    <Dialog open onClose={onClose} aria-labelledby="roles-title" fullWidth maxWidth="sm">
      <DialogTitle id="roles-title">{t("dialogTitle", { name })}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{t("dialogIntro")}</DialogContentText>
        <FormGroup>
          {AMAP_ROLES.map((role) => (
            <Box key={role} sx={{ mb: 1 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={roles.includes(role)}
                    disabled={pending}
                    onChange={(e) => void toggle(role, e.target.checked)}
                    slotProps={{ input: { "aria-describedby": `role-${role}-help` } }}
                  />
                }
                label={t(role)}
              />
              <FormHelperText id={`role-${role}-help`} sx={{ mt: -0.5, ml: 4 }}>
                {t(`${role}Help`)}
              </FormHelperText>
            </Box>
          ))}
        </FormGroup>
        <div role="status" aria-live="polite">
          {problem && <Alert severity="warning">{problem}</Alert>}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

const MEMBER_FIELDS = ["email", "firstName", "lastName", "phone"] as const;
type MemberFields = Record<(typeof MEMBER_FIELDS)[number], string>;
const EMPTY: MemberFields = { email: "", firstName: "", lastName: "", phone: "" };

/** « Ajouter un membre » au foyer, qui reçoit aussitôt son invitation. */
function AddMemberForm({ amapSlug, householdId }: { amapSlug: string; householdId: string }) {
  const t = useTranslations("Admin.household");
  const ti = useTranslations("Admin.inviteHousehold");
  const showSnackbar = useSnackbar();
  const [state, setState] = useState<AddMemberState>({ status: "idle" });
  const [pending, setPending] = useState(false);
  const [fields, setFields] = useState<MemberFields>(EMPTY);

  const errors: FieldError[] = state.status === "invalid" ? state.errors : [];
  const fieldError = (field: string) =>
    errors.some((e) => e.field === field) ? ti(`errors.${field}` as "errors.email") : null;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData();
    data.set("amap", amapSlug);
    data.set("householdId", householdId);
    for (const field of MEMBER_FIELDS) data.set(`members.0.${field}`, fields[field]);
    setPending(true);
    const result = await addMemberAction({ status: "idle" }, data);
    setPending(false);
    setState(result);
    if (result.status === "added") {
      showSnackbar({
        message: result.failedInvitations
          ? t("resendFailed")
          : t("memberAdded", { name: fullName(fields) }),
      });
      setFields(EMPTY);
    }
  };

  const set = (field: keyof MemberFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((current) => ({ ...current, [field]: e.target.value }));

  const problem =
    state.status === "member_taken"
      ? ti("errors.member_taken", { email: state.email })
      : state.status === "forbidden"
        ? t("forbidden")
        : state.status === "not_found" || state.status === "archived"
          ? t("error")
          : null;

  return (
    <Box
      component="form"
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-labelledby="add-member-title"
      sx={{ mt: 5, maxWidth: 720 }}
    >
      <Typography id="add-member-title" variant="h2" sx={{ mb: 2 }}>
        {t("addMemberTitle")}
      </Typography>
      <Stack spacing={2}>
        <TextField
          label={ti("email")}
          type="email"
          autoComplete="off"
          value={fields.email}
          onChange={set("email")}
          required
          error={fieldError("email") !== null}
          helperText={fieldError("email") ?? " "}
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label={ti("firstName")}
            value={fields.firstName}
            onChange={set("firstName")}
            required
            fullWidth
            error={fieldError("firstName") !== null}
            helperText={fieldError("firstName") ?? " "}
          />
          <TextField
            label={ti("lastName")}
            value={fields.lastName}
            onChange={set("lastName")}
            fullWidth
            error={fieldError("lastName") !== null}
            helperText={fieldError("lastName") ?? ti("lastNameHelp")}
          />
        </Stack>
        <TextField
          label={ti("phone")}
          type="tel"
          autoComplete="off"
          value={fields.phone}
          onChange={set("phone")}
          error={fieldError("phone") !== null}
          helperText={fieldError("phone") ?? ti("phoneHelp")}
        />
        <div role="status" aria-live="polite">
          {problem && <Alert severity="error">{problem}</Alert>}
        </div>
        <Box>
          <Button type="submit" variant="contained" disabled={pending}>
            {t("addMember")}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}

/**
 * Confirmation de l'anonymisation (irréversible) : on explique ce qui va disparaître, et
 * l'administrateur retape le nom du foyer. Pas d'« Annuler » après coup : c'est définitif.
 */
function AnonymizeDialog({
  amapSlug,
  household,
  onClose,
}: {
  amapSlug: string;
  household: HouseholdView;
  onClose: () => void;
}) {
  const t = useTranslations("Admin.anonymize");
  const router = useRouter();
  const showSnackbar = useSnackbar();
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    const result = await anonymizeHouseholdAction({
      amap: amapSlug,
      householdId: household.id,
      confirmName: typed,
    });
    setPending(false);
    if (result.status === "anonymized") {
      showSnackbar({ message: t("done") });
      router.push(`/${amapSlug}/admin/foyers`);
      return;
    }
    setProblem(result.status === "confirmation" ? t("wrongName") : t("error"));
  };

  return (
    <Dialog open onClose={onClose} aria-labelledby="anonymize-title" fullWidth maxWidth="sm">
      <form onSubmit={(e) => void submit(e)} noValidate>
        <DialogTitle id="anonymize-title">{t("title", { name: household.name })}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1 }}>{t("intro")}</DialogContentText>
          <Box component="ul" sx={{ mt: 0, mb: 2, pl: 3 }}>
            <li>{t("effectHousehold")}</li>
            <li>{t("effectAccounts")}</li>
            <li>{t("effectOtherAmap")}</li>
            <li>{t("effectHistory")}</li>
          </Box>
          <DialogContentText sx={{ mb: 2 }}>{t("exportFirst")}</DialogContentText>
          <TextField
            label={t("confirmLabel", { name: household.name })}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            required
            fullWidth
            error={problem !== null}
            helperText={problem ?? " "}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("cancel")}</Button>
          <Button type="submit" variant="contained" color="error" disabled={pending}>
            {t("confirm")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
