"use client";

import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import SendOutlined from "@mui/icons-material/SendOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
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
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

import {
  bodyParagraphs,
  canSend,
  checkTags,
  EMAIL_TAGS,
  EMAIL_TEMPLATES,
  insertTag,
  renderTags,
  type EmailTag,
  type EmailTemplate,
} from "@/domain/email-tags";
import { formatDate } from "@/i18n/dates";
import { sendGroupEmailAction, sendTestEmailAction } from "@/server/group-emails-actions";
import type { ComposerView } from "@/server/group-emails";

import { ConfirmDialog } from "../feedback/ConfirmDialog";
import { useSnackbar } from "../feedback/SnackbarProvider";
import { SectionTitle } from "../layout/SectionTitle";
import { StepCard } from "../layout/StepCard";
import { m3 } from "../theme/create-theme";

type Audience = "all_members" | "producer_customers";
type Field = "subject" | "body";

/**
 * « Envoyer un email » (écran A9, story H1) : 1 destinataires, 2 message (modèle, objet,
 * message, balises), 3 aperçu personnalisé ; test à soi-même, envoi avec confirmation ;
 * historique des envois, y compris les envois automatiques.
 */
export function GroupEmail({ amapSlug, view }: { amapSlug: string; view: ComposerView }) {
  const t = useTranslations("Admin.emails");
  const showSnackbar = useSnackbar();
  const router = useRouter();
  const [audience, setAudience] = useState<Audience>("all_members");
  const [producerId, setProducerId] = useState(view.producers[0]?.id ?? "");
  const [template, setTemplate] = useState<EmailTemplate>("free");
  const [subject, setSubject] = useState(t.raw("templates.free.subject") as string);
  const [body, setBody] = useState(t.raw("templates.free.body") as string);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Objet vide signalé seulement une fois le champ touché (le modèle libre n'en a pas).
  const [subjectTouched, setSubjectTouched] = useState(false);
  const [pending, startTransition] = useTransition();
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<Field>("body");

  const producer = view.producers.find((p) => p.id === producerId) ?? null;
  const recipients = audience === "all_members" ? view.members : (producer?.recipients ?? []);
  const households = new Set(recipients.map((r) => r.householdId)).size;
  const viewer = recipients.find((r) => r.userId === viewerId) ?? recipients[0] ?? null;
  const values = useMemo(
    () => ({
      ...view.dateValues,
      ...(audience === "producer_customers" && producer ? { producteur: producer.name } : {}),
    }),
    [view.dateValues, audience, producer],
  );
  const check = checkTags({ subject, body, audience, values });
  const sendable = canSend(subject, check) && recipients.length > 0;
  const personal = viewer ? { ...values, prenom: viewer.firstName, nom: viewer.lastName } : values;
  const input = {
    audience,
    producerId: audience === "producer_customers" ? producerId : null,
    subject,
    body,
  };

  const chooseTemplate = (key: EmailTemplate) => {
    setTemplate(key);
    setSubject(t.raw(`templates.${key}.subject`) as string);
    setBody(t.raw(`templates.${key}.body`) as string);
  };

  const insert = (tag: EmailTag) => {
    const field = lastField.current;
    const element = field === "subject" ? subjectRef.current : bodyRef.current;
    const text = field === "subject" ? subject : body;
    const result = insertTag(text, element?.selectionStart ?? text.length, tag);
    (field === "subject" ? setSubject : setBody)(result.text);
    // Curseur remis juste après la balise, dans le champ.
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(result.cursor, result.cursor);
    });
  };

  const refusal = (status: string) => showSnackbar({ message: t(`refused_${status}`) });

  const sendTest = () =>
    startTransition(async () => {
      const result = await sendTestEmailAction(amapSlug, input, viewer?.userId ?? null);
      if (result.status === "sent") showSnackbar({ message: t("testSent", { email: result.to }) });
      else refusal(result.status);
    });

  const send = () =>
    startTransition(async () => {
      setConfirming(false);
      const result = await sendGroupEmailAction(amapSlug, input);
      if (result.status !== "sent") {
        refusal(result.status);
        return;
      }
      showSnackbar({
        message:
          result.failed > 0
            ? t("sentWithFailures", { failed: result.failed })
            : t("sent", { count: result.sent }),
      });
      router.refresh();
    });

  const tags = EMAIL_TAGS.filter(
    (tag) => tag !== "producteur" || audience === "producer_customers",
  );

  return (
    <Stack spacing={4}>
      <Box
        sx={{
          display: "grid",
          gap: 3,
          gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1fr) minmax(0, 1fr)" },
          alignItems: "start",
        }}
      >
        <Stack spacing={3}>
          <StepCard step={1} title={t("step1")}>
            <RadioGroup
              aria-label={t("audienceLegend")}
              value={audience}
              onChange={(e) => setAudience(e.target.value as Audience)}
            >
              <Stack spacing={1.5}>
                {(["all_members", "producer_customers"] as const).map((value) => {
                  const selected = audience === value;
                  return (
                    <Paper
                      key={value}
                      variant="outlined"
                      sx={{
                        borderRadius: "16px",
                        px: 2,
                        py: 1.5,
                        borderColor: selected ? m3("secondary") : m3("outlineVariant"),
                        bgcolor: selected ? m3("secondaryContainer") : "transparent",
                        color: selected ? m3("onSecondaryContainer") : undefined,
                      }}
                    >
                      <Box
                        component="label"
                        sx={{ display: "flex", alignItems: "center", gap: 1, cursor: "pointer" }}
                      >
                        <Radio value={value} />
                        <span>
                          <Typography component="span" sx={{ fontWeight: 500 }}>
                            {value === "all_members" ? t("allMembers") : t("producerCustomers")}
                          </Typography>
                          <Typography component="span" variant="bodySmall">
                            {" · "}
                            {value === "all_members"
                              ? t("allMembersHint")
                              : t("producerCustomersHint")}
                          </Typography>
                        </span>
                      </Box>
                      {value === "producer_customers" && selected && (
                        <Box sx={{ pl: 5, pt: 1 }}>
                          <TextField
                            id="email-producteur"
                            select
                            size="small"
                            label={t("producerLabel")}
                            value={producerId}
                            onChange={(e) => setProducerId(e.target.value)}
                            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                            fullWidth
                          >
                            {view.producers.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </TextField>
                          {producer?.category && (
                            <Typography variant="bodySmall" component="p" sx={{ mt: 0.5 }}>
                              {producer.category}
                            </Typography>
                          )}
                        </Box>
                      )}
                    </Paper>
                  );
                })}
              </Stack>
            </RadioGroup>
            <Typography sx={{ mt: 2, fontWeight: 500 }} role="status" aria-live="polite">
              {t("count", { recipients: recipients.length, households })}
            </Typography>
            <Typography variant="bodySmall" color="text.secondary">
              {t("countHelp")}
            </Typography>
          </StepCard>

          <StepCard step={2} title={t("step2")}>
            <Stack spacing={2}>
              <TextField
                id="email-modele"
                select
                label={t("templateLabel")}
                value={template}
                onChange={(e) => chooseTemplate(e.target.value as EmailTemplate)}
                helperText={t("templateHelp")}
                slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              >
                {EMAIL_TEMPLATES.map((key) => (
                  <option key={key} value={key}>
                    {t(`template.${key}`)}
                  </option>
                ))}
              </TextField>
              <TextField
                id="email-objet"
                label={t("subjectLabel")}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onFocus={() => (lastField.current = "subject")}
                inputRef={subjectRef}
                onBlur={() => setSubjectTouched(true)}
                required
                error={subjectTouched && subject.trim() === ""}
                helperText={subject.trim() === "" ? t("noSubject") : " "}
              />
              <TextField
                id="email-message"
                label={t("bodyLabel")}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onFocus={() => (lastField.current = "body")}
                inputRef={bodyRef}
                multiline
                rows={10}
              />
              <Box component="fieldset" sx={{ border: 0, m: 0, p: 0 }}>
                <Typography component="legend" variant="bodySmall" sx={{ mb: 1 }}>
                  {t("tagsLabel")}
                </Typography>
                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75 }}>
                  {tags.map((tag) => (
                    <Chip
                      key={tag}
                      label={`{{${tag}}}`}
                      size="small"
                      variant="outlined"
                      onClick={() => insert(tag)}
                      // Garde le curseur du champ : le clic ne lui retire pas le focus avant l'insertion.
                      onMouseDown={(e) => e.preventDefault()}
                      aria-label={t("insertTag", { tag: `{{${tag}}}` })}
                      sx={{ fontFamily: "monospace" }}
                    />
                  ))}
                </Stack>
              </Box>
              {check.unknown.length > 0 && (
                <Alert severity="warning">
                  {t("warnUnknown", { tags: check.unknown.map((x) => `{{${x}}}`).join(", ") })}
                </Alert>
              )}
              {check.producerOutside && <Alert severity="error">{t("warnProducer")}</Alert>}
              {check.missing.includes("orderPeriod") && (
                <Alert severity="error">{t("warnOrderPeriod")}</Alert>
              )}
              {check.missing.includes("dutyPeriod") && (
                <Alert severity="error">{t("warnDutyPeriod")}</Alert>
              )}
            </Stack>
          </StepCard>
        </Stack>

        <StepCard step={3} title={t("step3")}>
          {viewer ? (
            <Stack spacing={2}>
              <TextField
                id="email-vu-par"
                select
                size="small"
                label={t("viewerLabel")}
                value={viewer.userId}
                onChange={(e) => setViewerId(e.target.value)}
                slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              >
                {recipients.map((r) => (
                  <option key={r.userId} value={r.userId}>
                    {`${r.firstName} ${r.lastName}`.trim()}
                  </option>
                ))}
              </TextField>
              <Box sx={{ fontSize: 14 }}>
                <div>
                  <strong>{t("from")} :</strong> {view.amap.name} · {view.sender}
                </div>
                <div>
                  <strong>{t("to")} :</strong> {`${viewer.firstName} ${viewer.lastName}`.trim()}{" "}
                  &lt;{viewer.email}&gt;
                </div>
              </Box>
              <Paper
                variant="outlined"
                sx={{ borderRadius: "16px", overflow: "hidden", borderColor: m3("outlineVariant") }}
              >
                <Box sx={{ px: 2.5, py: 1.5, bgcolor: m3("secondary"), color: m3("onSecondary") }}>
                  <Typography sx={{ fontWeight: 700 }}>{view.amap.name}</Typography>
                </Box>
                <Box sx={{ px: 2.5, py: 2 }}>
                  <Typography variant="titleMedium" component="p" sx={{ mb: 1.5 }}>
                    {renderTags(subject, personal) || "—"}
                  </Typography>
                  {bodyParagraphs(renderTags(body, personal)).map((p, i) => (
                    <Typography key={i} sx={{ mb: 1.5, whiteSpace: "pre-line" }}>
                      {p}
                    </Typography>
                  ))}
                </Box>
                <Box sx={{ px: 2.5, py: 1.5, bgcolor: m3("surfaceContainer") }}>
                  <Typography variant="bodySmall" component="p">
                    {t("footer", { amap: view.amap.name })}{" "}
                    <Box component="span" sx={{ textDecoration: "underline" }}>
                      {t("spaceLink")}
                    </Box>
                  </Typography>
                </Box>
              </Paper>
            </Stack>
          ) : (
            <Typography>{t("noRecipient")}</Typography>
          )}
          <Stack
            direction="row"
            sx={{ mt: 3, flexWrap: "wrap", gap: 1.5, justifyContent: "flex-end" }}
          >
            <Button variant="outlined" onClick={sendTest} disabled={pending || !sendable}>
              {t("sendTest")}
            </Button>
            <Button
              variant="contained"
              startIcon={<SendOutlined />}
              onClick={() => setConfirming(true)}
              disabled={pending || !sendable}
            >
              {t("send", { count: recipients.length })}
            </Button>
          </Stack>
        </StepCard>
      </Box>

      <Box component="section" aria-labelledby="historique">
        <SectionTitle
          id="historique"
          title={t("historyTitle")}
          count={t("historyCount", { count: view.history.length })}
        />
        {view.history.length === 0 ? (
          <Typography>{t("historyEmpty")}</Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table aria-label={t("historyLabel")} sx={{ minWidth: 720 }}>
              <TableHead>
                <TableRow>
                  <TableCell scope="col">{t("colDate")}</TableCell>
                  <TableCell scope="col">{t("colSubject")}</TableCell>
                  <TableCell scope="col">{t("colRecipients")}</TableCell>
                  <TableCell scope="col">{t("colAuthor")}</TableCell>
                  <TableCell scope="col">{t("colStatus")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {view.history.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {formatDate(c.sentAt, "d MMM yyyy, HH'h'mm")}
                    </TableCell>
                    <TableCell component="th" scope="row">
                      {c.subject}
                    </TableCell>
                    <TableCell>
                      {t(`audience.${c.audience}`, {
                        count: c.recipientCount,
                        producer: c.producerName ?? "",
                      })}
                    </TableCell>
                    <TableCell>
                      {c.automatic
                        ? c.author
                          ? t("automatic", { author: c.author })
                          : t("automaticUnknown")
                        : (c.author ?? "—")}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        icon={c.failed > 0 ? <WarningAmberOutlined /> : <CheckCircleOutlined />}
                        label={
                          c.failed > 0 ? t("failures", { count: c.failed }) : t("allDelivered")
                        }
                        sx={{
                          bgcolor:
                            c.failed > 0 ? m3("tertiaryContainer") : m3("secondaryContainer"),
                          color:
                            c.failed > 0 ? m3("onTertiaryContainer") : m3("onSecondaryContainer"),
                          "& .MuiChip-icon": { color: "inherit" },
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      <ConfirmDialog
        open={confirming}
        icon={<SendOutlined />}
        title={t("confirmTitle")}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
        onConfirm={send}
        onClose={() => setConfirming(false)}
        pending={pending}
      >
        {t("confirmText", { subject, recipients: recipients.length, households })}
      </ConfirmDialog>
    </Stack>
  );
}
