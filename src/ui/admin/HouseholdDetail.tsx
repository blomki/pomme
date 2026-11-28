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
import { producersLeftWithoutReferent } from "@/domain/member-roles";
import { type AmapRoleName } from "@/domain/roles";
import type { FieldError, HouseholdMemberView, HouseholdView } from "@/server/households";
import type { RoleProducer } from "@/server/member-roles";
import {
  addMemberAction,
  anonymizeHouseholdAction,
  resendInvitationAction,
  setHouseholdArchivedAction,
  saveMemberRolesAction,
  setPrimaryContactAction,
  type AddMemberState,
} from "@/server/households-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";

import { CorrectEmailDialog } from "./CorrectEmailDialog";
import { ResetSecondFactorDialog } from "./ResetSecondFactorDialog";
import { PageBanner } from "../layout/PageBanner";

const fullName = (m: { firstName: string; lastName: string }) =>
  `${m.firstName} ${m.lastName}`.trim();

/** Fiche d'un foyer (story A2) : membres, rôles, invitation, ajout d'un membre, archivage. */
export function HouseholdDetail({
  amapSlug,
  household,
  roleProducers = [],
  memberships,
  orders,
}: {
  amapSlug: string;
  household: HouseholdView;
  /** Producteurs actifs et leurs référents, pour la fenêtre « Rôles » (fiche #138). */
  roleProducers?: RoleProducer[];
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
  const [factorOf, setFactorOf] = useState<HouseholdMemberView | null>(null);
  // Membres réinitialisés depuis l'affichage de la page : le bouton disparaît aussitôt, sans
  // recharger (il n'y a plus rien à réinitialiser).
  const [resetDone, setResetDone] = useState<ReadonlySet<string>>(new Set());
  const tf = useTranslations("Admin.resetSecondFactor");
  const tb = useTranslations("Banners");
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
      showSnackbar({
        message: result.status === "forbidden" ? t("forbidden") : t("error"),
        severity: "error",
      });
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
      <PageBanner title={household.name}>{tb("householdDetail")}</PageBanner>
      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 2, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}
      >
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
                        {/* Admin ou référent qui a un moyen de vérification, sauf soi-même (S10, #125). */}
                        {member.canResetSecondFactor && !resetDone.has(member.userId) && (
                          <Button
                            size="small"
                            onClick={() => setFactorOf(member)}
                            aria-label={tf("resetOf", { name })}
                          >
                            {tf("reset")}
                          </Button>
                        )}
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
          producers={roleProducers}
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
      {factorOf && (
        <ResetSecondFactorDialog
          key={factorOf.userId}
          amapSlug={amapSlug}
          person={{ userId: factorOf.userId, name: fullName(factorOf) }}
          onReset={() => setResetDone((done) => new Set(done).add(factorOf.userId))}
          onClose={() => setFactorOf(null)}
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
 * Rôles d'un membre (fiche #138) : « Administrateur », puis une case « Référent : <producteur> »
 * par producteur actif, ceux que la personne suit en premier. Le rôle de référent se déduit des
 * producteurs cochés. Rien n'est enregistré avant « Enregistrer » : la fenêtre annonce d'abord
 * les producteurs qui n'auraient plus de référent.
 */
function RolesDialog({
  amapSlug,
  householdId,
  member,
  producers,
  onClose,
}: {
  amapSlug: string;
  householdId: string;
  member: HouseholdMemberView;
  producers: RoleProducer[];
  onClose: () => void;
}) {
  const t = useTranslations("Admin.roles");
  const th = useTranslations("Admin.household");
  const showSnackbar = useSnackbar();
  const name = fullName(member);
  const followedAtOpen = producers
    .filter((p) => p.referentIds.includes(member.userId))
    .map((p) => p.amapProducerId);
  // Ordre fixé à l'ouverture : suivis d'abord, puis par nom (la liste arrive triée par nom).
  const [ordered] = useState(() => [
    ...producers.filter((p) => followedAtOpen.includes(p.amapProducerId)),
    ...producers.filter((p) => !followedAtOpen.includes(p.amapProducerId)),
  ]);
  const [admin, setAdmin] = useState(member.roles.includes("admin"));
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set(followedAtOpen));
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const unassigned = followedAtOpen.filter((id) => !checked.has(id));
  const orphaned = producersLeftWithoutReferent(
    unassigned,
    new Map(producers.map((p) => [p.amapProducerId, p.referentIds.length])),
  ).map((id) => producers.find((p) => p.amapProducerId === id)!.name);

  const toggle = (amapProducerId: string, value: boolean) =>
    setChecked((current) => {
      const next = new Set(current);
      if (value) next.add(amapProducerId);
      else next.delete(amapProducerId);
      return next;
    });

  const save = async () => {
    setPending(true);
    setProblem(null);
    const result = await saveMemberRolesAction({
      amap: amapSlug,
      householdId,
      userId: member.userId,
      admin,
      referentOf: [...checked],
    });
    setPending(false);
    if (result.status === "saved") {
      showSnackbar({ message: t("updated", { name }) });
      onClose();
    } else if (result.status === "last_admin") {
      setProblem(t("lastAdmin"));
    } else {
      setProblem(result.status === "forbidden" ? th("forbidden") : th("error"));
    }
  };

  const option = (
    id: string,
    label: string,
    help: string,
    value: boolean,
    onChange: (v: boolean) => void,
  ) => (
    <Box key={id} sx={{ mb: 1 }}>
      <FormControlLabel
        control={
          <Checkbox
            checked={value}
            disabled={pending}
            onChange={(e) => onChange(e.target.checked)}
            slotProps={{ input: { "aria-describedby": `${id}-help` } }}
          />
        }
        label={label}
      />
      <FormHelperText id={`${id}-help`} sx={{ mt: -0.5, ml: 4 }}>
        {help}
      </FormHelperText>
    </Box>
  );

  return (
    <Dialog open onClose={onClose} aria-labelledby="roles-title" fullWidth maxWidth="sm">
      <DialogTitle id="roles-title">{t("dialogTitle", { name })}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{t("dialogIntro")}</DialogContentText>
        <FormGroup>
          {option("role-admin", t("admin"), t("adminHelp"), admin, setAdmin)}
          {ordered.map((p) =>
            option(
              `role-referent-${p.amapProducerId}`,
              t("referentOf", { producer: p.name }),
              t("referentHelp"),
              checked.has(p.amapProducerId),
              (value) => toggle(p.amapProducerId, value),
            ),
          )}
        </FormGroup>
        {producers.length === 0 && (
          <DialogContentText sx={{ mt: 1 }}>{t("noProducers")}</DialogContentText>
        )}
        <div role="status" aria-live="polite">
          {orphaned.length > 0 && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {orphaned.map((producer) => (
                <div key={producer}>{t("orphaned", { producer })}</div>
              ))}
            </Alert>
          )}
          {problem && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {problem}
            </Alert>
          )}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("cancel")}</Button>
        <Button variant="contained" onClick={() => void save()} disabled={pending}>
          {t("save")}
        </Button>
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
