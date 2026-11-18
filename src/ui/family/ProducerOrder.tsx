"use client";

import ArrowBack from "@mui/icons-material/ArrowBack";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRef, useState } from "react";

import { formatEuros } from "@/domain/catalog";
import { linesTotal, MAX_QUANTITY, parseQuantity } from "@/domain/orders";
import { formatDate } from "@/i18n/dates";
import type { OrderItem, OrderProducer } from "@/server/orders";
import type { SetQuantityResult } from "@/server/orders";
import {
  setNothingThisMonthAction,
  setOrderQuantitiesAction,
  setOrderQuantityAction,
} from "@/server/orders-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { m3 } from "../theme/create-theme";

import { OrderStatusChip } from "./OrderOverview";

type Cells = Record<string, { quantity: number; unitPriceCents: number }>;
const key = (itemId: string, distributionId: string) => `${itemId}:${distributionId}`;

/**
 * Commande chez un producteur (écran 2 bis, story D3) : une case de quantité par produit et par
 * distribution. Chaque changement est enregistré aussitôt ; le total du chèque se calcule dans
 * le navigateur, sans attendre le serveur. Si le serveur refuse, la case reprend sa valeur
 * précédente et un message explique pourquoi. Flèches haut et bas : +1 / −1 (champ numérique).
 */
export function ProducerOrder({
  amapSlug,
  month,
  distributions,
  producer,
}: {
  amapSlug: string;
  month: string;
  distributions: Array<{ id: string; date: string }>;
  producer: OrderProducer;
}) {
  const t = useTranslations("Family.order");
  const showSnackbar = useSnackbar();
  const [cells, setCells] = useState<Cells>(() => {
    const initial: Cells = {};
    for (const item of producer.items) {
      for (const c of item.cells) initial[key(item.itemId, c.distributionId)] = c;
    }
    return initial;
  });
  const [declined, setDeclined] = useState(producer.status === "nothing");
  // Dernière valeur confirmée par le serveur, case par case : pour revenir en arrière.
  const saved = useRef<Cells>({ ...cells });
  // Enregistrements en cours : une case n'envoie qu'une requête à la fois, la dernière valeur
  // saisie part ensuite (flèches maintenues, frappe rapide).
  const inFlight = useRef<Set<string>>(new Set());
  const wanted = useRef<Record<string, number>>({});

  const total = linesTotal(Object.values(cells));
  const hasQuantities = Object.values(cells).some((c) => c.quantity > 0);
  const status = hasQuantities ? "complete" : declined ? "nothing" : "todo";
  const monthLabel = formatDate(`${month}-01T12:00:00Z`, "MMMM");
  const base = `/${amapSlug}/famille/commande`;

  // Nombre d'enregistrements en cours, pour « Enregistrement… » / « Modifications enregistrées ».
  const [saving, setSaving] = useState(0);
  const [touched, setTouched] = useState(false);

  /** Applique la réponse du serveur à une case : valeur confirmée, ou retour en arrière. */
  const apply = (k: string, result: SetQuantityResult | { status: "forbidden" | "network" }) => {
    if (result.status === "saved") {
      saved.current[k] = { quantity: result.quantity, unitPriceCents: result.unitPriceCents };
      if (result.quantity > 0) setDeclined(false);
      if (wanted.current[k] === undefined) {
        setCells((all) => ({ ...all, [k]: saved.current[k]! }));
      }
      return true;
    }
    // Refus : retour à la dernière valeur enregistrée, et on oublie la suite.
    delete wanted.current[k];
    setCells((all) => ({ ...all, [k]: saved.current[k]! }));
    showSnackbar({ message: t(`refused.${result.status}`) });
    return false;
  };

  /** Envoie au serveur la dernière quantité voulue pour une case, puis les suivantes. */
  const send = async (itemId: string, distributionId: string) => {
    const k = key(itemId, distributionId);
    if (inFlight.current.has(k)) return;
    inFlight.current.add(k);
    setSaving((n) => n + 1);
    try {
      while (wanted.current[k] !== undefined) {
        const quantity = wanted.current[k]!;
        delete wanted.current[k];
        const result = await setOrderQuantityAction(amapSlug, {
          catalogItemId: itemId,
          distributionId,
          quantity,
        }).catch(() => ({ status: "network" }) as const);
        apply(k, result);
      }
    } finally {
      inFlight.current.delete(k);
      setSaving((n) => n - 1);
    }
  };

  const change = (itemId: string, distributionId: string, quantity: number) => {
    const k = key(itemId, distributionId);
    setTouched(true);
    setCells((all) => ({ ...all, [k]: { ...all[k]!, quantity } }));
    wanted.current[k] = quantity;
    void send(itemId, distributionId);
  };

  /** Recopie la première quantité saisie sur toutes les semaines : une seule requête. */
  const sameEveryWeek = async (item: OrderItem) => {
    const editable = item.cells.filter((c) => c.lock === null);
    const first = editable.find((c) => cells[key(item.itemId, c.distributionId)]!.quantity > 0);
    const quantity = first ? cells[key(item.itemId, first.distributionId)]!.quantity : 0;
    const targets = editable.filter(
      (c) => cells[key(item.itemId, c.distributionId)]!.quantity !== quantity,
    );
    if (targets.length === 0) return;
    // Une case dont l'enregistrement est déjà en cours suit son propre fil.
    const busy = targets.filter((c) => inFlight.current.has(key(item.itemId, c.distributionId)));
    for (const c of busy) change(item.itemId, c.distributionId, quantity);
    const batch = targets.filter((c) => !busy.includes(c));
    if (batch.length === 0) return;

    setTouched(true);
    setCells((all) => {
      const next = { ...all };
      for (const c of batch) {
        const k = key(item.itemId, c.distributionId);
        next[k] = { ...next[k]!, quantity };
      }
      return next;
    });
    setSaving((n) => n + 1);
    try {
      const results = await setOrderQuantitiesAction(
        amapSlug,
        batch.map((c) => ({
          catalogItemId: item.itemId,
          distributionId: c.distributionId,
          quantity,
        })),
      ).catch(() => ({ status: "network" }) as const);
      batch.forEach((c, index) => {
        const result = Array.isArray(results) ? results[index]! : results;
        apply(key(item.itemId, c.distributionId), result);
      });
    } finally {
      setSaving((n) => n - 1);
    }
  };

  const toggleNothing = async () => {
    const nothing = !declined;
    const result = await setNothingThisMonthAction(amapSlug, {
      catalogId: producer.catalogId,
      nothing,
    });
    if (result.status !== "saved") {
      showSnackbar({ message: t(`refused.${result.status}`) });
      return;
    }
    setDeclined(nothing);
    showSnackbar({
      message: nothing ? t("nothingSet", { producer: producer.name }) : t("nothingCancelled"),
    });
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Button
          component={Link}
          href={base}
          nativeButton={false}
          startIcon={<ArrowBack />}
          sx={{ mb: 1, ml: -1 }}
        >
          {t("back")}
        </Button>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="h1" sx={{ flex: 1 }}>
            {producer.name}
          </Typography>
          <OrderStatusChip status={status} />
        </Stack>
        <Typography color="text.secondary" sx={{ textTransform: "none" }}>
          {t("producerSubtitle", {
            month: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
          })}
        </Typography>
      </Box>

      {producer.chequeReceived && <Alert severity="info">{t("lockedCheque")}</Alert>}

      {producer.items.map((item) => {
        const editable = item.cells.some((c) => c.lock === null);
        return (
          <Paper
            key={item.itemId}
            component="section"
            aria-labelledby={`produit-${item.itemId}`}
            elevation={0}
            sx={{ p: 2, bgcolor: m3("surfaceContainer") }}
          >
            <Typography id={`produit-${item.itemId}`} variant="titleMedium" component="h2">
              {item.name}
            </Typography>
            <Typography variant="bodyMedium" color="text.secondary" sx={{ mb: 2 }}>
              {t("unitPrice", { price: formatEuros(item.priceCents) })}
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: `repeat(auto-fill, minmax(4.5rem, 1fr))`,
                gap: 1,
              }}
            >
              {item.cells.map((c) => {
                const d = distributions.find((x) => x.id === c.distributionId)!;
                const dayLabel = formatDate(`${d.date}T12:00:00Z`, "d MMM");
                const value = cells[key(item.itemId, c.distributionId)]!.quantity;
                const fieldId = `q-${item.itemId}-${c.distributionId}`;
                return (
                  <Box key={c.distributionId} sx={{ textAlign: "center" }}>
                    <Typography
                      component={c.lock === null ? "label" : "span"}
                      htmlFor={c.lock === null ? fieldId : undefined}
                      variant="labelMedium"
                      sx={{ display: "block", mb: 0.5 }}
                    >
                      {dayLabel}
                    </Typography>
                    {c.lock === null ? (
                      <TextField
                        id={fieldId}
                        type="number"
                        size="small"
                        // Toujours un nombre : la flèche vers le haut part de 0.
                        value={String(value)}
                        onChange={(e) => {
                          const q = parseQuantity(e.target.value);
                          if (q !== null) change(item.itemId, c.distributionId, q);
                        }}
                        slotProps={{
                          htmlInput: {
                            min: 0,
                            max: MAX_QUANTITY,
                            inputMode: "numeric",
                            // Le nom contient le jour affiché (« 3 déc. ») : même libellé à l'œil et à l'oreille.
                            "aria-label": t("quantityOf", { product: item.name, date: dayLabel }),
                            style: { textAlign: "center" },
                          },
                        }}
                      />
                    ) : (
                      <Typography variant="bodyMedium" color="text.secondary" sx={{ py: 1 }}>
                        {value > 0
                          ? `× ${value}`
                          : c.lock === "unavailable"
                            ? t("unavailable")
                            : c.lock === "past"
                              ? t("past")
                              : "—"}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
            {editable && item.cells.filter((c) => c.lock === null).length > 1 && (
              <Button
                size="small"
                sx={{ mt: 1.5 }}
                onClick={() => void sameEveryWeek(item)}
                aria-label={t("sameEveryWeekOf", { product: item.name })}
              >
                {t("sameEveryWeek")}
              </Button>
            )}
          </Paper>
        );
      })}

      <Paper
        elevation={0}
        sx={{
          p: 2,
          bgcolor: m3("surfaceContainerHigh"),
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Typography id="cheque-producteur" variant="bodyMedium" color="text.secondary">
            {t("chequeForProducer")}
          </Typography>
          {/* Zone « status » : le nouveau total est annoncé par les lecteurs d'écran. */}
          <Typography
            variant="headlineSmall"
            component="p"
            role="status"
            aria-labelledby="cheque-producteur"
            sx={{ fontVariantNumeric: "tabular-nums" }}
          >
            {formatEuros(total)}
          </Typography>
          {touched && (
            <Typography variant="bodySmall" color="text.secondary" role="status">
              {saving > 0 ? t("saving") : t("saved")}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
          {!hasQuantities && !producer.chequeReceived && (
            <Button variant="outlined" onClick={() => void toggleNothing()}>
              {declined ? t("nothingCancel") : t("nothingThisMonth")}
            </Button>
          )}
          <Button variant="contained" component={Link} nativeButton={false} href={base}>
            {t("done")}
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
