import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import { useTranslations } from "next-intl";

import { visuallyHidden } from "../visually-hidden";

/**
 * Squelette de chargement : la forme de la page apparaît tout de suite, plutôt qu'un écran blanc.
 * Utilisé par les fichiers loading.tsx des espaces connectés.
 */
export function PageSkeleton() {
  const t = useTranslations("Common");
  return (
    <Box role="status" aria-live="polite">
      <Box component="span" sx={visuallyHidden}>
        {t("loading")}
      </Box>
      <Stack spacing={2} aria-hidden>
        <Skeleton variant="text" width="60%" sx={{ fontSize: "2rem" }} />
        <Skeleton variant="rounded" height={96} sx={{ borderRadius: 4 }} />
        <Skeleton variant="rounded" height={96} sx={{ borderRadius: 4 }} />
        <Skeleton variant="rounded" height={96} sx={{ borderRadius: 4 }} />
      </Stack>
    </Box>
  );
}
