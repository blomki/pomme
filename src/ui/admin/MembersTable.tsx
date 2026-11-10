"use client";

import EditOutlined from "@mui/icons-material/EditOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";

import type { AmapMember } from "@/server/members";
import { correctMemberEmailAction, type CorrectEmailState } from "@/server/members-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";

const fullName = (member: AmapMember) => `${member.firstName} ${member.lastName}`.trim();

/** Membres de l'AMAP qui ont un rôle, avec « Corriger l'email ». */
export function MembersTable({ amapSlug, members }: { amapSlug: string; members: AmapMember[] }) {
  const t = useTranslations("Admin.members");
  const tr = useTranslations("Roles");
  const [editing, setEditing] = useState<AmapMember | null>(null);

  return (
    <>
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell scope="col">{t("name")}</TableCell>
              <TableCell scope="col">{t("email")}</TableCell>
              <TableCell scope="col">{t("roles")}</TableCell>
              <TableCell scope="col">{t("actions")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell component="th" scope="row">
                  {fullName(member)}
                </TableCell>
                <TableCell>{member.email}</TableCell>
                <TableCell>{member.roles.map((role) => tr(role)).join(", ")}</TableCell>
                <TableCell>
                  <Button
                    size="small"
                    startIcon={<EditOutlined />}
                    aria-label={t("correctEmailOf", { name: fullName(member) })}
                    onClick={() => setEditing(member)}
                  >
                    {t("correctEmail")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {editing && (
        <CorrectEmailDialog
          key={editing.id}
          amapSlug={amapSlug}
          member={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function CorrectEmailDialog({
  amapSlug,
  member,
  onClose,
}: {
  amapSlug: string;
  member: AmapMember;
  onClose: () => void;
}) {
  const t = useTranslations("Admin.members");
  const showSnackbar = useSnackbar();
  const [state, formAction, pending] = useActionState<CorrectEmailState, FormData>(
    correctMemberEmailAction,
    { status: "idle" },
  );
  const name = fullName(member);

  useEffect(() => {
    if (state.status === "corrected") {
      showSnackbar({ message: t("saved", { name }) });
      onClose();
    }
  }, [state.status, showSnackbar, t, name, onClose]);

  const fieldError =
    state.status === "invalid"
      ? t("invalid")
      : state.status === "same"
        ? t("same")
        : state.status === "taken"
          ? t("taken")
          : null;

  return (
    <Dialog open onClose={onClose} aria-labelledby="correct-email-title" fullWidth maxWidth="sm">
      <form action={formAction} noValidate>
        <DialogTitle id="correct-email-title">{t("dialogTitle", { name })}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>{t("dialogIntro")}</DialogContentText>
          <input type="hidden" name="amap" value={amapSlug} />
          <input type="hidden" name="userId" value={member.id} />
          <TextField
            name="email"
            type="email"
            label={t("newEmail")}
            defaultValue={member.email}
            autoComplete="off"
            required
            fullWidth
            error={fieldError !== null}
            helperText={fieldError ?? " "}
          />
          <div role="status" aria-live="polite">
            {state.status === "forbidden" && <Alert severity="error">{t("forbidden")}</Alert>}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("cancel")}</Button>
          <Button type="submit" variant="contained" disabled={pending}>
            {t("save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
