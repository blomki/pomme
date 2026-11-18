"use client";

import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableFooter from "@mui/material/TableFooter";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";

import { formatEuros } from "@/domain/catalog";
import { creditLabel, type OrderForm } from "@/domain/order-forms";
import { formatDate } from "@/i18n/dates";

const numeric = { fontVariantNumeric: "tabular-nums", textAlign: "right" } as const;

/**
 * Tableaux du bon de commande (story E1) : quantités à préparer par produit et par
 * distribution, puis détail par foyer avec l'avoir déduit et le chèque attendu. Communs à
 * l'écran du référent et à la version imprimable : une seule mise en forme à faire évoluer.
 */
export function OrderFormTables({ form }: { form: OrderForm }) {
  const t = useTranslations("OrderForm");
  const days = form.distributions.map((d) => formatDate(`${d.date}T12:00:00Z`, "d MMM"));
  const fullDays = form.distributions.map((d) => formatDate(`${d.date}T12:00:00Z`, "EEEE d MMMM"));

  if (form.products.length === 0) return <Typography>{t("empty")}</Typography>;

  return (
    <>
      <Box component="section" aria-labelledby="a-preparer" sx={{ mb: 4, breakInside: "avoid" }}>
        <Typography id="a-preparer" variant="h2" sx={{ mb: 1 }}>
          {t("toPrepare")}
        </Typography>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell scope="col">{t("product")}</TableCell>
                {days.map((day, index) => (
                  <TableCell key={form.distributions[index]!.id} scope="col" sx={numeric}>
                    <abbr title={fullDays[index]} style={{ textDecoration: "none" }}>
                      {day}
                    </abbr>
                  </TableCell>
                ))}
                <TableCell scope="col" sx={numeric}>
                  {t("total")}
                </TableCell>
                <TableCell scope="col" sx={numeric}>
                  {t("amount")}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {form.products.map((p) => (
                <TableRow key={p.itemId}>
                  <TableCell component="th" scope="row">
                    {t("productWithPrice", { product: p.name, price: formatEuros(p.priceCents) })}
                  </TableCell>
                  {p.perDistribution.map((q, index) => (
                    <TableCell key={form.distributions[index]!.id} sx={numeric}>
                      {q}
                    </TableCell>
                  ))}
                  <TableCell sx={{ ...numeric, fontWeight: 600 }}>{p.totalQuantity}</TableCell>
                  <TableCell sx={numeric}>{formatEuros(p.amountCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell component="th" scope="row" colSpan={days.length + 2}>
                  {t("total")}
                </TableCell>
                <TableCell sx={{ ...numeric, fontWeight: 600 }}>
                  {formatEuros(form.totalCents)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      </Box>

      <Box component="section" aria-labelledby="detail-foyers">
        <Typography id="detail-foyers" variant="h2" sx={{ mb: 1 }}>
          {t("detail", { count: form.households.length })}
        </Typography>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell scope="col">{t("household")}</TableCell>
                <TableCell scope="col">{t("product")}</TableCell>
                {days.map((day, index) => (
                  <TableCell key={form.distributions[index]!.id} scope="col" sx={numeric}>
                    <abbr title={fullDays[index]} style={{ textDecoration: "none" }}>
                      {day}
                    </abbr>
                  </TableCell>
                ))}
                <TableCell scope="col" sx={numeric}>
                  {t("credit")}
                </TableCell>
                <TableCell scope="col" sx={numeric}>
                  {t("expected")}
                </TableCell>
              </TableRow>
            </TableHead>
            {form.households.map((h) => (
              // Un corps de tableau par foyer : à l'impression, un foyer n'est pas coupé en deux.
              <TableBody key={h.id} sx={{ breakInside: "avoid" }}>
                {h.rows.map((row, index) => (
                  <TableRow key={row.itemId}>
                    {index === 0 && (
                      <TableCell component="th" scope="rowgroup" rowSpan={h.rows.length}>
                        {h.name}
                      </TableCell>
                    )}
                    <TableCell>{row.name}</TableCell>
                    {row.perDistribution.map((q, i) => (
                      <TableCell key={form.distributions[i]!.id} sx={numeric}>
                        {q}
                      </TableCell>
                    ))}
                    {index === 0 && (
                      <>
                        <TableCell rowSpan={h.rows.length} sx={numeric}>
                          {creditLabel(h.creditsCents)}
                        </TableCell>
                        <TableCell rowSpan={h.rows.length} sx={{ ...numeric, fontWeight: 600 }}>
                          {formatEuros(h.expectedCents)}
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            ))}
          </Table>
        </TableContainer>
      </Box>
    </>
  );
}
