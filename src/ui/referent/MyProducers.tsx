"use client";

import EditOutlined from "@mui/icons-material/EditOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { formatPhone } from "@/domain/phone";
import type { MyProducer } from "@/server/producers";
import { updateMyProducerAction } from "@/server/producers-actions";

import { ProducerFields, type ProducerFormValues } from "../admin/ProducerFields";
import { useSnackbar } from "../feedback/SnackbarProvider";

/**
 * « Mes producteurs » (écran R5) : un onglet par producteur suivi, avec ses coordonnées et
 * l'ordre de ses chèques. Le référent peut les modifier ; le catalogue viendra avec C3.
 */
export function MyProducers({
  amapSlug,
  producers,
}: {
  amapSlug: string;
  producers: MyProducer[];
}) {
  const t = useTranslations("Referent.producers");
  const [current, setCurrent] = useState(0);
  const [editing, setEditing] = useState<MyProducer | null>(null);
  const producer = producers[current] ?? producers[0];
  if (!producer) return null;

  return (
    <>
      <Tabs
        value={current}
        onChange={(_, index: number) => setCurrent(index)}
        aria-label={t("tabs")}
        variant="scrollable"
        // Les flèches ouvrent aussitôt l'onglet atteint : les panneaux sont déjà chargés.
        selectionFollowsFocus
        sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
      >
        {producers.map((p, index) => (
          <Tab
            key={p.id}
            label={p.name}
            id={`producer-tab-${index}`}
            aria-controls={`producer-panel-${index}`}
          />
        ))}
      </Tabs>

      <Box
        role="tabpanel"
        id={`producer-panel-${current}`}
        aria-labelledby={`producer-tab-${current}`}
        sx={{ display: "grid", gap: 3 }}
      >
        <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
          <Button
            startIcon={<EditOutlined />}
            onClick={() => setEditing(producer)}
            aria-label={t("editOf", { name: producer.name })}
          >
            {t("edit")}
          </Button>
        </Stack>
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            alignItems: "start",
          }}
        >
          <Paper
            variant="outlined"
            component="section"
            aria-labelledby="contact-title"
            sx={{ p: 3 }}
          >
            <Typography id="contact-title" variant="titleLarge" component="h2" sx={{ mb: 1.5 }}>
              {t("contact")}
            </Typography>
            <Stack spacing={0.5}>
              <Typography sx={{ fontWeight: 700 }}>{producer.name}</Typography>
              {producer.category && <Typography>{producer.category}</Typography>}
              {producer.phone ? (
                <MuiLink href={`tel:${producer.phone}`}>{formatPhone(producer.phone)}</MuiLink>
              ) : (
                <Typography sx={{ color: "text.secondary" }}>{t("noPhone")}</Typography>
              )}
              {producer.email ? (
                <MuiLink href={`mailto:${producer.email}`}>{producer.email}</MuiLink>
              ) : (
                <Typography sx={{ color: "text.secondary" }}>{t("noEmail")}</Typography>
              )}
            </Stack>
          </Paper>
          <Paper
            variant="outlined"
            component="section"
            aria-labelledby="cheques-title"
            sx={{ p: 3 }}
          >
            <Typography id="cheques-title" variant="titleLarge" component="h2" sx={{ mb: 1.5 }}>
              {t("cheques")}
            </Typography>
            <Stack spacing={0.5}>
              <Typography variant="bodySmall" sx={{ color: "text.secondary" }}>
                {t("payee")}
              </Typography>
              <Typography sx={{ fontWeight: 700 }}>
                {producer.checkPayee || t("noPayee")}
              </Typography>
              {producer.distanceKm !== null && (
                <Typography>{t("distance", { km: producer.distanceKm })}</Typography>
              )}
            </Stack>
          </Paper>
        </Box>
        <Box>
          <Button
            variant="outlined"
            component={Link}
            nativeButton={false}
            href={`/${amapSlug}/referent/catalogue?producteur=${producer.id}`}
          >
            {t("catalogueSoon")}
          </Button>
        </Box>
      </Box>

      {editing && (
        <EditProducerDialog
          key={editing.id}
          amapSlug={amapSlug}
          producer={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function EditProducerDialog({
  amapSlug,
  producer,
  onClose,
}: {
  amapSlug: string;
  producer: MyProducer;
  onClose: () => void;
}) {
  const t = useTranslations("Referent.producers");
  const tf = useTranslations("Admin.producerForm");
  const showSnackbar = useSnackbar();
  const [values, setValues] = useState<ProducerFormValues>({
    name: producer.name,
    category: producer.category,
    shortDescription: producer.shortDescription,
    description: producer.description,
    phone: producer.phone ?? "",
    email: producer.email ?? "",
    checkPayee: producer.checkPayee,
    distanceKm: "",
  });
  const [invalid, setInvalid] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    // La distance n'est pas envoyée : seul l'admin la règle.
    const result = await updateMyProducerAction(amapSlug, {
      amapProducerId: producer.id,
      name: values.name,
      category: values.category,
      shortDescription: values.shortDescription,
      description: values.description,
      phone: values.phone,
      email: values.email,
      checkPayee: values.checkPayee,
    });
    setPending(false);
    if (result.status === "saved") {
      showSnackbar({ message: t("saved", { name: values.name.trim() }) });
      onClose();
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
  };

  return (
    <Dialog open onClose={onClose} aria-labelledby="edit-producer-title" fullWidth maxWidth="md">
      <form onSubmit={(e) => void save(e)} noValidate>
        <DialogTitle id="edit-producer-title">
          {t("dialogTitle", { name: producer.name })}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>{t("dialogIntro")}</DialogContentText>
          {problem && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {problem}
            </Alert>
          )}
          <ProducerFields
            values={values}
            onChange={setValues}
            invalid={invalid}
            withDistance={false}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("cancel")}</Button>
          <Button type="submit" variant="contained" disabled={pending}>
            {t("save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
