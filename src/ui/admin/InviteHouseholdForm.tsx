"use client";

import Add from "@mui/icons-material/Add";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { FieldError } from "@/server/households";
import { createHouseholdAction, type CreateHouseholdState } from "@/server/households-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";

/** Au plus 8 membres par foyer (même limite que le serveur). */
const MAX_MEMBERS = 8;

type MemberRow = { key: number; email: string; firstName: string; lastName: string; phone: string };

const emptyMember = (key: number): MemberRow => ({
  key,
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
});

const MEMBER_FIELDS = ["email", "firstName", "lastName", "phone"] as const;

/**
 * « Inviter un foyer » : nom du foyer, puis un bloc par membre (email, prénom, nom, téléphone)
 * et le choix du contact principal. Les champs sont contrôlés : en cas d'erreur, rien de ce qui
 * a été saisi n'est perdu.
 */
export function InviteHouseholdForm({ amapSlug }: { amapSlug: string }) {
  const t = useTranslations("Admin.inviteHousehold");
  const router = useRouter();
  const showSnackbar = useSnackbar();
  const [state, setState] = useState<CreateHouseholdState>({ status: "idle" });
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [members, setMembers] = useState<MemberRow[]>([emptyMember(0)]);
  const [primary, setPrimary] = useState(0);
  const nextKey = useRef(1);
  const summaryRef = useRef<HTMLDivElement>(null);

  const errors: FieldError[] = state.status === "invalid" ? state.errors : [];
  const fieldError = (field: string, member?: number) =>
    errors.some((e) => e.field === field && e.member === member)
      ? t(`errors.${field}` as "errors.email")
      : null;

  const update = (index: number, field: (typeof MEMBER_FIELDS)[number], value: string) =>
    setMembers((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  const addMember = () => {
    setMembers((rows) => [...rows, emptyMember(nextKey.current++)]);
  };

  const removeMember = (index: number) => {
    setMembers((rows) => rows.filter((_, i) => i !== index));
    setPrimary((p) => (p === index ? 0 : p > index ? p - 1 : p));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData();
    data.set("amap", amapSlug);
    data.set("name", name);
    data.set("primary", String(primary));
    members.forEach((row, i) => {
      for (const field of MEMBER_FIELDS) data.set(`members.${i}.${field}`, row[field]);
    });
    setPending(true);
    const result = await createHouseholdAction({ status: "idle" }, data);
    setPending(false);
    if (result.status === "created") {
      const message = result.failedInvitations
        ? t("createdWithFailures", { name, count: result.failedInvitations })
        : t("created", { name });
      showSnackbar({ message });
      router.push(`/${amapSlug}/admin/foyers/${result.householdId}`);
      return;
    }
    setState(result);
    // Erreur : le résumé prend le focus, pour qu'un lecteur d'écran l'annonce aussitôt.
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  const summary = (() => {
    switch (state.status) {
      case "invalid":
        return t("errors.summary");
      case "member_taken":
        return state.email
          ? t("errors.member_taken", { email: state.email })
          : t("errors.member_taken_unknown");
      case "name_taken":
      case "duplicate_email":
      case "primary_count":
      case "no_member":
      case "forbidden":
        return t(`errors.${state.status}`);
      default:
        return null;
    }
  })();

  return (
    <Box component="form" onSubmit={(e) => void submit(e)} noValidate sx={{ maxWidth: 720 }}>
      {/* Reçoit le focus après une erreur ; l'Alert de MUI porte elle-même role="alert". */}
      <Box ref={summaryRef} tabIndex={-1} sx={{ mb: summary ? 2 : 0 }}>
        {summary && <Alert severity="error">{summary}</Alert>}
      </Box>

      <TextField
        label={t("name")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        fullWidth
        error={fieldError("name") !== null || state.status === "name_taken"}
        helperText={
          fieldError("name") ??
          (state.status === "name_taken" ? t("errors.name_taken") : t("nameHelp"))
        }
        sx={{ mb: 3 }}
      />

      <Stack spacing={2}>
        {members.map((row, i) => (
          <Paper
            key={row.key}
            component="fieldset"
            variant="outlined"
            sx={{ p: 2, m: 0, border: 1, borderColor: "divider" }}
          >
            <Typography component="legend" variant="titleMedium" sx={{ px: 0.5 }}>
              {t("memberLegend", { number: i + 1 })}
            </Typography>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label={t("email")}
                type="email"
                autoComplete="off"
                value={row.email}
                onChange={(e) => update(i, "email", e.target.value)}
                required
                error={fieldError("email", i) !== null}
                helperText={fieldError("email", i) ?? " "}
              />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label={t("firstName")}
                  value={row.firstName}
                  onChange={(e) => update(i, "firstName", e.target.value)}
                  required
                  fullWidth
                  error={fieldError("firstName", i) !== null}
                  helperText={fieldError("firstName", i) ?? " "}
                />
                <TextField
                  label={t("lastName")}
                  value={row.lastName}
                  onChange={(e) => update(i, "lastName", e.target.value)}
                  fullWidth
                  error={fieldError("lastName", i) !== null}
                  helperText={fieldError("lastName", i) ?? t("lastNameHelp")}
                />
              </Stack>
              <TextField
                label={t("phone")}
                type="tel"
                autoComplete="off"
                value={row.phone}
                onChange={(e) => update(i, "phone", e.target.value)}
                error={fieldError("phone", i) !== null}
                helperText={fieldError("phone", i) ?? t("phoneHelp")}
              />
              <Stack direction="row" sx={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <FormControlLabel
                  control={
                    <Radio
                      name="primary"
                      checked={primary === i}
                      onChange={() => setPrimary(i)}
                      value={String(i)}
                    />
                  }
                  label={t("primary")}
                />
                {members.length > 1 && (
                  <Button
                    color="error"
                    startIcon={<DeleteOutlined />}
                    onClick={() => removeMember(i)}
                    aria-label={t("removeMember", { number: i + 1 })}
                  >
                    {t("removeMember", { number: i + 1 })}
                  </Button>
                )}
              </Stack>
            </Stack>
          </Paper>
        ))}
      </Stack>

      {members.length < MAX_MEMBERS && (
        <Button startIcon={<Add />} onClick={addMember} sx={{ mt: 2 }}>
          {t("addMember")}
        </Button>
      )}

      <Stack direction="row" spacing={2} sx={{ mt: 4 }}>
        <Button type="submit" variant="contained" disabled={pending}>
          {t("submit")}
        </Button>
        <Button component={Link} href={`/${amapSlug}/admin/foyers`} nativeButton={false}>
          {t("cancel")}
        </Button>
      </Stack>
    </Box>
  );
}
