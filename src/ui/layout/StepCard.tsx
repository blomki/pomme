import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useId, type ReactNode } from "react";

import { m3 } from "../theme/create-theme";

/**
 * Carte d'étape numérotée (charte du 2026-11-26) : pastille ronde avec le numéro, titre, contenu.
 * Section nommée par son titre pour les lecteurs d'écran.
 */
export function StepCard({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <Paper
      component="section"
      aria-labelledby={id}
      variant="outlined"
      sx={{ borderRadius: "16px", borderColor: m3("outlineVariant"), px: 3, py: 2.5 }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 2 }}>
        <Box
          aria-hidden
          sx={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: m3("secondaryContainer"),
            color: m3("onSecondaryContainer"),
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {step}
        </Box>
        <Typography id={id} variant="titleMedium" component="h2">
          {title}
        </Typography>
      </Stack>
      {children}
    </Paper>
  );
}
