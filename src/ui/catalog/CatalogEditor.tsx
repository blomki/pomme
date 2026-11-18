"use client";

import Add from "@mui/icons-material/Add";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
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
import { useRef, useState } from "react";

import { formatEuros, parsePriceCents, priceInput } from "@/domain/catalog";
import { formatDate } from "@/i18n/dates";
import type { CatalogDistribution, CatalogDraft, LineError } from "@/server/catalogs";
import {
  copyPreviousCatalogAction,
  publishCatalogAction,
  saveCatalogDraftAction,
} from "@/server/catalogs-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { visuallyHidden } from "../visually-hidden";

type Line = {
  key: string;
  itemId?: string;
  name: string;
  price: string;
  available: string[];
  removed: boolean;
};

const day = (date: string, pattern: string) => formatDate(`${date}T12:00:00Z`, pattern);

/** Ce dont chaque disposition a besoin pour afficher et modifier les produits du catalogue. */
type LinesProps = {
  lines: Line[];
  active: Line[];
  distributions: CatalogDistribution[];
  update: (key: string, change: Partial<Line>) => void;
  toggle: (line: Line, distributionId: string, checked: boolean) => void;
  errorOf: (line: Line, field: LineError["field"]) => boolean;
  /** Consultation seulement : champs en lecture, cases figées, pas de « Retirer ». */
  readOnly: boolean;
};

/**
 * Brouillon du catalogue d'un mois pour un producteur dans une AMAP (story C2) : un produit par
 * ligne (nom avec son conditionnement, prix, une case par semaine), produits retirés de ce
 * catalogue, ajout d'un produit. Tout est enregistré d'un coup (« Enregistrer le brouillon »).
 *
 * Deux dispositions, mêmes règles : `table` pour le référent sur ordinateur (écran R6), `cards`
 * pour le producteur sur téléphone (écran P2, une carte par produit).
 *
 * Story C3 : « Préparer à partir de [mois précédent] » quand le mois n'a pas encore de
 * catalogue, « Publier pour [mois] » (enregistre puis publie), lecture seule pour un mois passé
 * ou des commandes clôturées. Le parent remonte ce composant (`key`) quand le statut change,
 * pour repartir du catalogue enregistré.
 */
export function CatalogEditor({
  amapSlug,
  amapProducerId,
  draft,
  monthLabel,
  layout,
}: {
  amapSlug: string;
  amapProducerId: string;
  draft: CatalogDraft;
  monthLabel: string;
  layout: "table" | "cards";
}) {
  const t = useTranslations("Catalog");
  const showSnackbar = useSnackbar();
  const openIds = draft.distributions.filter((d) => d.isOpen).map((d) => d.id);
  const [lines, setLines] = useState<Line[]>(
    draft.lines.map((l) => ({
      key: l.itemId,
      itemId: l.itemId,
      name: l.name,
      price: priceInput(l.priceCents),
      available: l.available,
      removed: l.removed,
    })),
  );
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [errors, setErrors] = useState<LineError[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nextKey = useRef(0);
  const summaryRef = useRef<HTMLDivElement>(null);

  const update = (key: string, change: Partial<Line>) =>
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...change } : l)));

  const toggle = (line: Line, distributionId: string, checked: boolean) =>
    update(line.key, {
      available: checked
        ? [...line.available, distributionId]
        : line.available.filter((id) => id !== distributionId),
    });

  const addProduct = () => {
    if (!newName.trim()) return;
    setLines((current) => [
      ...current,
      {
        key: `new-${nextKey.current++}`,
        name: newName,
        price: newPrice,
        // Nouveau produit : disponible à toutes les distributions ouvertes du mois.
        available: openIds,
        removed: false,
      },
    ]);
    setNewName("");
    setNewPrice("");
  };

  const showProblem = (message: string) => {
    setProblem(message);
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  /** Enregistre le brouillon ; affiche le problème s'il est refusé. */
  const persist = async (): Promise<boolean> => {
    const result = await saveCatalogDraftAction(amapSlug, {
      amapProducerId,
      month: draft.month,
      lines: lines.map(({ itemId, name, price, available, removed }) => ({
        ...(itemId ? { itemId } : {}),
        name,
        price,
        available,
        removed,
      })),
    });
    if (result.status === "saved") {
      setErrors([]);
      setProblem(null);
      return true;
    }
    setErrors(result.status === "invalid" ? result.errors : []);
    showProblem(
      result.status === "invalid"
        ? t("errors.summary")
        : result.status === "duplicate"
          ? t("errors.duplicate", { names: result.names.join(", ") })
          : result.status === "forbidden"
            ? t("errors.forbidden")
            : result.status === "read_only"
              ? t("errors.readOnly")
              : t("errors.error"),
    );
    return false;
  };

  // Pendant l'envoi, les boutons restent actifs (un deuxième clic est ignoré) : un bouton
  // désactivé perdrait le focus clavier.
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    const saved = await persist();
    setPending(false);
    if (saved) showSnackbar({ message: t("saved", { month: monthLabel }) });
  };

  /** « Publier pour [mois] » : enregistre d'abord, puis publie. */
  const publish = async () => {
    if (pending) return;
    setPending(true);
    const saved = await persist();
    const result = saved
      ? await publishCatalogAction(amapSlug, { amapProducerId, month: draft.month })
      : null;
    setPending(false);
    if (!result) return;
    if (result.status === "published") {
      showSnackbar({ message: t("published", { month: monthLabel }) });
      return;
    }
    showProblem(
      result.status === "problem"
        ? result.problem.kind === "empty"
          ? t("errors.empty")
          : t("errors.noWeek", { names: result.problem.names.join(", ") })
        : result.status === "read_only"
          ? t("errors.readOnly")
          : result.status === "forbidden"
            ? t("errors.forbidden")
            : t("errors.error"),
    );
  };

  /** « Préparer à partir de [mois précédent] » : le parent remonte l'éditeur ensuite. */
  const prepare = async () => {
    if (pending || !draft.previous) return;
    setPending(true);
    const result = await copyPreviousCatalogAction(amapSlug, {
      amapProducerId,
      month: draft.month,
    });
    setPending(false);
    if (result.status === "copied") {
      showSnackbar({ message: t("prepared", { month: monthLabel, count: result.products }) });
      return;
    }
    showProblem(
      result.status === "read_only"
        ? t("errors.readOnly")
        : result.status === "forbidden"
          ? t("errors.forbidden")
          : t("errors.error"),
    );
  };

  const active = lines.filter((l) => !l.removed);
  const removed = lines.filter((l) => l.removed);
  const errorOf = (line: Line, field: LineError["field"]) =>
    errors.some((e) => e.field === field && lines.indexOf(line) === e.line);

  if (draft.distributions.length === 0) {
    // Mois passé sans distribution : rien à consulter. Sinon, le calendrier reste à créer.
    return draft.readOnly ? (
      <>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t("readOnly")}
        </Alert>
        <Typography>{t("nothingThisMonth", { month: monthLabel })}</Typography>
      </>
    ) : (
      <Typography>{t("noDistributions", { month: monthLabel })}</Typography>
    );
  }

  const linesProps: LinesProps = {
    lines,
    active,
    distributions: draft.distributions,
    update,
    toggle,
    errorOf,
    readOnly: draft.readOnly,
  };
  const previousLabel = draft.previous
    ? formatDate(`${draft.previous.month}-01T12:00:00Z`, "MMMM")
    : "";

  return (
    <Box component="form" onSubmit={(e) => void save(e)} noValidate>
      <Box ref={summaryRef} tabIndex={-1} sx={{ mb: problem ? 2 : 0 }}>
        {problem && <Alert severity="error">{problem}</Alert>}
      </Box>
      {draft.readOnly && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t("readOnly")}
        </Alert>
      )}
      {!draft.readOnly && draft.status === "published" && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {t("publishedNote")}
        </Alert>
      )}

      {draft.previous && (
        <Paper
          variant="outlined"
          component="section"
          aria-labelledby="prepare-title"
          sx={{ p: 2, mb: 3 }}
        >
          <Typography id="prepare-title" variant="titleMedium" component="h2" sx={{ mb: 1 }}>
            {t("prepareTitle", { month: monthLabel })}
          </Typography>
          <Typography sx={{ mb: 2 }}>
            {t("prepareIntro", { count: draft.previous.products, previous: previousLabel })}
          </Typography>
          <Button variant="contained" onClick={() => void prepare()}>
            {t("prepare", { previous: previousLabel })}
          </Button>
          <Typography variant="bodySmall" sx={{ color: "text.secondary", mt: 1 }}>
            {t("startEmpty")}
          </Typography>
        </Paper>
      )}

      {active.length === 0 ? (
        <Typography sx={{ mb: 2 }}>{t("empty")}</Typography>
      ) : layout === "table" ? (
        <LinesTable {...linesProps} />
      ) : (
        <LinesCards {...linesProps} />
      )}

      {!draft.readOnly && (
        <Box
          component="fieldset"
          sx={{ border: 0, p: 0, m: 0, mb: 3 }}
          aria-describedby="add-product-help"
        >
          <Typography component="legend" variant="titleMedium" sx={{ mb: 1 }}>
            {t("addTitle")}
          </Typography>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ alignItems: "flex-start" }}
          >
            <TextField
              label={t("newName")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              // Entrée ajoute le produit (et n'enregistre pas tout le brouillon).
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addProduct();
                }
              }}
              helperText={<span id="add-product-help">{t("newNameHelp")}</span>}
              sx={{ flexGrow: 1, width: { xs: "100%", sm: "auto" } }}
            />
            <TextField
              label={t("newPrice")}
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addProduct();
                }
              }}
              inputMode="decimal"
              sx={{ width: 140 }}
            />
            <Button startIcon={<Add />} onClick={addProduct} sx={{ mt: 1 }}>
              {t("add")}
            </Button>
          </Stack>
        </Box>
      )}

      {removed.length > 0 && (
        <Box component="section" aria-labelledby="removed-title" sx={{ mb: 3 }}>
          <Typography id="removed-title" variant="titleMedium" component="h2">
            {t("removedTitle", { count: removed.length })}
          </Typography>
          <Typography variant="bodySmall" sx={{ color: "text.secondary", mb: 1 }}>
            {t("removedIntro")}
          </Typography>
          <Paper variant="outlined" component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
            {removed.map((line, i) => (
              <Stack
                component="li"
                key={line.key}
                direction="row"
                spacing={2}
                sx={{
                  alignItems: "center",
                  px: 2,
                  py: 1,
                  borderTop: i === 0 ? 0 : 1,
                  borderColor: "divider",
                }}
              >
                <Typography sx={{ flexGrow: 1 }}>{line.name}</Typography>
                <Typography sx={{ color: "text.secondary" }}>
                  {/* Le prix saisi, tel quel s'il n'est pas encore valable. */}
                  {(() => {
                    const cents = parsePriceCents(line.price);
                    return cents === null ? line.price : formatEuros(cents);
                  })()}
                </Typography>
                {!draft.readOnly && (
                  <Button
                    size="small"
                    onClick={() => update(line.key, { removed: false, available: openIds })}
                    aria-label={t("restoreOf", { name: line.name })}
                  >
                    {t("restore")}
                  </Button>
                )}
              </Stack>
            ))}
          </Paper>
        </Box>
      )}

      {!draft.readOnly && (
        <>
          <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: "action.hover", border: 0 }}>
            <Typography variant="bodySmall">{t("note")}</Typography>
          </Paper>

          <Stack
            direction={layout === "cards" ? "column" : "row"}
            spacing={1}
            sx={{ justifyContent: "flex-end" }}
          >
            <Button type="submit" variant="outlined" fullWidth={layout === "cards"}>
              {t("save")}
            </Button>
            <Button
              variant="contained"
              onClick={() => void publish()}
              fullWidth={layout === "cards"}
            >
              {t("publish", { month: monthLabel })}
            </Button>
          </Stack>
        </>
      )}
    </Box>
  );
}

/** Nom affiché d'une ligne, même avant que le produit ait un nom. */
function useLineName() {
  const t = useTranslations("Catalog");
  return (lines: Line[], line: Line) =>
    line.name.trim() || t("productOf", { number: lines.indexOf(line) + 1 });
}

/** Référent, sur ordinateur : un tableau, une colonne par semaine. */
function LinesTable({
  lines,
  active,
  distributions,
  update,
  toggle,
  errorOf,
  readOnly,
}: LinesProps) {
  const t = useTranslations("Catalog");
  const nameOf = useLineName();
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto", mb: 2 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell scope="col">{t("product")}</TableCell>
            <TableCell scope="col">{t("price")}</TableCell>
            {distributions.map((d, index) => (
              <TableCell key={d.id} scope="col" align="center">
                <Stack sx={{ alignItems: "center" }}>
                  <span>{t("week", { number: index + 1 })}</span>
                  <Typography variant="bodySmall" sx={{ color: "text.secondary" }}>
                    {d.isOpen ? day(d.date, "d MMM") : t("closedWeek")}
                  </Typography>
                </Stack>
              </TableCell>
            ))}
            <TableCell>
              <Box component="span" sx={visuallyHidden}>
                {t("remove")}
              </Box>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {active.map((line) => {
            const index = lines.indexOf(line);
            const name = nameOf(lines, line);
            return (
              <TableRow key={line.key}>
                <TableCell sx={{ minWidth: 220 }}>
                  <TextField
                    value={line.name}
                    onChange={(e) => update(line.key, { name: e.target.value })}
                    size="small"
                    fullWidth
                    error={errorOf(line, "name")}
                    helperText={errorOf(line, "name") ? t("errors.name") : undefined}
                    slotProps={{
                      htmlInput: { "aria-label": t("productOf", { number: index + 1 }), readOnly },
                    }}
                  />
                </TableCell>
                <TableCell sx={{ minWidth: 110 }}>
                  <TextField
                    value={line.price}
                    onChange={(e) => update(line.key, { price: e.target.value })}
                    size="small"
                    inputMode="decimal"
                    error={errorOf(line, "price")}
                    helperText={errorOf(line, "price") ? t("errors.price") : undefined}
                    slotProps={{
                      htmlInput: {
                        "aria-label": t("priceOf", { name }),
                        style: { textAlign: "right" },
                        readOnly,
                      },
                    }}
                  />
                </TableCell>
                {distributions.map((d) => (
                  <TableCell key={d.id} align="center">
                    <Checkbox
                      checked={line.available.includes(d.id)}
                      disabled={!d.isOpen || readOnly}
                      onChange={(e) => toggle(line, d.id, e.target.checked)}
                      slotProps={{
                        input: {
                          "aria-label": t("availableOf", {
                            name,
                            date: day(d.date, "EEEE d MMMM"),
                          }),
                        },
                      }}
                    />
                  </TableCell>
                ))}
                <TableCell>
                  {!readOnly && (
                    <Button
                      size="small"
                      onClick={() => update(line.key, { removed: true })}
                      aria-label={t("removeOf", { name })}
                    >
                      {t("remove")}
                    </Button>
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

/**
 * Producteur, sur téléphone : une carte par produit (nom, prix, puis une case par semaine avec
 * sa date en clair). Les cases d'un produit forment un groupe nommé « Disponibilités de … ».
 */
function LinesCards({
  lines,
  active,
  distributions,
  update,
  toggle,
  errorOf,
  readOnly,
}: LinesProps) {
  const t = useTranslations("Catalog");
  const nameOf = useLineName();
  return (
    <>
      <Typography variant="bodyMedium" sx={{ color: "text.secondary", mb: 1 }}>
        {t("cardsHelp")}
      </Typography>
      <Stack component="ul" spacing={2} sx={{ listStyle: "none", m: 0, p: 0, mb: 3 }}>
        {active.map((line) => {
          const index = lines.indexOf(line);
          const name = nameOf(lines, line);
          return (
            <Paper component="li" key={line.key} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <TextField
                  label={t("product")}
                  value={line.name}
                  onChange={(e) => update(line.key, { name: e.target.value })}
                  fullWidth
                  error={errorOf(line, "name")}
                  helperText={errorOf(line, "name") ? t("errors.name") : undefined}
                  slotProps={{
                    htmlInput: { "aria-label": t("productOf", { number: index + 1 }), readOnly },
                  }}
                />
                <TextField
                  label={t("price")}
                  value={line.price}
                  onChange={(e) => update(line.key, { price: e.target.value })}
                  inputMode="decimal"
                  error={errorOf(line, "price")}
                  helperText={errorOf(line, "price") ? t("errors.price") : undefined}
                  slotProps={{ htmlInput: { "aria-label": t("priceOf", { name }), readOnly } }}
                  sx={{ width: 160 }}
                />
                <Box component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
                  <Typography component="legend" variant="labelLarge" sx={{ mb: 0.5 }}>
                    {t("availabilityOf", { name })}
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 2 }}>
                    {distributions.map((d, i) => (
                      <FormControlLabel
                        key={d.id}
                        disabled={!d.isOpen || readOnly}
                        control={
                          <Checkbox
                            checked={line.available.includes(d.id)}
                            onChange={(e) => toggle(line, d.id, e.target.checked)}
                          />
                        }
                        label={
                          d.isOpen
                            ? t("weekLabel", { number: i + 1, date: day(d.date, "d MMM") })
                            : t("weekClosedLabel", { number: i + 1 })
                        }
                      />
                    ))}
                  </Box>
                </Box>
                {!readOnly && (
                  <Box>
                    <Button
                      onClick={() => update(line.key, { removed: true })}
                      aria-label={t("removeOf", { name })}
                    >
                      {t("remove")}
                    </Button>
                  </Box>
                )}
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </>
  );
}

export function CatalogStatusChip({ status }: { status: CatalogDraft["status"] }) {
  const t = useTranslations("Catalog");
  return (
    <Chip
      size="small"
      // Couleurs pleines : un texte orange ou vert sur fond clair manque de contraste.
      color={status === "published" ? "success" : "default"}
      label={
        status === "published"
          ? t("statusPublished")
          : status === "draft"
            ? t("statusDraft")
            : t("statusNew")
      }
    />
  );
}
