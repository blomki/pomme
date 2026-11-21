import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { listAmaps } from "@/server/amap";
import { LinkButton } from "@/ui/navigation/LinkButton";

// Espace du gestionnaire de la plateforme (story J1), réservé aux comptes is_platform_admin
// après la deuxième vérification (mise en page) : les AMAP, et « Créer une AMAP ».
export default async function PlatformHomePage() {
  const t = await getTranslations("Platform");
  const amaps = await listAmaps();
  return (
    <>
      <Stack
        direction="row"
        sx={{
          justifyContent: "space-between",
          alignItems: "center",
          gap: 2,
          mb: 3,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="h1">{t("title")}</Typography>
        <LinkButton href="/plateforme/amaps/nouvelle" variant="contained">
          {t("create")}
        </LinkButton>
      </Stack>
      <Paper
        variant="outlined"
        component="section"
        aria-labelledby="amaps"
        sx={{ p: 3, maxWidth: 820 }}
      >
        <Typography id="amaps" variant="h2" sx={{ mb: 1 }}>
          {t("amaps")}
        </Typography>
        {amaps.length === 0 ? (
          <Typography>{t("noAmap")}</Typography>
        ) : (
          <List>
            {amaps.map((a) => (
              <ListItem
                key={a.id}
                divider
                secondaryAction={
                  <LinkButton href={`/${a.slug}`} aria-label={`${t("open")} ${a.name}`}>
                    {t("open")}
                  </LinkButton>
                }
              >
                <ListItemText primary={a.name} secondary={`/${a.slug}`} />
              </ListItem>
            ))}
          </List>
        )}
      </Paper>
    </>
  );
}
