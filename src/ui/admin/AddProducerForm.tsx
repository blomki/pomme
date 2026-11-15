"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
  attachProducerAction,
  createProducerAction,
  searchProducersAction,
} from "@/server/producers-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";

import { EMPTY_PRODUCER, ProducerFields, type ProducerFormValues } from "./ProducerFields";

type Found = { id: string; name: string; category: string };

/**
 * « Ajouter un producteur » : d'abord chercher s'il livre déjà une autre AMAP (il a une seule
 * fiche sur Pomme), sinon le créer.
 */
export function AddProducerForm({ amapSlug }: { amapSlug: string }) {
  const t = useTranslations("Admin.addProducer");
  const tf = useTranslations("Admin.producerForm");
  const router = useRouter();
  const showSnackbar = useSnackbar();
  const detailPath = (id: string) => `/${amapSlug}/admin/producteurs/${id}`;

  // Recherche d'un producteur existant.
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

  const search = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (query.trim().length < 2) {
      setFound(null);
      setSearchMessage(t("searchTooShort"));
      return;
    }
    const result = await searchProducersAction(amapSlug, query);
    if ("status" in result) {
      setSearchMessage(tf("errors.forbidden"));
      return;
    }
    setFound(result);
    setSearchMessage(result.length === 0 ? t("noResult") : t("results", { count: result.length }));
  };

  const attach = async (producer: Found) => {
    const result = await attachProducerAction(amapSlug, { producerId: producer.id });
    if (result.status === "saved") {
      showSnackbar({ message: t("attached", { name: producer.name }) });
      router.push(detailPath(result.amapProducerId));
    } else {
      setSearchMessage(
        result.status === "already_attached"
          ? t("alreadyAttached")
          : result.status === "forbidden"
            ? tf("errors.forbidden")
            : tf("errors.error"),
      );
    }
  };

  // Création d'un nouveau producteur.
  const [values, setValues] = useState<ProducerFormValues>(EMPTY_PRODUCER);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    const result = await createProducerAction(amapSlug, values);
    setPending(false);
    if (result.status === "saved") {
      showSnackbar({ message: t("created", { name: values.name.trim() }) });
      router.push(detailPath(result.amapProducerId));
      return;
    }
    setInvalid(result.status === "invalid" ? result.fields : []);
    setProblem(
      result.status === "invalid"
        ? tf("errors.summary")
        : result.status === "forbidden"
          ? tf("errors.forbidden")
          : tf("errors.error"),
    );
    // Le résumé prend le focus, pour qu'un lecteur d'écran l'annonce aussitôt.
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  return (
    <Stack spacing={5} sx={{ maxWidth: 720 }}>
      <Box component="section" aria-labelledby="search-title">
        <Typography id="search-title" variant="h2" sx={{ mb: 1 }}>
          {t("searchTitle")}
        </Typography>
        <Typography sx={{ mb: 2 }}>{t("searchIntro")}</Typography>
        <Stack
          component="form"
          role="search"
          onSubmit={(e) => void search(e)}
          noValidate
          direction="row"
          spacing={2}
          sx={{ alignItems: "flex-start" }}
        >
          <TextField
            label={t("searchLabel")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            sx={{ flexGrow: 1 }}
          />
          <Button type="submit" variant="outlined" sx={{ mt: 1 }}>
            {t("search")}
          </Button>
        </Stack>
        <Box role="status" aria-live="polite" sx={{ mt: 1 }}>
          {searchMessage && <Typography>{searchMessage}</Typography>}
        </Box>
        {found && found.length > 0 && (
          <List>
            {found.map((p) => (
              <ListItem
                key={p.id}
                divider
                secondaryAction={
                  <Button
                    onClick={() => void attach(p)}
                    aria-label={t("attachOf", { name: p.name })}
                  >
                    {t("attach")}
                  </Button>
                }
              >
                <ListItemText primary={p.name} secondary={p.category || undefined} />
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      <Box
        component="form"
        onSubmit={(e) => void create(e)}
        noValidate
        aria-labelledby="create-title"
      >
        <Typography id="create-title" variant="h2" sx={{ mb: 2 }}>
          {t("createTitle")}
        </Typography>
        {/* Reçoit le focus après une erreur ; l'Alert de MUI porte elle-même role="alert". */}
        <Box ref={summaryRef} tabIndex={-1} sx={{ mb: problem ? 2 : 0 }}>
          {problem && <Alert severity="error">{problem}</Alert>}
        </Box>
        <ProducerFields values={values} onChange={setValues} invalid={invalid} />
        <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
          <Button type="submit" variant="contained" disabled={pending}>
            {t("create")}
          </Button>
          <Button component={Link} href={`/${amapSlug}/admin/producteurs`} nativeButton={false}>
            {t("cancel")}
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}
