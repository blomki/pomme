"use client";

import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
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
import { useState } from "react";

import { formatEuros } from "@/domain/catalog";
import { formatDate } from "@/i18n/dates";
import type { CreditView } from "@/server/credits";

import { m3 } from "../theme/create-theme";

const numeric = { fontVariantNumeric: "tabular-nums", textAlign: "right" } as const;

/**
 * Historique des avoirs (story F2, écran R4), filtrable par producteur et par foyer : montant,
 * origine (signalement), et où il en est (en attente du prochain chèque, ou déduit du chèque de
 * tel mois).
 */
export function CreditsHistory({ credits }: { credits: CreditView[] }) {
  const t = useTranslations("Reports.history");
  const tf = useTranslations("Reports.form");
  const [producerName, setProducerName] = useState("");
  const [householdId, setHouseholdId] = useState("");
  const producers = [...new Set(credits.map((c) => c.producerName))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
  const households = [...new Map(credits.map((c) => [c.householdId, c.householdName]))].sort(
    (a, b) => a[1].localeCompare(b[1], "fr"),
  );
  const shown = credits.filter(
    (c) =>
      (producerName === "" || c.producerName === producerName) &&
      (householdId === "" || c.householdId === householdId),
  );
  const pendingTotal = shown
    .filter((c) => c.status === "created")
    .reduce((sum, c) => sum + c.amountCents, 0);

  return (
    <Stack component="section" aria-labelledby="historique-avoirs" spacing={2}>
      <Typography id="historique-avoirs" variant="h2">
        {t("title")}
      </Typography>
      {credits.length === 0 ? (
        <Typography sx={{ color: "text.secondary" }}>{t("empty")}</Typography>
      ) : (
        <>
          <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", gap: 2 }}>
            <TextField
              id="filtre-producteur"
              select
              size="small"
              label={t("producer")}
              value={producerName}
              onChange={(e) => setProducerName(e.target.value)}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">{t("all")}</MenuItem>
              {producers.map((p) => (
                <MenuItem key={p} value={p}>
                  {p}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              id="filtre-foyer"
              select
              size="small"
              label={t("household")}
              value={householdId}
              onChange={(e) => setHouseholdId(e.target.value)}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">{t("all")}</MenuItem>
              {households.map(([id, name]) => (
                <MenuItem key={id} value={id}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Typography role="status" sx={{ color: "text.secondary" }}>
            {t("summary", { count: shown.length, pending: formatEuros(pendingTotal) })}
          </Typography>
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small" aria-labelledby="historique-avoirs">
              <TableHead>
                <TableRow>
                  <TableCell scope="col">{t("date")}</TableCell>
                  <TableCell scope="col">{t("household")}</TableCell>
                  <TableCell scope="col">{t("producer")}</TableCell>
                  <TableCell scope="col">{t("origin")}</TableCell>
                  <TableCell scope="col" sx={numeric}>
                    {t("amount")}
                  </TableCell>
                  <TableCell scope="col">{t("state")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{formatDate(c.createdAt, "d MMM yyyy")}</TableCell>
                    <TableCell component="th" scope="row">
                      {c.householdName}
                    </TableCell>
                    <TableCell>{c.producerName}</TableCell>
                    <TableCell>
                      {c.source
                        ? t("fromReport", {
                            product: c.source.productName,
                            day: formatDate(`${c.source.distributionDate}T12:00:00Z`, "d MMM"),
                            reason: tf(`reasons.${c.source.reason}`),
                          })
                        : t("remainder")}
                    </TableCell>
                    <TableCell sx={numeric}>{formatEuros(c.amountCents)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={
                          c.status === "deducted" && c.deductedMonth
                            ? t("deducted", {
                                month: formatDate(`${c.deductedMonth}-01T12:00:00Z`, "MMMM yyyy"),
                              })
                            : t("pending")
                        }
                        sx={
                          c.status === "deducted"
                            ? {
                                bgcolor: m3("secondaryContainer"),
                                color: m3("onSecondaryContainer"),
                              }
                            : { bgcolor: m3("tertiaryContainer"), color: m3("onTertiaryContainer") }
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Stack>
  );
}
