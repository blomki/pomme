"use client";

import FormatBold from "@mui/icons-material/FormatBold";
import FormatItalic from "@mui/icons-material/FormatItalic";
import FormatListBulleted from "@mui/icons-material/FormatListBulleted";
import FormatListNumbered from "@mui/icons-material/FormatListNumbered";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import InsertLink from "@mui/icons-material/InsertLink";
import Title from "@mui/icons-material/Title";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormLabel from "@mui/material/FormLabel";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Image from "@tiptap/extension-image";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { ACCEPTED_IMAGE_TYPES, MAX_ALT_LENGTH } from "@/domain/images";
import { isSafeHref, toEditorJson, type RichDoc } from "@/domain/pages";

import { m3 } from "../theme/create-theme";

/**
 * Éditeur du texte d'une page (story H2), avec Tiptap : gras, italique, intertitre, listes, lien,
 * photo. Seuls ces éléments sont activés ; le serveur nettoie de toute façon le document
 * (cleanRichText) avant de l'enregistrer. Utilisable au clavier : barre d'outils de vrais
 * boutons (état « enfoncé » annoncé), raccourcis habituels (Ctrl+B, Ctrl+I).
 */
export function RichTextEditor({
  labelId,
  value,
  onChange,
  onUploadImage,
  imagesEnabled,
}: {
  /** Identifiant de l'étiquette « Texte », qui nomme la zone de saisie. */
  labelId: string;
  /** Texte enregistré (format nettoyé), converti pour l'éditeur. */
  value: RichDoc;
  /** Document au format de l'éditeur : le serveur le nettoie à l'enregistrement. */
  onChange: (json: unknown) => void;
  /** Envoie une photo ; renvoie son adresse, ou un message d'erreur. */
  onUploadImage: (file: File) => Promise<{ url: string } | { error: string }>;
  imagesEnabled: boolean;
}) {
  const t = useTranslations("Admin.pages.editor");
  const editor = useEditor({
    // Rendu côté serveur : l'éditeur ne se dessine qu'une fois dans le navigateur.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: { openOnClick: false, autolink: true, isAllowedUri: (url) => isSafeHref(url) },
      }),
      Image,
    ],
    content: toEditorJson(value),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
        class: "pomme-editeur",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getJSON()),
  });

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        "&:focus-within": { borderColor: "primary.main", outline: 1, outlineColor: "primary.main" },
      }}
    >
      {editor && (
        <Toolbar editor={editor} onUploadImage={onUploadImage} imagesEnabled={imagesEnabled} />
      )}
      <Box
        sx={{
          px: 2,
          py: 1,
          minHeight: 240,
          typography: "bodyLarge",
          "& .pomme-editeur": { outline: "none", minHeight: 220 },
          "& .pomme-editeur h2": { typography: "headlineSmall", mt: 2, mb: 1 },
          "& .pomme-editeur h3": { typography: "titleLarge", mt: 2, mb: 1 },
          "& .pomme-editeur img": { maxWidth: "100%", height: "auto", borderRadius: 1 },
          "& .pomme-editeur a": { color: "primary.main" },
          "& .pomme-editeur img.ProseMirror-selectednode": {
            outline: 3,
            outlineStyle: "solid",
            outlineColor: m3("primary"),
          },
        }}
      >
        <EditorContent editor={editor} />
        {!editor && <Box sx={{ color: "text.secondary" }}>{t("loading")}</Box>}
      </Box>
    </Box>
  );
}

function Toolbar({
  editor,
  onUploadImage,
  imagesEnabled,
}: {
  editor: Editor;
  onUploadImage: (file: File) => Promise<{ url: string } | { error: string }>;
  imagesEnabled: boolean;
}) {
  const t = useTranslations("Admin.pages.editor");
  const [dialog, setDialog] = useState<"link" | "image" | null>(null);
  // Relit l'état des boutons à chaque changement de sélection.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      heading: e.isActive("heading", { level: 2 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      link: e.isActive("link"),
    }),
  });

  const button = (
    key: keyof typeof state,
    label: string,
    icon: React.ReactNode,
    run: () => void,
  ) => (
    <Tooltip title={label}>
      <IconButton
        aria-label={label}
        aria-pressed={state[key]}
        onClick={run}
        size="small"
        sx={
          state[key] ? { bgcolor: m3("secondaryContainer"), color: m3("onSecondaryContainer") } : {}
        }
      >
        {icon}
      </IconButton>
    </Tooltip>
  );

  return (
    <>
      <Stack
        role="toolbar"
        aria-label={t("toolbar")}
        direction="row"
        sx={{ gap: 0.5, p: 0.5, borderBottom: 1, borderColor: "divider", flexWrap: "wrap" }}
      >
        {button("bold", t("bold"), <FormatBold />, () => editor.chain().focus().toggleBold().run())}
        {button("italic", t("italic"), <FormatItalic />, () =>
          editor.chain().focus().toggleItalic().run(),
        )}
        {button("heading", t("heading"), <Title />, () =>
          editor.chain().focus().toggleHeading({ level: 2 }).run(),
        )}
        {button("bullet", t("bulletList"), <FormatListBulleted />, () =>
          editor.chain().focus().toggleBulletList().run(),
        )}
        {button("ordered", t("orderedList"), <FormatListNumbered />, () =>
          editor.chain().focus().toggleOrderedList().run(),
        )}
        {button("link", t("link"), <InsertLink />, () => setDialog("link"))}
        <Tooltip title={t("image")}>
          <span>
            <IconButton
              aria-label={t("image")}
              onClick={() => setDialog("image")}
              size="small"
              disabled={!imagesEnabled}
            >
              <ImageOutlined />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      {dialog === "link" && <LinkDialog editor={editor} onClose={() => setDialog(null)} />}
      {dialog === "image" && (
        <ImageDialog editor={editor} onUpload={onUploadImage} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

/** Ajoute, change ou retire le lien du texte sélectionné. */
function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const t = useTranslations("Admin.pages.editor");
  const current = (editor.getAttributes("link").href as string | undefined) ?? "";
  const [href, setHref] = useState(current);
  const [error, setError] = useState(false);
  const close = () => {
    onClose();
    editor.commands.focus();
  };
  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    const value = href.trim();
    if (value === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return onClose();
    }
    // Une adresse sans protocole (« exemple.org ») est complétée en https.
    const url = /^[a-z]+:|^\//i.test(value) ? value : `https://${value}`;
    if (!isSafeHref(url)) return setError(true);
    const chain = editor.chain().focus().extendMarkRange("link");
    if (editor.state.selection.empty && !editor.isActive("link")) {
      chain
        .insertContent({
          type: "text",
          text: value,
          marks: [{ type: "link", attrs: { href: url } }],
        })
        .run();
    } else {
      chain.setLink({ href: url }).run();
    }
    onClose();
  };
  return (
    <Dialog open onClose={close} aria-labelledby="lien-titre" fullWidth maxWidth="sm">
      <form onSubmit={apply} noValidate>
        <DialogTitle id="lien-titre">{t("linkTitle")}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            margin="dense"
            label={t("linkUrl")}
            value={href}
            onChange={(e) => {
              setHref(e.target.value);
              setError(false);
            }}
            error={error}
            helperText={error ? t("linkInvalid") : t("linkHelp")}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>{t("cancel")}</Button>
          <Button type="submit" variant="contained">
            {t("apply")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** Choisit une photo et sa description, l'envoie, puis l'insère dans le texte. */
function ImageDialog({
  editor,
  onUpload,
  onClose,
}: {
  editor: Editor;
  onUpload: (file: File) => Promise<{ url: string } | { error: string }>;
  onClose: () => void;
}) {
  const t = useTranslations("Admin.pages.editor");
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const close = () => {
    onClose();
    editor.commands.focus();
  };
  const insert = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return setError(t("imageMissing"));
    setPending(true);
    const result = await onUpload(file);
    setPending(false);
    if ("error" in result) return setError(result.error);
    editor.chain().focus().setImage({ src: result.url, alt: alt.trim() }).run();
    onClose();
  };
  return (
    <Dialog open onClose={close} aria-labelledby="photo-titre" fullWidth maxWidth="sm">
      <form onSubmit={(e) => void insert(e)} noValidate>
        <DialogTitle id="photo-titre">{t("imageTitle")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Box>
              <FormLabel
                htmlFor={`${id}-fichier`}
                sx={{ display: "block", mb: 0.5, color: "text.primary" }}
              >
                {t("imageFile")}
              </FormLabel>
              <Box
                component="input"
                id={`${id}-fichier`}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(",")}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFile(e.target.files?.[0] ?? null)
                }
                sx={{ font: "inherit", maxWidth: "100%" }}
              />
            </Box>
            <TextField
              label={t("imageAlt")}
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              helperText={t("imageAltHelp")}
              slotProps={{ htmlInput: { maxLength: MAX_ALT_LENGTH } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>{t("cancel")}</Button>
          <Button type="submit" variant="contained" disabled={pending}>
            {pending ? t("imageSending") : t("imageInsert")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
