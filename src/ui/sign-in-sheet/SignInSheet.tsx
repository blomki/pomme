"use client";

import PrintOutlined from "@mui/icons-material/PrintOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import GlobalStyles from "@mui/material/GlobalStyles";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { Fragment } from "react";

import type { SheetRow, SignInSheet as SheetData } from "@/domain/sign-in-sheet";
import { formatDate } from "@/i18n/dates";

/** Masqué sur papier. */
const screenOnly = { "@media print": { display: "none" } } as const;
/** Un bloc n'est pas coupé entre deux pages (sauf s'il dépasse une page : le navigateur coupe). */
const keepTogether = { breakInside: "avoid", pageBreakInside: "avoid" } as const;

/** Cellules des tableaux : bordures fines, texte noir, compact pour tenir sur une page A4. */
const cell = {
  border: "1px solid",
  borderColor: "text.secondary",
  px: 0.75,
  py: 0.25,
  fontSize: "0.8rem",
  lineHeight: 1.4,
} as const;
/** Case « Cmd » : fond gris, imprimé (les navigateurs n'impriment pas les fonds par défaut). */
const cmdCell = {
  ...cell,
  width: "2.6rem",
  textAlign: "center",
  fontVariantNumeric: "tabular-nums",
  bgcolor: "grey.300",
  color: "common.black",
  printColorAdjust: "exact",
  WebkitPrintColorAdjust: "exact",
} as const;
const deltaCell = { ...cell, width: "2.6rem" } as const;

/**
 * Feuille d'émargement du mois (story E3, ADR 0027), au format A4 : consigne, tableau des
 * bénévoles par semaine, puis (1) livraisons par producteur et (2) retraits par foyer. Chaque
 * bloc répète l'en-tête des semaines ; « Imprimer » ouvre l'impression du navigateur (PDF
 * compris). Sur papier : ni bouton ni menu, noir sur blanc.
 */
export function SignInSheet({
  amapName,
  month,
  sheet,
}: {
  amapName: string;
  month: string;
  sheet: SheetData;
}) {
  const t = useTranslations("SignInSheet");
  const monthLabel = formatDate(`${month}-01T12:00:00Z`, "MMMM yyyy");
  const days = sheet.distributions.map((d) => formatDate(`${d.date}T12:00:00Z`, "EEE d MMM"));
  const fullDays = sheet.distributions.map((d) => formatDate(`${d.date}T12:00:00Z`, "EEEE d MMMM"));

  /** En-tête des semaines : jour sur deux colonnes, puis « Cmd » et « ± ». */
  const weeksHeader = (first: string) => (
    <Box component="thead" sx={{ display: "table-header-group" }}>
      <tr>
        <Box component="th" scope="col" rowSpan={2} sx={{ ...cell, textAlign: "left" }}>
          {first}
        </Box>
        {days.map((day, i) => (
          <Box
            component="th"
            scope="colgroup"
            colSpan={2}
            key={sheet.distributions[i]!.id}
            sx={{ ...cell, textAlign: "center" }}
          >
            <abbr title={fullDays[i]} style={{ textDecoration: "none" }}>
              {day}
            </abbr>
          </Box>
        ))}
      </tr>
      <tr>
        {sheet.distributions.map((d) => (
          <Fragment key={d.id}>
            <Box component="th" scope="col" sx={cmdCell}>
              <abbr title={t("cmdLong")} style={{ textDecoration: "none" }}>
                {t("cmd")}
              </abbr>
            </Box>
            <Box component="th" scope="col" sx={{ ...deltaCell, textAlign: "center" }}>
              <abbr title={t("deltaLong")} style={{ textDecoration: "none" }}>
                ±
              </abbr>
            </Box>
          </Fragment>
        ))}
      </tr>
    </Box>
  );

  const productRows = (rows: SheetRow[]) =>
    rows.map((row) => (
      <tr key={row.productName}>
        <Box component="th" scope="row" sx={{ ...cell, textAlign: "left", fontWeight: 400 }}>
          {row.productName}
        </Box>
        {row.perDistribution.map((quantity, i) => (
          <Fragment key={sheet.distributions[i]!.id}>
            <Box component="td" sx={cmdCell}>
              {quantity > 0 ? quantity : ""}
            </Box>
            <Box component="td" sx={deltaCell} />
          </Fragment>
        ))}
      </tr>
    ));

  const table = (label: string, children: React.ReactNode, first: string) => (
    <Box
      component="table"
      aria-label={label}
      sx={{
        width: "100%",
        borderCollapse: "collapse",
        color: "text.primary",
        fontFamily: "inherit",
      }}
    >
      {weeksHeader(first)}
      <tbody>{children}</tbody>
    </Box>
  );

  return (
    <>
      <GlobalStyles
        styles={(theme) => ({
          "@page": { size: "A4", margin: "10mm" },
          "@media print": {
            body: { backgroundColor: theme.palette.common.white },
            "*": { color: `${theme.palette.common.black} !important` },
          },
        })}
      />
      <Box
        component="main"
        id="contenu"
        sx={{
          maxWidth: 1000,
          mx: "auto",
          px: 3,
          py: 4,
          bgcolor: "background.default",
          // Police de l'application partout, tableaux compris (sinon celle du navigateur).
          fontFamily: (theme) => theme.typography.fontFamily,
          "@media print": { p: 0, maxWidth: "none", bgcolor: "common.white" },
        }}
      >
        <Stack
          direction="row"
          sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 2, mb: 2 }}
        >
          <Box>
            <Typography variant="h1" sx={{ "@media print": { fontSize: "1.6rem" } }}>
              {t("title", { month: monthLabel })}
            </Typography>
            <Typography>{amapName}</Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<PrintOutlined />}
            onClick={() => window.print()}
            sx={screenOnly}
          >
            {t("print")}
          </Button>
        </Stack>
        <Typography variant="bodySmall" sx={{ display: "block", mb: 2, ...screenOnly }}>
          {t("printHint")}
        </Typography>

        <Box
          sx={{
            border: "1px solid",
            borderColor: "text.secondary",
            p: 1.5,
            mb: 3,
            ...keepTogether,
          }}
        >
          <Typography sx={{ fontWeight: 700 }}>{t("instructionsTitle")}</Typography>
          <Typography variant="bodyMedium">{t("instructions")}</Typography>
        </Box>

        {sheet.distributions.length === 0 ? (
          <Typography>{t("noDistribution")}</Typography>
        ) : (
          <>
            <Box component="section" aria-labelledby="benevoles" sx={{ mb: 4 }}>
              <Typography id="benevoles" variant="h2" sx={{ mb: 1.5, fontSize: "1.3rem" }}>
                {t("volunteersTitle")}
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                  gap: 2,
                  "@media print": { gridTemplateColumns: "1fr 1fr" },
                }}
              >
                {sheet.distributions.map((d, i) => (
                  <Box key={d.id} sx={keepTogether}>
                    <Box
                      component="table"
                      aria-label={t("volunteersOf", { day: fullDays[i]! })}
                      sx={{ width: "100%", borderCollapse: "collapse", fontFamily: "inherit" }}
                    >
                      <thead>
                        <tr>
                          <Box
                            component="th"
                            scope="colgroup"
                            colSpan={3}
                            sx={{ ...cell, textAlign: "left" }}
                          >
                            {fullDays[i]}
                          </Box>
                        </tr>
                        <tr>
                          {(["name", "phone", "signature"] as const).map((col) => (
                            <Box
                              component="th"
                              scope="col"
                              key={col}
                              sx={{ ...cell, textAlign: "left" }}
                            >
                              {t(`volunteer.${col}`)}
                            </Box>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[1, 2, 3].map((n) => (
                          <tr key={n}>
                            {(["name", "phone", "signature"] as const).map((col) => (
                              <Box component="td" key={col} sx={{ ...cell, height: "1.8rem" }} />
                            ))}
                          </tr>
                        ))}
                        <tr>
                          <Box
                            component="td"
                            colSpan={3}
                            sx={{ ...cell, height: "2.6rem", verticalAlign: "top" }}
                          >
                            {t("comment")}
                          </Box>
                        </tr>
                      </tbody>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>

            <Box component="section" aria-labelledby="partie-producteurs" sx={{ mb: 4 }}>
              <Typography id="partie-producteurs" variant="h2" sx={{ mb: 1.5, fontSize: "1.3rem" }}>
                {t("byProducer")}
              </Typography>
              {sheet.producers.length === 0 && <Typography>{t("noOrder")}</Typography>}
              <Stack spacing={2.5}>
                {sheet.producers.map((p) => (
                  <Box key={p.name} sx={keepTogether}>
                    <Typography variant="h3" sx={{ fontSize: "1.05rem", fontWeight: 700, mb: 0.5 }}>
                      {p.name}
                    </Typography>
                    {table(
                      t("deliveriesOf", { producer: p.name }),
                      productRows(p.rows),
                      t("product"),
                    )}
                    <Typography
                      variant="bodySmall"
                      sx={{
                        display: "block",
                        mt: 0.5,
                        pb: 1,
                        borderBottom: "1px dotted",
                        borderColor: "text.secondary",
                      }}
                    >
                      {t("observations")}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>

            <Box
              component="section"
              aria-labelledby="partie-foyers"
              sx={{ "@media print": { breakBefore: "page" } }}
            >
              <Typography id="partie-foyers" variant="h2" sx={{ mb: 1.5, fontSize: "1.3rem" }}>
                {t("byHousehold")}
              </Typography>
              {sheet.households.length === 0 && <Typography>{t("noOrder")}</Typography>}
              <Stack spacing={2.5}>
                {sheet.households.map((h) => (
                  <Box key={h.id} sx={keepTogether}>
                    <Typography variant="h3" sx={{ fontSize: "1.05rem", fontWeight: 700, mb: 0.5 }}>
                      {h.name}
                    </Typography>
                    {table(
                      t("pickupsOf", { household: h.name }),
                      h.producers.map((p) => (
                        <Fragment key={p.name}>
                          <tr>
                            <Box
                              component="th"
                              scope="rowgroup"
                              colSpan={1 + sheet.distributions.length * 2}
                              sx={{ ...cell, textAlign: "left", fontStyle: "italic" }}
                            >
                              {p.name}
                            </Box>
                          </tr>
                          {productRows(p.rows)}
                        </Fragment>
                      )),
                      t("product"),
                    )}
                  </Box>
                ))}
              </Stack>
            </Box>
          </>
        )}
      </Box>
    </>
  );
}
