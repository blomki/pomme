import LeafOutlined from "@mui/icons-material/EnergySavingsLeafOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { m3 } from "../theme/create-theme";

/**
 * Titre de section hors carte (charte du 2026-11-26, story S14) : petite feuille décorative,
 * titre dans la police des titres de l'AMAP, puis un compteur en pastille (« 4 envois »).
 * Le titre est un vrai h2, à relier à sa section par `id` (aria-labelledby).
 */
export function SectionTitle({
  id,
  title,
  count,
}: {
  id: string;
  title: string;
  /** Texte du compteur, déjà formulé (« 4 envois ») ; absent : pas de pastille. */
  count?: string;
}) {
  return (
    <Stack direction="row" sx={{ alignItems: "center", gap: 1.5, mb: 1.5, flexWrap: "wrap" }}>
      <LeafOutlined aria-hidden sx={{ color: m3("secondary") }} />
      <Typography id={id} variant="headlineSmall" component="h2">
        {title}
      </Typography>
      {count && <Chip size="small" icon={<ScheduleOutlined />} label={count} />}
    </Stack>
  );
}
