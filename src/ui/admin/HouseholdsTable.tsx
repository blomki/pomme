"use client";

import Chip from "@mui/material/Chip";
import MuiLink from "@mui/material/Link";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";

import type { HouseholdView } from "@/server/households";

const fullName = (m: { firstName: string; lastName: string }) =>
  `${m.firstName} ${m.lastName}`.trim();

/** Liste des foyers : nom (lien vers la fiche), membres, invitations en attente. */
export function HouseholdsTable({
  amapSlug,
  households,
  archived = false,
}: {
  amapSlug: string;
  households: HouseholdView[];
  archived?: boolean;
}) {
  const t = useTranslations("Admin.households");
  if (households.length === 0) {
    return <Typography>{archived ? t("emptyArchived") : t("empty")}</Typography>;
  }
  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell scope="col">{t("household")}</TableCell>
            <TableCell scope="col">{t("members")}</TableCell>
            <TableCell scope="col">{t("status")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {households.map((h) => {
            const invited = h.members.filter((m) => m.status === "invited").length;
            return (
              <TableRow key={h.id}>
                <TableCell component="th" scope="row">
                  <MuiLink component={Link} href={`/${amapSlug}/admin/foyers/${h.id}`}>
                    {h.name}
                  </MuiLink>
                </TableCell>
                <TableCell>{h.members.map(fullName).join(", ")}</TableCell>
                <TableCell>
                  {invited > 0 ? (
                    <Chip size="small" label={t("invitedCount", { count: invited })} />
                  ) : (
                    <Chip size="small" variant="outlined" label={t("allActive")} />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
