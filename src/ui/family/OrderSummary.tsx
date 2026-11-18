"use client";

import CheckCircleOutlineOutlined from "@mui/icons-material/CheckCircleOutlineOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRef, useState } from "react";

import { formatEuros } from "@/domain/catalog";
import { formatDate } from "@/i18n/dates";
import type { OrderProducer } from "@/server/orders";
import { confirmOrderAction } from "@/server/orders-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { m3 } from "../theme/create-theme";

/** Quantité totale de chaque produit commandé sur le mois : « Pizza légumes × 4 ». */
function orderedItems(producer: OrderProducer) {
  return producer.items
    .map((item) => ({
      name: item.name,
      quantity: item.cells.reduce((sum, c) => sum + c.quantity, 0),
    }))
    .filter((i) => i.quantity > 0);
}

/**
 * Écran 3 de la famille (story D3) : un chèque par producteur commandé, avec ses produits et
 * l'ordre du chèque à la demande ; producteurs sans commande ; « Valider ma commande » envoie
 * l'email récapitulatif. La commande reste modifiable jusqu'à la clôture.
 */
export function OrderSummary({
  amapSlug,
  month,
  closesOn,
  producers,
}: {
  amapSlug: string;
  month: string;
  closesOn: string;
  producers: OrderProducer[];
}) {
  const t = useTranslations("Family.order.recap");
  const to = useTranslations("Family.order");
  const showSnackbar = useSnackbar();
  const [openPayee, setOpenPayee] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ emailed: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const confirmation = useRef<HTMLDivElement>(null);

  const ordered = producers.filter((p) => p.totalCents > 0);
  const others = producers.filter((p) => p.totalCents === 0);
  const total = ordered.reduce((sum, p) => sum + p.totalCents, 0);
  const monthLabel = formatDate(`${month}-01T12:00:00Z`, "MMMM");
  const closesLabel = formatDate(`${closesOn}T12:00:00Z`, "EEEE d MMMM");
  const base = `/${amapSlug}/famille/commande`;

  const confirm = async () => {
    // Bouton actif pendant l'envoi (il garde le focus) ; un deuxième clic est ignoré.
    if (pending) return;
    setPending(true);
    try {
      const result = await confirmOrderAction(amapSlug);
      if (result.status !== "confirmed") {
        showSnackbar({ message: to(`refused.${result.status}`) });
        return;
      }
      setConfirmed({ emailed: result.emailed });
      // Le message de confirmation prend le focus : il est lu aussitôt.
      requestAnimationFrame(() => confirmation.current?.focus());
    } finally {
      setPending(false);
    }
  };

  if (confirmed) {
    return (
      <Stack
        spacing={3}
        ref={confirmation}
        tabIndex={-1}
        sx={{ outline: "none" }}
        aria-labelledby="commande-enregistree"
        role="region"
      >
        <Stack spacing={1} sx={{ alignItems: "center", textAlign: "center" }}>
          <CheckCircleOutlineOutlined
            aria-hidden="true"
            sx={{ fontSize: 56, color: "primary.main" }}
          />
          <Typography id="commande-enregistree" variant="h1">
            {t("confirmedTitle")}
          </Typography>
          <Typography>
            {t("confirmedText", { date: closesLabel })}
            {confirmed.emailed ? ` ${t("emailed")}` : ""}
          </Typography>
        </Stack>
        <Paper elevation={0} sx={{ p: 2, bgcolor: m3("surfaceContainer") }}>
          <Typography variant="titleMedium" component="h2" sx={{ mb: 1 }}>
            {t("cheques", { count: ordered.length })}
          </Typography>
          <Stack component="ul" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
            {ordered.map((p) => (
              <Stack
                component="li"
                key={p.amapProducerId}
                direction="row"
                sx={{ justifyContent: "space-between" }}
              >
                <span>{p.name}</span>
                <Box component="span" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatEuros(p.totalCents)}
                </Box>
              </Stack>
            ))}
          </Stack>
          <Divider sx={{ my: 1.5 }} />
          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
            <Typography variant="titleMedium" component="span">
              {t("total")}
            </Typography>
            <Typography
              variant="titleMedium"
              component="span"
              sx={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatEuros(total)}
            </Typography>
          </Stack>
        </Paper>
        <Stack direction="row" spacing={1} sx={{ justifyContent: "center", flexWrap: "wrap" }}>
          <Button component={Link} nativeButton={false} href={base}>
            {t("edit")}
          </Button>
          <Button
            variant="contained"
            component={Link}
            nativeButton={false}
            href={`/${amapSlug}/famille`}
          >
            {t("backHome")}
          </Button>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h1">{t("title")}</Typography>
        <Typography color="text.secondary">{t("subtitle", { month: monthLabel })}</Typography>
      </Box>

      <Paper elevation={0} sx={{ p: 2, bgcolor: m3("surfaceContainerHigh") }}>
        <Stack
          direction="row"
          sx={{ justifyContent: "space-between", alignItems: "baseline", gap: 2 }}
        >
          <Box>
            <Typography variant="titleMedium" component="p">
              {t("cheques", { count: ordered.length })}
            </Typography>
            <Typography variant="bodyMedium" color="text.secondary">
              {t("onePerProducer")}
            </Typography>
          </Box>
          <Typography
            variant="headlineSmall"
            component="p"
            sx={{ fontVariantNumeric: "tabular-nums" }}
          >
            {formatEuros(total)}
          </Typography>
        </Stack>
      </Paper>

      {ordered.map((p) => {
        const shown = openPayee === p.amapProducerId;
        const payeeId = `ordre-${p.amapProducerId}`;
        return (
          <Paper
            key={p.amapProducerId}
            component="section"
            aria-labelledby={`cheque-${p.amapProducerId}`}
            elevation={0}
            sx={{ p: 2, bgcolor: m3("surfaceContainer") }}
          >
            <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
              <Typography id={`cheque-${p.amapProducerId}`} variant="titleMedium" component="h2">
                {p.name}
              </Typography>
              <Typography
                variant="titleMedium"
                component="p"
                sx={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatEuros(p.totalCents)}
              </Typography>
            </Stack>
            <Stack component="ul" sx={{ listStyle: "none", m: 0, p: 0, color: "text.secondary" }}>
              {orderedItems(p).map((i) => (
                <li key={i.name}>{t("quantity", { product: i.name, quantity: i.quantity })}</li>
              ))}
            </Stack>
            <Button
              size="small"
              sx={{ mt: 1, ml: -1 }}
              aria-expanded={shown}
              aria-controls={payeeId}
              onClick={() => setOpenPayee(shown ? null : p.amapProducerId)}
            >
              {shown ? t("hidePayee") : t("showPayee")}
            </Button>
            <Typography id={payeeId} hidden={!shown} sx={{ mt: 1 }}>
              {p.checkPayee ? t("payee", { payee: p.checkPayee }) : t("payeeUnknown")}
            </Typography>
          </Paper>
        );
      })}

      {others.length > 0 && (
        <Stack component="ul" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
          {others.map((p) => (
            <Stack
              component="li"
              key={p.amapProducerId}
              direction="row"
              sx={{ justifyContent: "space-between", gap: 2 }}
            >
              <span>{p.name}</span>
              <Typography component="span" color="text.secondary">
                {p.status === "nothing" ? t("nothing") : t("todo")}
              </Typography>
            </Stack>
          ))}
        </Stack>
      )}

      <Typography variant="bodyMedium" color="text.secondary">
        {t("provisional")}
      </Typography>

      <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Button component={Link} nativeButton={false} href={base}>
          {t("edit")}
        </Button>
        <Button variant="contained" onClick={() => void confirm()}>
          {t("confirm")}
        </Button>
      </Stack>
    </Stack>
  );
}
