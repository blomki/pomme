"use client";

import ArrowBack from "@mui/icons-material/ArrowBack";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import FormHelperText from "@mui/material/FormHelperText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRef, useState } from "react";

import type { AmapProducerDetail, ReferentView } from "@/server/producers";
import { setProducerReferentsAction, updateProducerAction } from "@/server/producers-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";

import { ProducerAccessSection } from "./ProducerAccessSection";
import { ProducerFields, type ProducerFormValues } from "./ProducerFields";

const fullName = (r: ReferentView) => `${r.firstName} ${r.lastName}`.trim();

/** Fiche d'un producteur côté admin : fiche commune, réglages dans l'AMAP, référents. */
export function ProducerDetail({
  amapSlug,
  producer,
  candidates,
}: {
  amapSlug: string;
  producer: AmapProducerDetail;
  /** Personnes qui ont le rôle référent dans l'AMAP. */
  candidates: ReferentView[];
}) {
  const t = useTranslations("Admin.producerForm");
  const tp = useTranslations("Admin.producers");
  const showSnackbar = useSnackbar();

  const [values, setValues] = useState<ProducerFormValues>({
    name: producer.name,
    category: producer.category,
    shortDescription: producer.shortDescription,
    description: producer.description,
    phone: producer.phone ?? "",
    email: producer.email ?? "",
    checkPayee: producer.checkPayee,
    distanceKm: producer.distanceKm === null ? "" : String(producer.distanceKm),
  });
  const [active, setActive] = useState(producer.active);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    const result = await updateProducerAction(amapSlug, {
      amapProducerId: producer.id,
      ...values,
      active,
    });
    setPending(false);
    if (result.status === "saved") {
      setInvalid([]);
      setProblem(null);
      showSnackbar({ message: t("saved", { name: values.name.trim() }) });
      return;
    }
    setInvalid(result.status === "invalid" ? result.fields : []);
    setProblem(
      result.status === "invalid"
        ? t("errors.summary")
        : result.status === "forbidden" || result.status === "not_found"
          ? t(`errors.${result.status}`)
          : t("errors.error"),
    );
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  return (
    <>
      <Button
        component={Link}
        href={`/${amapSlug}/admin/producteurs`}
        nativeButton={false}
        startIcon={<ArrowBack />}
        sx={{ mb: 2 }}
      >
        {tp("back")}
      </Button>
      <Typography variant="h1" gutterBottom>
        {producer.name}
      </Typography>

      <Stack spacing={6} sx={{ maxWidth: 720 }}>
        <Box component="form" onSubmit={(e) => void save(e)} noValidate>
          <Box ref={summaryRef} tabIndex={-1} sx={{ mb: problem ? 2 : 0 }}>
            {problem && <Alert severity="error">{problem}</Alert>}
          </Box>
          <ProducerFields values={values} onChange={setValues} invalid={invalid} />
          <Box sx={{ mt: 1 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  slotProps={{ input: { "aria-describedby": "active-help" } }}
                />
              }
              label={t("active")}
            />
            <FormHelperText id="active-help" sx={{ mt: -0.5, ml: 4 }}>
              {t("activeHelp")}
            </FormHelperText>
          </Box>
          <Button type="submit" variant="contained" disabled={pending} sx={{ mt: 3 }}>
            {t("save")}
          </Button>
        </Box>

        <ReferentsForm amapSlug={amapSlug} producer={producer} candidates={candidates} />

        <ProducerAccessSection amapSlug={amapSlug} producer={producer} />
      </Stack>
    </>
  );
}

/** Référents du producteur : une case par personne qui a le rôle référent. */
function ReferentsForm({
  amapSlug,
  producer,
  candidates,
}: {
  amapSlug: string;
  producer: AmapProducerDetail;
  candidates: ReferentView[];
}) {
  const t = useTranslations("Admin.producerForm");
  const tp = useTranslations("Admin.producers");
  const showSnackbar = useSnackbar();
  const [selected, setSelected] = useState<string[]>(producer.referents.map((r) => r.userId));
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const toggle = (userId: string, checked: boolean) =>
    setSelected((current) =>
      checked ? [...current, userId] : current.filter((id) => id !== userId),
    );

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    const result = await setProducerReferentsAction(amapSlug, {
      amapProducerId: producer.id,
      userIds: selected,
    });
    setPending(false);
    if (result.status === "saved") {
      setProblem(null);
      showSnackbar({ message: t("referentsSaved", { name: producer.name }) });
      return;
    }
    setProblem(
      result.status === "not_referent"
        ? t("notReferent")
        : result.status === "forbidden"
          ? t("errors.forbidden")
          : t("errors.error"),
    );
  };

  return (
    <Box
      component="form"
      onSubmit={(e) => void save(e)}
      noValidate
      aria-labelledby="referents-title"
    >
      <Typography id="referents-title" variant="h2" sx={{ mb: 1 }}>
        {t("referentsTitle")}
      </Typography>
      {candidates.length === 0 ? (
        <Typography>{t("noCandidates")}</Typography>
      ) : (
        <>
          <Typography sx={{ mb: 1 }}>{t("referentsIntro")}</Typography>
          <FormGroup>
            {candidates.map((c) => (
              <FormControlLabel
                key={c.userId}
                control={
                  <Checkbox
                    checked={selected.includes(c.userId)}
                    onChange={(e) => toggle(c.userId, e.target.checked)}
                  />
                }
                label={fullName(c)}
              />
            ))}
          </FormGroup>
          {selected.length === 0 && producer.active && (
            <Typography variant="bodySmall" sx={{ color: "error.main", mt: 1 }}>
              {tp("noReferentHelp")}
            </Typography>
          )}
          <div role="status" aria-live="polite">
            {problem && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {problem}
              </Alert>
            )}
          </div>
          <Button type="submit" variant="contained" disabled={pending} sx={{ mt: 2 }}>
            {t("saveReferents")}
          </Button>
        </>
      )}
    </Box>
  );
}
