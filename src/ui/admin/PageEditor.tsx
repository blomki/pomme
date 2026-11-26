"use client";

import ArrowBack from "@mui/icons-material/ArrowBack";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { ACCEPTED_IMAGE_TYPES } from "@/domain/images";
import { PAGE_LIMITS, shareTexts, suggestPageSlug, type RichDoc } from "@/domain/pages";
import type { PageEditView, SavePageProblem } from "@/server/pages";
import { savePageAction, uploadPageImageAction } from "@/server/pages-actions";

import { useSnackbar } from "../feedback/SnackbarProvider";
import { RichTextEditor } from "../pages/RichTextEditor";
import { m3 } from "../theme/create-theme";

import { PageStatusChip } from "./PagesList";
import { PageBanner } from "../layout/PageBanner";

type Intent = "save" | "publish" | "unpublish";

/**
 * Éditeur d'une page du site (story H2, écran A7) : titre, résumé, image principale, texte,
 * partage et référencement ; à droite, la publication (page parente, adresse, menu, ordre des
 * sous-pages, date) et les boutons Publier / Enregistrer / Dépublier.
 */
export function PageEditor({
  amapSlug,
  siteAddress,
  page,
  imagesEnabled,
}: {
  amapSlug: string;
  siteAddress: string;
  page: PageEditView;
  imagesEnabled: boolean;
}) {
  const t = useTranslations("Admin.pages");
  const te = useTranslations("Admin.pages.editor");
  const tb = useTranslations("Banners");
  const router = useRouter();
  const showSnackbar = useSnackbar();
  const id = useId();
  const [values, setValues] = useState({
    title: page.title,
    slug: page.slug,
    summary: page.summary,
    imageUrl: page.imageUrl,
    imageAlt: page.imageAlt,
    parentId: page.parent?.id ?? "",
    inMenu: page.inMenu,
    childrenOrder: page.childrenOrder,
    publishedOn: page.publishedOn ?? "",
    ogTitle: page.ogTitle,
    ogDescription: page.ogDescription,
  });
  const [body, setBody] = useState<unknown>(null);
  // L'adresse suit le titre tant qu'on ne l'a pas changée et que la page n'a jamais été publiée.
  const [slugTouched, setSlugTouched] = useState(Boolean(page.id && page.publishedOn));
  const [problems, setProblems] = useState<SavePageProblem[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const isHome = page.role === "home";
  const isTop = page.role !== null || values.parentId === "";
  const parent = page.parents.find((p) => p.id === values.parentId) ?? page.parent;
  const prefix = `${siteAddress}/${isTop ? "" : `${parent?.slug ?? "…"}/`}`;

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((v) => ({
      ...v,
      [key]: value,
      ...(key === "title" && !slugTouched ? { slug: suggestPageSlug(String(value)) } : {}),
    }));
  const problemOf = (field: string) => problems.find((p) => p.field === field);
  const helper = (field: string, fallback?: string) => {
    const problem = problemOf(field);
    return problem ? te(`problems.${problem.problem}`) : fallback;
  };

  const uploadImage = async (file: File): Promise<{ url: string } | { error: string }> => {
    const form = new FormData();
    form.set("photo", file);
    const result = await uploadPageImageAction(amapSlug, form);
    return result.status === "saved"
      ? { url: result.url }
      : { error: te(`imageErrors.${result.status}`) };
  };

  const submit = async (intent: Intent) => {
    setPending(true);
    const result = await savePageAction(amapSlug, {
      ...(page.id ? { pageId: page.id } : {}),
      parentId: values.parentId || null,
      title: values.title,
      slug: values.slug,
      summary: values.summary,
      body: body ?? page.body,
      imageUrl: values.imageUrl,
      imageAlt: values.imageAlt,
      inMenu: values.inMenu,
      childrenOrder: values.childrenOrder,
      publishedOn: values.publishedOn || null,
      ogTitle: values.ogTitle,
      ogDescription: values.ogDescription,
      intent,
    });
    setPending(false);
    if (result.status === "saved") {
      setProblems([]);
      setSummary(null);
      showSnackbar({
        message: t(
          intent === "publish" ? "published" : intent === "unpublish" ? "unpublished" : "saved",
        ),
      });
      if (!page.id) router.push(`/${amapSlug}/admin/pages/${result.pageId}`);
      else router.refresh();
      return;
    }
    setProblems(result.status === "invalid" ? result.problems : []);
    setSummary(
      result.status === "slug_taken"
        ? te("slugTaken")
        : result.status === "forbidden"
          ? t("error")
          : te("fixErrors"),
    );
    if (result.status === "slug_taken") setProblems([{ field: "slug", problem: "required" }]);
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  const share = shareTexts({
    title: values.title,
    summary: values.summary,
    ogTitle: values.ogTitle,
    ogDescription: values.ogDescription,
    body: page.body as RichDoc,
  });

  return (
    <Stack spacing={3}>
      <Box>
        <Button
          component={Link}
          nativeButton={false}
          href={`/${amapSlug}/admin/pages`}
          startIcon={<ArrowBack />}
          sx={{ ml: -1 }}
        >
          {t("title")}
        </Button>
      </Box>
      <PageBanner title={page.id ? te("editTitle") : te("newTitle")}>{tb("pageEditor")}</PageBanner>
      {page.id && (
        <Box>
          <PageStatusChip status={page.status} />
        </Box>
      )}

      {summary && (
        <Alert severity="error" ref={summaryRef} tabIndex={-1}>
          {summary}
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gap: 3,
          gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1fr) 320px" },
          alignItems: "start",
        }}
      >
        <Stack spacing={3}>
          <TextField
            label={te("title")}
            value={values.title}
            onChange={(e) => set("title", e.target.value)}
            required
            error={Boolean(problemOf("title"))}
            helperText={helper("title")}
            slotProps={{ htmlInput: { maxLength: PAGE_LIMITS.title } }}
          />
          <TextField
            label={te("summary")}
            value={values.summary}
            onChange={(e) => set("summary", e.target.value)}
            multiline
            minRows={2}
            error={Boolean(problemOf("summary"))}
            helperText={helper("summary", te("summaryHelp"))}
            slotProps={{ htmlInput: { maxLength: PAGE_LIMITS.summary } }}
          />

          <Box component="section" aria-labelledby={`${id}-image`}>
            <Typography id={`${id}-image`} variant="titleMedium" component="h2" sx={{ mb: 1 }}>
              {te("mainImage")}
            </Typography>
            {imageError && (
              <Alert severity="error" sx={{ mb: 1 }}>
                {imageError}
              </Alert>
            )}
            <Stack
              direction={{ xs: "column", sm: "row" }}
              sx={{ gap: 2, alignItems: "flex-start" }}
            >
              <Box
                sx={{
                  width: 200,
                  height: 130,
                  flexShrink: 0,
                  borderRadius: 2,
                  overflow: "hidden",
                  bgcolor: m3("surfaceContainerHigh"),
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {values.imageUrl ? (
                  <Box
                    component="img"
                    src={values.imageUrl}
                    alt={values.imageAlt}
                    sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <Typography variant="bodySmall" color="text.secondary">
                    {te("noImage")}
                  </Typography>
                )}
              </Box>
              <Stack spacing={1.5} sx={{ flex: 1, width: "100%" }}>
                <Box>
                  <FormLabel
                    htmlFor={`${id}-fichier`}
                    sx={{ display: "block", mb: 0.5, color: "text.primary" }}
                  >
                    {values.imageUrl ? te("replaceImage") : te("chooseImage")}
                  </FormLabel>
                  <Box
                    component="input"
                    id={`${id}-fichier`}
                    type="file"
                    accept={ACCEPTED_IMAGE_TYPES.join(",")}
                    disabled={!imagesEnabled || pending}
                    onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const result = await uploadImage(file);
                      if ("error" in result) setImageError(result.error);
                      else {
                        setImageError(null);
                        set("imageUrl", result.url);
                      }
                    }}
                    sx={{ font: "inherit", maxWidth: "100%" }}
                  />
                  {!imagesEnabled && (
                    <Typography
                      variant="bodySmall"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      {te("imagesUnavailable")}
                    </Typography>
                  )}
                </Box>
                {values.imageUrl && (
                  <>
                    <TextField
                      label={te("imageAlt")}
                      value={values.imageAlt}
                      onChange={(e) => set("imageAlt", e.target.value)}
                      helperText={helper("imageAlt", te("imageAltHelp"))}
                      error={Boolean(problemOf("imageAlt"))}
                      size="small"
                    />
                    <Box>
                      <Button color="error" onClick={() => set("imageUrl", null)}>
                        {te("removeImage")}
                      </Button>
                    </Box>
                  </>
                )}
              </Stack>
            </Stack>
          </Box>

          <Box>
            <Typography id={`${id}-texte`} variant="titleMedium" component="h2" sx={{ mb: 1 }}>
              {te("body")}
            </Typography>
            {problemOf("body") && (
              <Alert severity="error" sx={{ mb: 1 }}>
                {te("bodyInvalid")}
              </Alert>
            )}
            <RichTextEditor
              labelId={`${id}-texte`}
              value={page.body}
              onChange={setBody}
              onUploadImage={uploadImage}
              imagesEnabled={imagesEnabled}
            />
          </Box>

          <Paper
            variant="outlined"
            component="section"
            aria-labelledby={`${id}-partage`}
            sx={{ p: 2.5 }}
          >
            <Typography id={`${id}-partage`} variant="titleMedium" component="h2">
              {te("share")}
            </Typography>
            <Typography variant="bodySmall" color="text.secondary" sx={{ display: "block", mb: 2 }}>
              {te("shareHint")}
            </Typography>
            <Box
              sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}
            >
              <Stack spacing={2}>
                <TextField
                  label={te("ogTitle")}
                  value={values.ogTitle}
                  placeholder={values.title}
                  onChange={(e) => set("ogTitle", e.target.value)}
                  error={Boolean(problemOf("ogTitle"))}
                  helperText={helper("ogTitle")}
                  slotProps={{ htmlInput: { maxLength: PAGE_LIMITS.ogTitle } }}
                />
                <TextField
                  label={te("ogDescription")}
                  value={values.ogDescription}
                  placeholder={values.summary}
                  onChange={(e) => set("ogDescription", e.target.value)}
                  multiline
                  minRows={2}
                  error={Boolean(problemOf("ogDescription"))}
                  helperText={helper("ogDescription")}
                  slotProps={{ htmlInput: { maxLength: PAGE_LIMITS.ogDescription } }}
                />
              </Stack>
              {/* Aperçu de la carte d'un lien partagé. */}
              <Box
                role="figure"
                aria-label={te("sharePreview")}
                sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}
              >
                <Box sx={{ height: 110, bgcolor: m3("surfaceContainerHigh") }}>
                  {values.imageUrl && (
                    <Box
                      component="img"
                      src={values.imageUrl}
                      alt=""
                      sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  )}
                </Box>
                <Box sx={{ p: 1.5 }}>
                  <Typography variant="bodySmall" component="p" color="text.secondary">
                    {siteAddress.split("/")[0]}
                  </Typography>
                  <Typography variant="titleSmall" component="p">
                    {share.title || "…"}
                  </Typography>
                  <Typography variant="bodySmall" component="p" color="text.secondary">
                    {share.description}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Paper>
        </Stack>

        <Paper
          variant="outlined"
          component="aside"
          aria-labelledby={`${id}-publication`}
          sx={{ p: 2.5 }}
        >
          <Typography id={`${id}-publication`} variant="titleMedium" component="h2" sx={{ mb: 2 }}>
            {te("publication")}
          </Typography>
          <Stack spacing={2.5}>
            {page.role === null && !page.hasChildren && (
              <TextField
                select
                label={te("parent")}
                value={values.parentId}
                onChange={(e) => set("parentId", e.target.value)}
                error={Boolean(problemOf("parent"))}
                helperText={helper("parent", te("parentHelp"))}
              >
                <MenuItem value="">{te("noParent")}</MenuItem>
                {page.parents.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.title}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {!isHome && (
              <TextField
                label={te("slug")}
                value={values.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", e.target.value);
                }}
                required
                error={Boolean(problemOf("slug"))}
                helperText={
                  problemOf("slug") ? (summary ?? helper("slug")) : te("slugHelp", { prefix })
                }
                slotProps={{ htmlInput: { maxLength: PAGE_LIMITS.slug } }}
              />
            )}
            {isTop && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={values.inMenu}
                    onChange={(e) => set("inMenu", e.target.checked)}
                  />
                }
                label={te("inMenu")}
              />
            )}
            {isTop && page.role === null && (
              <TextField
                select
                label={te("childrenOrder")}
                value={values.childrenOrder}
                onChange={(e) =>
                  set("childrenOrder", e.target.value as typeof values.childrenOrder)
                }
              >
                <MenuItem value="date_desc">{te("orders.date_desc")}</MenuItem>
                <MenuItem value="manual">{te("orders.manual")}</MenuItem>
              </TextField>
            )}
            <TextField
              type="date"
              label={te("publishedOn")}
              value={values.publishedOn}
              onChange={(e) => set("publishedOn", e.target.value)}
              helperText={te("publishedOnHelp")}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Stack spacing={1}>
              {page.status !== "published" ? (
                <>
                  <Button
                    variant="contained"
                    disabled={pending}
                    onClick={() => void submit("publish")}
                  >
                    {te("publish")}
                  </Button>
                  <Button variant="outlined" disabled={pending} onClick={() => void submit("save")}>
                    {te("saveDraft")}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="contained"
                    disabled={pending}
                    onClick={() => void submit("save")}
                  >
                    {te("saveChanges")}
                  </Button>
                  <Button
                    component={Link}
                    nativeButton={false}
                    href={`/${amapSlug}${isHome ? "" : `/${isTop ? "" : `${parent?.slug}/`}${page.slug}`}`}
                    variant="outlined"
                  >
                    {te("viewPage")}
                  </Button>
                  {page.role === null && (
                    <Button
                      color="error"
                      disabled={pending}
                      onClick={() => void submit("unpublish")}
                    >
                      {te("unpublish")}
                    </Button>
                  )}
                </>
              )}
            </Stack>
          </Stack>
        </Paper>
      </Box>
    </Stack>
  );
}
