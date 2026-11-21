import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { Fragment, type ReactNode } from "react";

import type { RichBlock, RichDoc, RichInline } from "@/domain/pages";

/**
 * Affiche le texte d'une page (story H2), déjà nettoyé par le serveur (cleanRichText). Chaque
 * élément devient un composant React : jamais de HTML brut injecté dans la page. Les liens vers
 * un autre site s'ouvrent normalement (pas de nouvel onglet imposé), sans transmettre la page
 * d'origine.
 */
export function RichTextView({ doc }: { doc: RichDoc }) {
  return <Box sx={{ "& > * + *": { mt: 2 } }}>{doc.content.map(renderBlock)}</Box>;
}

function renderInline(item: RichInline, index: number): ReactNode {
  if (item.type === "hardBreak") return <br key={index} />;
  let node: ReactNode = item.text;
  for (const mark of item.marks ?? []) {
    if (mark.type === "bold") node = <strong>{node}</strong>;
    else if (mark.type === "italic") node = <em>{node}</em>;
    else {
      const external = /^https?:/i.test(mark.href);
      node = (
        <MuiLink href={mark.href} rel={external ? "noopener noreferrer nofollow" : undefined}>
          {node}
        </MuiLink>
      );
    }
  }
  return <Fragment key={index}>{node}</Fragment>;
}

function renderBlock(block: RichBlock, index: number): ReactNode {
  switch (block.type) {
    case "paragraph":
      return (
        <Typography key={index} variant="bodyLarge" component="p">
          {block.content.map(renderInline)}
        </Typography>
      );
    case "heading":
      return (
        <Typography
          key={index}
          variant={block.level === 2 ? "headlineSmall" : "titleLarge"}
          component={block.level === 2 ? "h2" : "h3"}
          sx={{ pt: 1 }}
        >
          {block.content.map(renderInline)}
        </Typography>
      );
    case "bulletList":
    case "orderedList":
      return (
        <Box
          key={index}
          component={block.type === "bulletList" ? "ul" : "ol"}
          sx={{ pl: 3, my: 0, "& li + li": { mt: 0.5 }, typography: "bodyLarge" }}
        >
          {block.content.map((item, i) => (
            <li key={i}>{item.content.map(renderBlock)}</li>
          ))}
        </Box>
      );
    case "image":
      return (
        <Box
          key={index}
          component="img"
          src={block.src}
          alt={block.alt}
          sx={{ display: "block", maxWidth: "100%", height: "auto", borderRadius: 2 }}
        />
      );
  }
}
