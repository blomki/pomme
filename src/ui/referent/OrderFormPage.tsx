"use client";

import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { addMonths } from "@/domain/distributions";
import { formatDate } from "@/i18n/dates";
import type { OrderFormView } from "@/server/order-forms";
import { sendOrderFormAction } from "@/server/order-forms-actions";
import { PageBanner } from "@/ui/layout/PageBanner";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { OrderFormTables } from "../order-form/OrderFormTables";

/**
 * Écran « Bons de commande » du référent (R2, story E1) : mois (flèches), un onglet par
 * producteur suivi, état des commandes, puis le bon de commande. Après la clôture : impression
 * (PDF), tableur, envoi au producteur par email.
 */
export function OrderFormPage({
  amapSlug,
  month,
  producers,
  view,
  households,
}: {
  amapSlug: string;
  month: string;
  producers: Array<{ id: string; name: string }>;
  view: OrderFormView;
  /** Foyers de l'AMAP, quand les commandes sont ouvertes : pour corriger (story D7). */
  households: Array<{ id: string; name: string }> | null;
}) {
  const t = useTranslations("Referent.orderForms");
  const tc = useTranslations("Correction");
  const tb = useTranslations("Banners");
  const router = useRouter();
  const [chosen, setChosen] = useState("");
  const showSnackbar = useSnackbar();
  const [pending, setPending] = useState(false);
  const base = `/${amapSlug}/referent/bons-de-commande`;
  const href = (m: string, producer = view.amapProducerId) =>
    `${base}?mois=${m}&producteur=${producer}`;
  const monthLabel = formatDate(`${month}-01T12:00:00Z`, "MMMM yyyy");
  const day = (d: string) => formatDate(`${d}T12:00:00Z`, "EEEE d MMMM");
  const closed = view.period?.status === "closed";
  const correctHref = (householdId: string) =>
    `${base}/corriger/${view.amapProducerId}/${householdId}`;

  const status = !view.period
    ? t("noPeriod")
    : view.period.status === "closed"
      ? t("closed", {
          date: view.period.closedAt
            ? formatDate(view.period.closedAt, "EEEE d MMMM")
            : day(view.period.closesOn),
        })
      : view.period.status === "open"
        ? t("open", { date: day(view.period.closesOn) })
        : t("scheduled", { date: day(view.period.opensOn) });

  const send = async () => {
    // Bouton actif pendant l'envoi (il garde le focus) ; un deuxième clic est ignoré.
    if (pending) return;
    setPending(true);
    try {
      const result = await sendOrderFormAction(amapSlug, {
        amapProducerId: view.amapProducerId,
        month,
      });
      showSnackbar({
        message:
          result.status === "sent"
            ? t("sent", { email: result.email })
            : result.status === "failed"
              ? t("sendFailed")
              : result.status === "no_email"
                ? t("noEmail")
                : result.status === "not_closed"
                  ? t("notClosed")
                  : t("forbidden"),
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PageBanner title={t("title", { month: monthLabel })}>{tb("orderForms")}</PageBanner>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", mb: 0.5 }}>
        <IconButton
          component={Link}
          nativeButton={false}
          href={href(addMonths(month, -1))}
          aria-label={t("previousMonth")}
        >
          <ChevronLeft />
        </IconButton>
        <IconButton
          component={Link}
          nativeButton={false}
          href={href(addMonths(month, 1))}
          aria-label={t("nextMonth")}
        >
          <ChevronRight />
        </IconButton>
      </Stack>
      <Typography sx={{ color: "text.secondary", mb: 2 }}>{status}</Typography>

      {/* Onglets-liens : chaque producteur a sa propre adresse (partageable, bouton Retour). */}
      <Tabs
        value={view.amapProducerId}
        aria-label={t("tabs")}
        variant="scrollable"
        sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
      >
        {producers.map((p) => (
          <Tab key={p.id} value={p.id} label={p.name} component={Link} href={href(month, p.id)} />
        ))}
      </Tabs>

      <OrderFormTables form={view.form} correctHref={households ? correctHref : undefined} />

      {households && (
        <Stack
          component="form"
          direction="row"
          spacing={2}
          sx={{ mt: 4, alignItems: "center", flexWrap: "wrap", gap: 2 }}
          aria-labelledby="corriger-autre-foyer"
          onSubmit={(e) => {
            e.preventDefault();
            if (chosen) router.push(correctHref(chosen));
          }}
        >
          <Typography id="corriger-autre-foyer" variant="titleMedium" component="h2">
            {tc("otherHousehold")}
          </Typography>
          <TextField
            id="foyer-a-corriger"
            select
            size="small"
            label={tc("chooseHousehold")}
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            sx={{ minWidth: "16rem" }}
          >
            {households.map((h) => (
              <MenuItem key={h.id} value={h.id}>
                {h.name}
              </MenuItem>
            ))}
          </TextField>
          <Button type="submit" variant="outlined" disabled={!chosen}>
            {tc("open")}
          </Button>
        </Stack>
      )}

      {closed ? (
        <Stack direction="row" spacing={2} sx={{ mt: 4, flexWrap: "wrap", gap: 2 }}>
          <Button
            variant="outlined"
            component="a"
            nativeButton={false}
            href={`/${amapSlug}/bon-de-commande/${view.amapProducerId}/${month}`}
            target="_blank"
          >
            {t("print")}
          </Button>
          <Button
            variant="outlined"
            component="a"
            nativeButton={false}
            href={`${base}/tableur?producteur=${view.amapProducerId}&mois=${month}`}
            download
          >
            {t("spreadsheet")}
          </Button>
          <Button variant="contained" onClick={() => void send()}>
            {t("send", { producer: view.producerName })}
          </Button>
        </Stack>
      ) : (
        view.form.products.length > 0 && (
          <Alert severity="info" sx={{ mt: 4 }}>
            {t("exportsAfterClosing")}
          </Alert>
        )
      )}
    </>
  );
}
