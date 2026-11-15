"use client";

import Chip from "@mui/material/Chip";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";

import type { AmapProducerSummary, ReferentView } from "@/server/producers";

const fullName = (r: ReferentView) => `${r.firstName} ${r.lastName}`.trim();

/** Liste des producteurs de l'AMAP (écran A4) : référents, alerte « sans référent », statut. */
export function ProducersTable({
  amapSlug,
  producers,
}: {
  amapSlug: string;
  producers: AmapProducerSummary[];
}) {
  const t = useTranslations("Admin.producers");
  if (producers.length === 0) return <Typography>{t("empty")}</Typography>;
  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell scope="col">{t("producer")}</TableCell>
            <TableCell scope="col">{t("referents")}</TableCell>
            <TableCell scope="col">{t("status")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {producers.map((p) => {
            const missing = p.active && p.referents.length === 0;
            return (
              <TableRow key={p.id}>
                <TableCell component="th" scope="row">
                  <Stack spacing={0.25}>
                    <MuiLink component={Link} href={`/${amapSlug}/admin/producteurs/${p.id}`}>
                      {p.name}
                    </MuiLink>
                    {p.category && (
                      <Typography variant="bodySmall" sx={{ color: "text.secondary" }}>
                        {p.category}
                      </Typography>
                    )}
                  </Stack>
                </TableCell>
                <TableCell>
                  {p.referents.length > 0 ? (
                    p.referents.map(fullName).join(", ")
                  ) : (
                    <Stack spacing={0.25}>
                      <span>{t("noReferent")}</span>
                      {missing && (
                        <Typography variant="bodySmall" sx={{ color: "error.main" }}>
                          {t("noReferentHelp")}
                        </Typography>
                      )}
                    </Stack>
                  )}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    variant={p.active ? "filled" : "outlined"}
                    label={p.active ? t("active") : t("inactive")}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
